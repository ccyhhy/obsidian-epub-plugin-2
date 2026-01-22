import { WorkspaceLeaf, FileView, TFile, Menu, moment } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { EpubPluginSettings } from "./EpubPluginSettings";
import { EpubReader } from "./EpubReader";
import { BacklinkManager, BacklinkHighlight } from "./BacklinkManager";
import { base64UrlDecode } from "./utils";

export const EPUB_FILE_EXTENSION = "epub";
export const VIEW_TYPE_EPUB = "epub";
export const ICON_EPUB = "doc-epub";

export interface ProgressStore {
  getProgress(bookPath: string): string | number | null | undefined;
  setProgress(bookPath: string, location: string | number): void;
}

// 扩展 ProgressStore 接口以包含 settings
export interface EpubPluginInstance extends ProgressStore {
  settings: EpubPluginSettings;
}

export class EpubView extends FileView {
  allowNoFile: false;

  private fileContent: ArrayBuffer | null = null;
  private jumpCfiRange: string | null = null;

  private readonly backlinkManager: BacklinkManager;
  private highlights: BacklinkHighlight[] = [];
  private highlightsKey: string | null = null;
  private refreshTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private settings: EpubPluginSettings,
    private plugin: EpubPluginInstance
  ) {
    super(leaf);
    this.backlinkManager = new BacklinkManager(this.app);
  }

  // Keep your old menu: create a note file
  onPaneMenu(menu: Menu, source: "more-options" | "tab-header" | string): void {
    menu.addItem((item) => {
      item
        .setTitle("Create new epub note")
        .setIcon("document")
        .onClick(async () => {
          const fileName = this.getFileName();
          let file = this.app.vault.getAbstractFileByPath(fileName);
          if (file == null || !(file instanceof TFile)) {
            file = await this.app.vault.create(fileName, this.getFileContent());
          }
          const fileLeaf = this.app.workspace.createLeafBySplit(this.leaf);
          fileLeaf.openFile(file as TFile, { active: true });
        });
    });
    menu.addSeparator();
    super.onPaneMenu(menu, source);
  }

  private getFileName() {
    let filePath: string;
    const currentSettings = this.plugin.settings;
    if (currentSettings.useSameFolder) {
      filePath = `${this.file.parent.path}/`;
    } else {
      filePath = currentSettings.notePath.endsWith("/")
        ? currentSettings.notePath
        : `${currentSettings.notePath}/`;
    }
    return `${filePath}${this.file.basename}.md`;
  }

  private getFileContent() {
    const currentSettings = this.plugin.settings;
    return `---
Tags: ${currentSettings.tags}
Date: ${moment().toLocaleString()}
---

# ${this.file.basename}
`;
  }

  async onLoadFile(file: TFile): Promise<void> {
    ReactDOM.unmountComponentAtNode(this.contentEl);
    this.contentEl.empty();

    // Load EPUB binary
    this.fileContent = await this.app.vault.readBinary(file);

    // Initial backlinks (MVP)
    this.highlights = this.backlinkManager.getHighlightsForBook(file);
    this.highlightsKey = this.getHighlightsKey(this.highlights);

    // Refresh backlinks on metadata resolve (debounced)
    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        if (!this.file) return;
        if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
          if (!this.file) return;
          const next = this.backlinkManager.getHighlightsForBook(this.file);
          const nextKey = this.getHighlightsKey(next);
          if (nextKey === this.highlightsKey) return;
          this.highlights = next;
          this.highlightsKey = nextKey;
          this.renderReader();
        }, 150);
      })
    );

    // If leaf already has ephemeral state
    const maybeEState =
      // @ts-ignore
      (this.leaf as any).getEphemeralState?.() ??
      // @ts-ignore
      (this.leaf as any).viewState?.eState;

    if (maybeEState?.cfi64) {
      this.handleJumpFromCfi64(String(maybeEState.cfi64));
    }

    this.renderReader();
  }

  // Receive jump
  async setEphemeralState(state: any): Promise<void> {
    if (!state) return;

    if (state.cfi64) {
      this.handleJumpFromCfi64(String(state.cfi64));
      return;
    }

    if (typeof state.subpath === "string") {
      const m = state.subpath.match(/#?cfi64=([A-Za-z0-9_-]+)/);
      if (m?.[1]) this.handleJumpFromCfi64(m[1]);
    }
  }

  private handleJumpFromCfi64(encoded: string): void {
    try {
      this.jumpCfiRange = base64UrlDecode(encoded);
      this.renderReader();
    } catch {
      // ignore
    }
  }

  renderReader(): void {
    if (!this.file || !this.fileContent) return;

    const viewHeaderEl = this.containerEl.parentElement?.querySelector("div.view-header");
    const viewContentEl = this.containerEl.parentElement?.querySelector("div.view-content");

    const viewHeaderStyle = viewHeaderEl ? getComputedStyle(viewHeaderEl) : null;
    const viewHeaderHeight = viewHeaderStyle ? parseFloat(viewHeaderStyle.height) : 0;
    const viewHeaderWidth = viewHeaderStyle ? parseFloat(viewHeaderStyle.width) : 0;

    const viewContentStyle = viewContentEl ? getComputedStyle(viewContentEl) : null;
    const viewContentPaddingBottom = viewContentStyle ? parseFloat(viewContentStyle.paddingBottom) : 0;
    const viewContentPaddingTop = viewContentStyle ? parseFloat(viewContentStyle.paddingTop) : 0;

    const tocOffset = (viewHeaderHeight < viewHeaderWidth ? viewHeaderHeight : 0) + viewContentPaddingTop + 1;
    const tocBottomOffset = viewContentPaddingBottom;
    const padTop = 0;
    const padBottom = 0;

    // Read progress from plugin data.json
    const initialLocation = this.plugin.getProgress(this.file.path) ?? 0;

    // 使用插件的最新设置而不是初始设置
    const currentSettings = this.plugin.settings;

    const wrapperStyle: React.CSSProperties = {
      paddingTop: padTop,
      paddingBottom: padBottom,
      height: "100%",
      boxSizing: "border-box",
      overflow: currentSettings.scrolledView ? "auto" : "hidden",
    };

    ReactDOM.render(
      <div style={wrapperStyle}>
          <EpubReader
            app={this.app}
            file={this.file}
            contents={this.fileContent}
            title={this.file.basename}
            scrolled={currentSettings.scrolledView}
            highlightColor={currentSettings.highlightColor}
            highlightOpacity={currentSettings.highlightOpacity}
            fontSizePercent={currentSettings.fontSizePercent}
            followObsidianTheme={currentSettings.followObsidianTheme}
            followObsidianFont={currentSettings.followObsidianFont}
            initialLocation={initialLocation}
            jumpCfiRange={this.jumpCfiRange}
            highlights={this.highlights}
            onLocationChange={(loc: string | number) => {
              if (!this.file) return;
              this.plugin.setProgress(this.file.path, loc);
            }}
            onOpenNote={(note: TFile) => {
              const leaf = this.app.workspace.getLeaf("split", "vertical") ?? this.app.workspace.getLeaf(false);
              leaf.openFile(note);
            }}
          />
      </div>,
      this.contentEl
    );

    // consume jump (one shot)
    this.jumpCfiRange = null;
  }

  private getHighlightsKey(list: BacklinkHighlight[]): string {
    return list.map((h) => `${h.cfiRange}|${h.sourceFile.path}`).join("\n");
  }

  onunload(): void {
    ReactDOM.unmountComponentAtNode(this.contentEl);
  }

  getDisplayText() {
    return this.file ? this.file.basename : "No File";
  }

  canAcceptExtension(extension: string) {
    return extension == EPUB_FILE_EXTENSION;
  }

  getViewType() {
    return VIEW_TYPE_EPUB;
  }

  getIcon() {
    return ICON_EPUB;
  }
}
