import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Notice, TFile } from "obsidian";
import { ReactReader, ReactReaderStyle, type IReactReaderStyle } from "react-reader";
import type { Contents, Rendition } from "epubjs";
import { BacklinkHighlight } from "./BacklinkManager";
import { base64UrlEncode, sanitizeLinkText } from "./utils";

type ToolbarState = {
  visible: boolean;
  x: number;
  y: number;
  cfiRange: string;
  text: string;
};

type Props = {
  app: App;
  file: TFile;
  title: string;
  contents: ArrayBuffer;
  scrolled: boolean;
  initialLocation: string | number;
  jumpCfiRange: string | null;
  highlights: BacklinkHighlight[];
  onLocationChange: (loc: string | number) => void;
  onOpenNote: (note: TFile) => void;
};

export const EpubReader: React.FC<Props> = ({
  app,
  file,
  title,
  contents,
  scrolled,
  initialLocation,
  jumpCfiRange,
  highlights,
  onLocationChange,
  onOpenNote,
}) => {
  const renditionRef = useRef<Rendition | null>(null);
  const pendingJumpRef = useRef<string | null>(null);

  const [location, setLocation] = useState<string | number>(initialLocation);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [fontSize, setFontSize] = useState(100);

  // Track backlink highlights we added so we can remove them before re-adding.
  const addedBacklinkCfisRef = useRef<string[]>([]);

  const isDarkMode = document.body.classList.contains("theme-dark");

  const clearSelection = useCallback(() => {
    renditionRef.current?.getContents()?.forEach((c: any) => {
      try {
        c.window?.getSelection?.()?.removeAllRanges?.();
      } catch {
        // ignore
      }
    });
  }, []);

  const writeClipboard = useCallback(
    async (text: string) => {
      // @ts-ignore
      const cm = app.clipboardManager;
      if (cm?.writeText) {
        await cm.writeText(text);
        return;
      }
      await navigator.clipboard.writeText(text);
    },
    [app]
  );

  const locationChanged = useCallback(
    (epubcfi: string | number) => {
      setLocation(epubcfi);
      onLocationChange(epubcfi);
      setToolbar(null);
    },
    [onLocationChange]
  );

  const updateTheme = useCallback((rendition: Rendition) => {
    const themes = rendition.themes;
    themes.override("color", isDarkMode ? "#fff" : "#000");
    themes.override("background", isDarkMode ? "#000" : "#fff");
  }, [isDarkMode]);

  const applyFontSize = useCallback((rendition: Rendition, size: number) => {
    rendition.themes.fontSize(`${size}%`);
  }, []);

  // Receive jump request: if rendition not ready yet, hold it.
  useEffect(() => {
    if (!jumpCfiRange) return;
    pendingJumpRef.current = jumpCfiRange;

    const r = renditionRef.current;
    if (!r) return;

    r.display(jumpCfiRange).catch(() => {
      // keep pending if display fails; can retry later
    });
  }, [jumpCfiRange]);

  // Cleanup-first backlinks render
  const applyBacklinkHighlights = useCallback(
    (r: Rendition, next: BacklinkHighlight[]) => {
      // remove old
      for (const cfi of addedBacklinkCfisRef.current) {
        try {
          r.annotations.remove(cfi, "highlight");
        } catch {
          // ignore
        }
      }
      addedBacklinkCfisRef.current = [];

      // add new (cap for perf)
      const capped = (next ?? []).slice(0, 80);
      for (const hl of capped) {
        try {
          r.annotations.add(
            "highlight",
            hl.cfiRange,
            {},
            () => {
              new Notice(`Open backlink: ${hl.display}`);
              onOpenNote(hl.sourceFile);
            },
            "epubjs-backlink-hl"
          );
          addedBacklinkCfisRef.current.push(hl.cfiRange);
        } catch {
          // ignore invalid ranges
        }
      }
    },
    [onOpenNote]
  );

  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    applyBacklinkHighlights(r, highlights);
  }, [highlights, applyBacklinkHighlights]);

  const onSelected = useCallback((cfiRange: string, contents: Contents) => {
    const sel = contents.window?.getSelection?.();
    if (!sel || sel.rangeCount === 0) return;

    const text = sel.toString();
    if (!text || !text.trim()) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Reliable iframe offset: frameElement of this contents
    const frameEl = contents.document?.defaultView?.frameElement as HTMLElement | null;
    if (!frameEl) return;

    const iframeRect = frameEl.getBoundingClientRect();

    const x = iframeRect.left + rect.left + rect.width / 2;
    let y = iframeRect.top + rect.top - 44; // above selection
    if (y < 24) y = iframeRect.top + rect.bottom + 10; // below if near top

    setToolbar({
      visible: true,
      x,
      y,
      cfiRange,
      text,
    });
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!toolbar) return;

    let label = sanitizeLinkText(toolbar.text);
    if (!label) label = "Quote";
    if (label.length > 60) label = label.slice(0, 60) + "...";

    const cfi64 = base64UrlEncode(toolbar.cfiRange);
    // Use full path so links resolve uniquely
    const link = `[[${file.path}#cfi64=${cfi64}|${label}]]`;

    try {
      await writeClipboard(link);
      new Notice("EPUB link copied");
    } catch {
      new Notice("Copy failed");
    } finally {
      setToolbar(null);
      clearSelection();
    }
  }, [toolbar, file.path, writeClipboard, clearSelection]);

  const readerStyles = useMemo<IReactReaderStyle>(() => {
    return isDarkMode ? darkReaderTheme : lightReaderTheme;
  }, [isDarkMode]);

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      {/* Floating toolbar */}
      {toolbar && toolbar.visible && (
        <div
          style={{
            position: "fixed",
            left: toolbar.x,
            top: toolbar.y,
            transform: "translateX(-50%)",
            background: "var(--background-primary)",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "8px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
            padding: "6px 8px",
            zIndex: 99999,
          }}
          onMouseDown={(e) => e.preventDefault()} // keep selection until click
        >
          <button
            className="mod-cta"
            style={{
              cursor: "pointer",
              border: "none",
              background: "transparent",
              color: "var(--text-normal)",
              fontSize: "13px",
            }}
            onClick={handleCopyLink}
          >
            Copy Link
          </button>
        </div>
      )}

      <div style={{ padding: "10px" }}>
        <label htmlFor="fontSizeSlider">Adjust Font Size: </label>
        <input
          id="fontSizeSlider"
          type="range"
          min="80"
          max="160"
          value={fontSize}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            setFontSize(v);
            const r = renditionRef.current;
            if (r) applyFontSize(r, v);
          }}
        />
      </div>

      <ReactReader
        title={title}
        showToc={true}
        location={location}
        locationChanged={locationChanged}
        swipeable={false}
        url={contents}
        getRendition={(rendition: Rendition) => {
          renditionRef.current = rendition;

          rendition.on("selected", onSelected);
          rendition.on("click", () => setToolbar(null));
          rendition.on("relocated", () => setToolbar(null));

          rendition.hooks.content.register((c: Contents) => {
            try {
              const body = c.window.document.body;
              body.oncontextmenu = () => false;

              const style = c.document.createElement("style");
              style.innerHTML = `
                .epubjs-backlink-hl { 
                  fill: currentColor; 
                  fill-opacity: 0.18;
                  mix-blend-mode: multiply;
                  cursor: pointer;
                }
                ::selection { background: rgba(120, 120, 255, 0.25); }
              `;
              c.document.head.appendChild(style);
            } catch {
              // ignore
            }
          });

          updateTheme(rendition);
          applyFontSize(rendition, fontSize);

          // apply backlinks
          applyBacklinkHighlights(rendition, highlights);

          // apply pending jump if any
          if (pendingJumpRef.current) {
            const cfi = pendingJumpRef.current;
            pendingJumpRef.current = null;
            rendition.display(cfi).catch(() => {});
          }
        }}
        epubOptions={
          scrolled
            ? {
                allowPopups: true,
                flow: "scrolled",
                manager: "continuous",
              }
            : undefined
        }
        readerStyles={readerStyles}
      />
    </div>
  );
};

const lightReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  readerArea: {
    ...ReactReaderStyle.readerArea,
    transition: undefined,
  },
};

const darkReaderTheme: IReactReaderStyle = {
  ...ReactReaderStyle,
  arrow: {
    ...ReactReaderStyle.arrow,
    color: "white",
  },
  arrowHover: {
    ...ReactReaderStyle.arrowHover,
    color: "#ccc",
  },
  readerArea: {
    ...ReactReaderStyle.readerArea,
    backgroundColor: "#000",
    transition: undefined,
  },
  titleArea: {
    ...ReactReaderStyle.titleArea,
    color: "#ccc",
  },
  tocArea: {
    ...ReactReaderStyle.tocArea,
    background: "#111",
  },
  tocButtonExpanded: {
    ...ReactReaderStyle.tocButtonExpanded,
    background: "#222",
  },
  tocButtonBar: {
    ...ReactReaderStyle.tocButtonBar,
    background: "#fff",
  },
  tocButton: {
    ...ReactReaderStyle.tocButton,
    color: "white",
  },
};
