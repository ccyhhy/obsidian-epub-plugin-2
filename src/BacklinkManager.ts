import { App, TFile } from "obsidian";
import { base64UrlDecode } from "./utils";

export type BacklinkHighlight = {
  cfiRange: string;   // decoded epubcfi range
  sourceFile: TFile;  // note file that contains the link
  display: string;    // display label
};

const CFI64_REGEX = /#cfi64=([A-Za-z0-9_-]+)/g;

export class BacklinkManager {
  constructor(private readonly app: App) {}

  /**
   * MVP: only parse backlinks pointing to the current book.
   * 1) coarse filter using resolvedLinks (source->dest counts)
   * 2) fine parse using getFileCache(file).links/embeds and resolve target
   */
  getHighlightsForBook(bookFile: TFile, limit = 200): BacklinkHighlight[] {
    const bookPath = bookFile.path;
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const backlinksApi = (this.app.metadataCache as any).getBacklinksForFile?.(bookFile);

    // coarse candidates
    const candidates: TFile[] = [];
    if (backlinksApi?.data) {
      const data: any = backlinksApi.data;
      if (typeof data?.keys === "function") {
        for (const sourcePath of data.keys()) {
          const af = this.app.vault.getAbstractFileByPath(sourcePath);
          if (af instanceof TFile) candidates.push(af);
        }
      } else {
        for (const sourcePath of Object.keys(data)) {
          const af = this.app.vault.getAbstractFileByPath(sourcePath);
          if (af instanceof TFile) candidates.push(af);
        }
      }
    }

    if (!candidates.length) {
      for (const [sourcePath, destCounts] of Object.entries(resolvedLinks)) {
        if (!destCounts) continue;
        if (!Object.prototype.hasOwnProperty.call(destCounts, bookPath)) continue;

        const af = this.app.vault.getAbstractFileByPath(sourcePath);
        if (af instanceof TFile) candidates.push(af);
      }
    }

    const seenEncoded = new Set<string>();
    const results: BacklinkHighlight[] = [];

    for (const sourceFile of candidates) {
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      if (!cache) continue;

      const items = [...(cache.links ?? []), ...(cache.embeds ?? [])];
      if (!items.length) continue;

      for (const item of items) {
        const linkRaw = String((item as any).link ?? "");
        const linkPath = linkRaw.split("#")[0];
        let resolvedPath = linkPath;

        if (!resolvedPath) {
          const original = String((item as any).original ?? "");
          const wikiMatch = original.match(/\[\[([^|\]]+)/);
          if (wikiMatch?.[1]) resolvedPath = wikiMatch[1].split("#")[0];
        }

        // resolve the link target precisely
        const dest = this.app.metadataCache.getFirstLinkpathDest(resolvedPath, sourceFile.path);
        if (!dest || dest.path !== bookFile.path) continue;

        const original = (item as any).original as string | undefined;
        const subpath = (item as any).subpath as string | undefined;
        const candidates = [original, linkRaw, subpath].filter(Boolean) as string[];
        const hasCfi = candidates.some((v) => v.indexOf("#cfi64=") !== -1);
        if (!hasCfi) continue;

        const display = String((item as any).displayText ?? sourceFile.basename);

        for (const raw of candidates) {
          CFI64_REGEX.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = CFI64_REGEX.exec(raw)) !== null) {
            const encoded = m[1];
            if (!encoded) continue;
            if (seenEncoded.has(encoded)) continue;
            seenEncoded.add(encoded);

            try {
              const cfiRange = base64UrlDecode(encoded);
              results.push({ cfiRange, sourceFile, display });
              if (results.length >= limit) return results;
            } catch {
              // ignore invalid payload
            }
          }
        }
      }
    }

    return results;
  }
}
