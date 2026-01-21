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

export class EpubView extends FileView {
  allowNoFile: false;

  private fileContent: ArrayBuffer | null = null;
  private jumpCfiRange: string | null = null;

  private readonly backlinkManager: BacklinkManager;
  private highlights: BacklinkHighlight[] = [];
  private refreshTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private settings: EpubPluginSettings,
    private progressStore: ProgressStore
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
    if (this.settings.useSameFolder) {
      filePath = `${this.file.parent.path}/`;
    } else {
      filePath = this.settings.notePath.endsWith("/")
        ? this.settings.notePath
        : `${this.settings.notePath}/`;
    }
    return `${filePath}${this.file.basename}.md`;
  }

  private getFileContent() {
    return `---
Tags: ${this.settings.tags}
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

    // Refresh backlinks on metadata resolve (debounced)
    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        if (!this.file) return;
        if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
          if (!this.file) return;
          this.highlights = this.backlinkManager.getHighlightsForBook(this.file);
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

  private renderReader(): void {
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

    // Read progress from plugin data.json
    const initialLocation = this.progressStore.getProgress(this.file.path) ?? 0;

    ReactDOM.render(
      <div style={{ paddingTop: tocOffset, paddingBottom: tocBottomOffset }}>
        <EpubReader
          app={this.app}
          file={this.file}
          contents={this.fileContent}
          title={this.file.basename}
          scrolled={this.settings.scrolledView}
          initialLocation={initialLocation}
          jumpCfiRange={this.jumpCfiRange}
          highlights={this.highlights}
          onLocationChange={(loc: string | number) => {
            if (!this.file) return;
            this.progressStore.setProgress(this.file.path, loc);
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
