import { addIcon, Plugin, WorkspaceLeaf, TFile, TFolder, normalizePath } from "obsidian";
import { EpubPluginSettings, EpubSettingTab, DEFAULT_SETTINGS } from "./EpubPluginSettings";
import { EpubView, EPUB_FILE_EXTENSION, ICON_EPUB, VIEW_TYPE_EPUB, ProgressStore } from "./EpubView";
import { parseEpubCfi64Link, normalizeProgressKey } from "./utils";

type BookProgress = {
  location: string | number;
  updatedAt: number;
};

type PluginDataV1 = {
  version: 1;
  settings: EpubPluginSettings;
  progress: Record<string, BookProgress>;
};

function isLikelyInEditor(target: HTMLElement): boolean {
  return Boolean(target.closest(".cm-editor, .markdown-source-view"));
}

function getHrefFromTarget(target: HTMLElement): string | null {
  const dataEl = target.closest("[data-href]") as HTMLElement | null;
  const dataHref = dataEl?.getAttribute("data-href");
  const el = target.closest("a.internal-link, span.internal-link, a") as HTMLElement | null;
  if (!el) return null;

  const href = el.getAttribute("href");
  if (dataHref && dataHref.indexOf("#cfi64=") !== -1) return dataHref;
  if (href) return href;
  if (dataHref) return dataHref;

  return null;
}

export default class EpubPlugin extends Plugin implements ProgressStore {
  settings: EpubPluginSettings;

