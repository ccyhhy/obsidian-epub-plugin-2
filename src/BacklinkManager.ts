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

    // coarse candidates
    const candidates: TFile[] = [];
    for (const [sourcePath, destCounts] of Object.entries(resolvedLinks)) {
      if (!destCounts) continue;
      if (!Object.prototype.hasOwnProperty.call(destCounts, bookPath)) continue;

      const af = this.app.vault.getAbstractFileByPath(sourcePath);
      if (af instanceof TFile) candidates.push(af);
    }

    const seenEncoded = new Set<string>();
    const results: BacklinkHighlight[] = [];

    for (const sourceFile of candidates) {
      const cache = this.app.metadataCache.getFileCache(sourceFile);
      if (!cache) continue;

      const items = [...(cache.links ?? []), ...(cache.embeds ?? [])];
      if (!items.length) continue;

      for (const item of items) {
        // resolve the link target precisely
        const dest = this.app.metadataCache.getFirstLinkpathDest(item.link, sourceFile.path);
        if (!dest || dest.path !== bookFile.path) continue;

        const original = (item as any).original as string | undefined;
        if (!original || original.indexOf("#cfi64=") === -1) continue;

        const display = String((item as any).displayText ?? sourceFile.basename);

        CFI64_REGEX.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CFI64_REGEX.exec(original)) !== null) {
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

    return results;
  }
}
