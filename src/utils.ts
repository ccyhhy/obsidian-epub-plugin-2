import { normalizePath } from "obsidian";

/**
 * Strict Base64URL (UTF-8 safe):
 * - URL-safe alphabet (-, _)
 * - No padding
 */
export function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(encoded: string): string {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Clean display text for Obsidian wikilink alias */
export function sanitizeLinkText(text: string): string {
  return (text ?? "")
    .replace(/\|/g, " ")
    .replace(/[\[\]]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse internal href/data-href into: { path, cfi64 }
 * Accepts:
 * - "Book.epub#cfi64=..."
 * - "Folder/Book.epub#cfi64=..."
 * - "obsidian://open?file=...#cfi64=..." (best-effort)
 */
export function parseEpubCfi64Link(hrefOrDataHref: string): { path: string; cfi64: string } | null {
  if (!hrefOrDataHref) return null;

  let raw = hrefOrDataHref;

  if (raw.startsWith("obsidian://")) {
    try {
      const u = new URL(raw);
      const fileParam = u.searchParams.get("file");
      if (fileParam) raw = decodeURIComponent(fileParam) + (u.hash ?? "");
    } catch {
      // ignore
    }
  }

  const [pathPartRaw, hashRaw] = raw.split("#", 2);
  const pathPart = decodeURIComponent(pathPartRaw);

  if (!pathPart.toLowerCase().endsWith(".epub")) return null;
  if (!hashRaw) return null;

  const m = hashRaw.match(/cfi64=([A-Za-z0-9_-]+)/);
  if (!m?.[1]) return null;

  return { path: normalizePath(pathPart), cfi64: m[1] };
}

export function normalizeProgressKey(bookPath: string): string {
  return normalizePath(bookPath);
}