  private data: PluginDataV1 = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    progress: {},
  };

  private saveTimer: number | null = null;

  async onload() {
    await this.loadPluginData();
    this.settings = this.data.settings;

    addIcon(
      ICON_EPUB,
      `
			<path
				fill="currentColor"
				stroke="currentColor"
				d="M 90.695312 47.296875 C 90.046875 46.589844 89.136719 46.1875 88.175781 46.1875 C 87.21875 46.1875 86.304688 46.589844 85.660156 47.296875 L 70.535156 63.277344 L 52.855469 81.933594 C 51.558594 83.339844 49.734375 84.144531 47.820312 84.144531 C 45.90625 84.144531 44.078125 83.339844 42.785156 81.933594 L 17.582031 55.292969 C 14.792969 52.292969 14.792969 47.648438 17.582031 44.648438 L 42.785156 18.023438 C 44.078125 16.617188 45.90625 15.816406 47.820312 15.816406 C 49.734375 15.816406 51.558594 16.617188 52.855469 18.023438 L 64.382812 30.207031 L 40.417969 55.5 C 39.730469 56.257812 39.730469 57.410156 40.417969 58.167969 L 42.945312 60.839844 C 43.652344 61.566406 44.761719 61.566406 45.472656 60.839844 L 73.222656 31.566406 C 73.90625 30.808594 73.90625 29.652344 73.222656 28.894531 L 70.691406 26.226562 L 70.511719 26.054688 L 57.886719 12.722656 C 55.28125 9.921875 51.628906 8.332031 47.804688 8.332031 C 43.980469 8.332031 40.332031 9.921875 37.726562 12.722656 L 12.503906 39.347656 C 6.941406 45.222656 6.941406 54.769531 12.503906 60.644531 L 37.703125 87.269531 C 40.308594 90.070312 43.960938 91.664062 47.789062 91.664062 C 51.613281 91.664062 55.265625 90.070312 57.871094 87.269531 L 83.070312 60.644531 L 90.632812 52.679688 C 92.007812 51.171875 92.007812 48.863281 90.632812 47.359375 L 90.695312 47.292969 Z M 90.695312 47.296875"
			/>
		`
    );

    this.registerView(VIEW_TYPE_EPUB, (leaf: WorkspaceLeaf) => {
      return new EpubView(leaf, this.settings, this);
    });

    try {
      this.registerExtensions([EPUB_FILE_EXTENSION], VIEW_TYPE_EPUB);
    } catch (error) {
      console.log(`Existing file extension ${EPUB_FILE_EXTENSION}`);
    }

    this.addSettingTab(new EpubSettingTab(this.app, this));

    // ====== 1) 唯一拦截入口：workspace click ======
    this.registerEvent(
      // @ts-ignore - some obsidian typings may not include 'click' yet
      this.app.workspace.on("click", async (evt: MouseEvent) => {
        const target = evt.target as HTMLElement | null;
        if (!target) return;

        // 编辑模式：只在 Ctrl/Cmd + click 时接管（不破坏编辑体验）
        if (isLikelyInEditor(target) && !(evt.ctrlKey || evt.metaKey)) return;

        const href = getHrefFromTarget(target);
        if (!href) return;

        const parsed = parseEpubCfi64Link(href);
        if (!parsed) return;

        evt.preventDefault();
        evt.stopPropagation();

        const activeFile = this.app.workspace.getActiveFile();
        const sourcePath = activeFile?.path ?? "";
        const bookFile = this.app.metadataCache.getFirstLinkpathDest(parsed.path, sourcePath);

        if (!(bookFile instanceof TFile)) return;

        // 如果该书已在某个 epub leaf 打开，复用它
        const existing = this.app.workspace
          .getLeavesOfType(VIEW_TYPE_EPUB)
          .find((l) => (l.view as any)?.file?.path === bookFile.path);

        const leaf =
          existing ??
          this.app.workspace.getLeaf("split", "vertical") ??
          this.app.workspace.getLeaf(false);
        const pushJump = () => {
          // @ts-ignore - view typings
          (leaf.view as any)?.setEphemeralState?.({ cfi64: parsed.cfi64 });
          // @ts-ignore - older typings may not include setActiveLeaf
          (this.app.workspace as any)?.setActiveLeaf?.(leaf, { focus: false });
        };

        if (existing) {
          // Already open: push jump state directly to the view.
          pushJump();
          return;
        }

        // ????? + eState ????????????
        await leaf.openFile(bookFile, { active: true, eState: { cfi64: parsed.cfi64 } });
        pushJump();
      })
    );

    // ====== 2) rename 迁移：epub 改名/移动后进度不丢 ======
    this.registerEvent(
      this.app.vault.on("rename", (af, oldPath) => {
        const oldKey = normalizeProgressKey(oldPath);
        const newPath = af.path;

        // 文件夹改名/移动：批量迁移
        if (af instanceof TFolder) {
          const oldPrefix = normalizePath(oldPath) + "/";
          const newPrefix = normalizePath(newPath) + "/";

          const next: Record<string, BookProgress> = { ...this.data.progress };
          let changed = false;

          for (const [k, v] of Object.entries(this.data.progress)) {
            if (!k.startsWith(oldPrefix)) continue;
            const moved = newPrefix + k.slice(oldPrefix.length);
            if (!next[moved]) next[moved] = v;
            delete next[k];
            changed = true;
          }

          if (changed) {
            this.data.progress = next;
            this.requestSave();
          }
          return;
        }

        // 单个文件改名/移动：迁移一个 key
        if (af instanceof TFile) {
          const newKey = normalizeProgressKey(newPath);
          if (this.data.progress[oldKey] && !this.data.progress[newKey]) {
            this.data.progress[newKey] = this.data.progress[oldKey];
          }
          if (this.data.progress[oldKey]) {
            delete this.data.progress[oldKey];
            this.requestSave();
          }
        }
      })
    );
  }

  onunload() {}

  // ====== ProgressStore：给 EpubView/EpubReader 用 ======
  getProgress(bookPath: string): string | number | null {
    const key = normalizeProgressKey(bookPath);
    return this.data.progress[key]?.location ?? null;
  }

  setProgress(bookPath: string, location: string | number): void {
    const key = normalizeProgressKey(bookPath);
    this.data.progress[key] = { location, updatedAt: Date.now() };
    this.requestSave();
  }

  private requestSave(): void {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.savePluginData().catch(() => {});
    }, 500);
  }

  // ====== data.json 读写（含旧版本迁移） ======
  private async loadPluginData(): Promise<void> {
    const raw = await this.loadData();

    // 新结构
    if (raw && typeof raw === "object" && (raw as any).version === 1) {
      const v1 = raw as PluginDataV1;
      this.data = {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...(v1.settings ?? {}) },
        progress: v1.progress ?? {},
      };
      return;
    }

    // 旧结构：以前只存 settings
    const legacySettings = raw && typeof raw === "object" ? (raw as any) : {};
    this.data = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, ...legacySettings },
      progress: {},
    };
  }

  private async savePluginData(): Promise<void> {
    this.data.settings = this.settings;
    await this.saveData(this.data);
  }

  async loadSettings() {
    // 兼容你原来的调用方式
    await this.loadPluginData();
    this.settings = this.data.settings;
  }

  async saveSettings() {
    await this.savePluginData();
    // 通知所有打开的EpubView重新渲染以应用新设置
    this.notifyViewsToRerender();
  }

  private notifyViewsToRerender(): void {
    // 获取所有打开的Epub视图
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EPUB);
    leaves.forEach(leaf => {
      const view = leaf.view;
      if (view && view instanceof EpubView) {
        // 调用renderReader方法重新渲染
        view.renderReader();
      }
    });
  }
}
