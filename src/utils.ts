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

export function normalizeColor(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/\s+/g, "");

  if (cleaned.startsWith("#")) {
    const hex = cleaned.slice(1);
    if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex.split("").map((c) => c + c).join("").toLowerCase()}`;
    }
    if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
      return `#${hex.split("").map((c) => c + c).join("").toLowerCase()}`;
    }
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
    if (hex.length === 8 && /^[0-9a-fA-F]{8}$/.test(hex)) {
      return `#${hex.toLowerCase()}`;
    }
  }

  const rgbMatch = cleaned.match(/^rgb\((\d+),(\d+),(\d+)\)$/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10)));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}`;
  }

  const rgbaMatch = cleaned.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/i);
  if (rgbaMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10)));
    const a = Math.min(1, Math.max(0, parseFloat(rgbaMatch[4])));
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}${alphaHex}`;
  }

  const colorNames: Record<string, string> = {
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    orange: "#ffa500",
    purple: "#800080",
    pink: "#ffc0cb",
    brown: "#a52a2a",
    black: "#000000",
    white: "#ffffff",
    gray: "#808080",
    grey: "#808080",
    gold: "#ffd700",
    lightblue: "#add8e6",
    lightgreen: "#90ee90",
    lightyellow: "#ffffe0",
    lightpink: "#ffb6c1",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    lime: "#00ff00",
    teal: "#008080",
    navy: "#000080",
    maroon: "#800000",
    olive: "#808000",
    silver: "#c0c0c0",
  };

  const lowerName = cleaned.toLowerCase();
  if (colorNames[lowerName]) {
    return colorNames[lowerName];
  }

  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }

  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return `#${cleaned.split("").map((c) => c + c).join("").toLowerCase()}`;
  }

  return null;
}

export function parseColorComponents(
  input: string,
  fallbackHex = "#ffd700"
): { r: number; g: number; b: number; alpha: number } {
  const normalized = normalizeColor(input) ?? fallbackHex;
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

  return { r, g, b, alpha };
}
