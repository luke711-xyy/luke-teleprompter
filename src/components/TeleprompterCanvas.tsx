import { forwardRef, lazy, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { calculateTwoLineScrollTarget, shouldResnapAfterScroll } from "../lib/scroll";
import type { ScriptDocument, ScrollMode, VisualTheme } from "../lib/types";
import {
  firstTokenOnVisualLine,
  focusedTokenIdsFromVisualLines,
  focusedTwoLineTokenIds,
  groupMeasurementsIntoVisualLines,
  leadingTwoLineTokenId,
} from "../lib/visualLines";
import type { TokenLineMeasurement, VisualLine } from "../lib/visualLines";
import { CanvasThemeLayer } from "./CanvasThemeLayer";
import type { SpotlightStageHandle } from "./SpotlightStage3D";

const SpotlightStage3D = lazy(() => import("./SpotlightStage3D").then((module) => ({ default: module.SpotlightStage3D })));

export interface TeleprompterCanvasHandle {
  scrollToToken: (tokenIndex: number, behavior?: ScrollBehavior) => void;
  getScrollTop: () => number;
  setScrollTop: (value: number) => void;
  getLineHeight: () => number;
  getMaxScroll: () => number;
  findFocusedToken: () => number;
}

interface TeleprompterCanvasProps {
  document: ScriptDocument;
  activeTokenIndex: number;
  fontSize: number;
  lineHeight: number;
  sidePadding: number;
  focusPosition: number;
  focusBandHeight: number;
  dimStrength: number;
  mirrored: boolean;
  mode: ScrollMode;
  visualTheme: VisualTheme;
  playing: boolean;
  microphoneActive: boolean;
  onChineseCharactersPerLineChange?: (value: number) => void;
  onManualScroll?: () => void;
  onTokenClick?: (tokenIndex: number) => void;
}

export const TeleprompterCanvas = forwardRef<TeleprompterCanvasHandle, TeleprompterCanvasProps>(
  function TeleprompterCanvas({ document, activeTokenIndex, fontSize, lineHeight, sidePadding, focusPosition, focusBandHeight, dimStrength, mirrored, mode, visualTheme, playing, microphoneActive, onChineseCharactersPerLineChange, onManualScroll, onTokenClick }, ref) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const focusBandRef = useRef<HTMLDivElement>(null);
    const scriptRef = useRef<HTMLDivElement>(null);
    const spotlightStageRef = useRef<SpotlightStageHandle>(null);
    const textureSourceRef = useRef<HTMLDivElement>(null);
    const tokenRefs = useRef(new Map<number, HTMLSpanElement>());
    const cueAnchorRefs = useRef(new Map<number, HTMLSpanElement>());
    const programmaticScroll = useRef(false);
    const scrollFrameRef = useRef<number | null>(null);
    const scrollUnlockTimerRef = useRef<number | null>(null);
    const layoutFrameRef = useRef<number | null>(null);
    const tokenMeasurementsRef = useRef<TokenLineMeasurement[]>([]);
    const visualLinesRef = useRef<VisualLine[]>([]);
    const focusBandBoundsRef = useRef({ top: 0, bottom: 0 });
    const activeTokenIndexRef = useRef(activeTokenIndex);
    const [focusedLineTokenIds, setFocusedLineTokenIds] = useState<Set<number>>(() => new Set([activeTokenIndex]));
    const [cuePlacements, setCuePlacements] = useState<Array<{ id: number; text: string; top: number; left: number; targetTokenId: number }>>([]);

    activeTokenIndexRef.current = activeTokenIndex;

    const requestSpotlightPaint = useCallback(() => {
      if (visualTheme === "spotlight") spotlightStageRef.current?.requestPaint();
    }, [visualTheme]);

    const promptClass = useMemo(
      () => `prompt-script ${mirrored ? "is-mirrored" : ""}`,
      [mirrored],
    );

    const dimStyles = useMemo(() => {
      const strength = Math.min(100, Math.max(0, dimStrength)) / 100;
      const palettes = {
        classic: { text: [250, 248, 241], dim: [52, 52, 53], emphasis: [255, 209, 95], emphasisDim: [94, 70, 31], cue: [255, 173, 40], cueDim: [100, 75, 34] },
        prism: { text: [248, 251, 255], dim: [43, 47, 67], emphasis: [255, 184, 75], emphasisDim: [94, 70, 31], cue: [83, 218, 255], cueDim: [37, 81, 97] },
        soundscape: { text: [234, 255, 248], dim: [27, 54, 49], emphasis: [244, 112, 151], emphasisDim: [83, 45, 57], cue: [78, 232, 195], cueDim: [38, 91, 79] },
        director: { text: [255, 243, 228], dim: [61, 38, 34], emphasis: [255, 92, 67], emphasisDim: [102, 43, 35], cue: [247, 207, 148], cueDim: [103, 75, 47] },
        spotlight: { text: [255, 249, 231], dim: [48, 45, 38], emphasis: [255, 211, 124], emphasisDim: [103, 77, 38], cue: [255, 192, 88], cueDim: [100, 72, 31] },
      } as const;
      const palette = palettes[visualTheme];
      const mix = (from: [number, number, number], to: [number, number, number]) => {
        const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * strength);
        return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
      };
      return {
        "--dimmed-token-color": mix(palette.text as [number, number, number], palette.dim as [number, number, number]),
        "--dimmed-emphasized-color": mix(palette.emphasis as [number, number, number], palette.emphasisDim as [number, number, number]),
        "--dimmed-cue-color": mix(palette.cue as [number, number, number], palette.cueDim as [number, number, number]),
        "--dimmed-cue-opacity": String(0.9 - (0.35 * strength)),
      } as CSSProperties;
    }, [dimStrength, visualTheme]);

    const chineseCharactersPerLine = useCallback(() => {
      const scriptNode = scriptRef.current;
      if (!scriptNode) return 20;
      const styles = window.getComputedStyle(scriptNode);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const availableWidth = Math.max(fontSize, scriptNode.clientWidth - horizontalPadding);
      return Math.max(1, Math.round(availableWidth / fontSize));
    }, [fontSize]);

    const cueTargetTokenId = useCallback((cueTokenIndex: number) => {
      const previousSpokenToken = [...document.tokens.slice(0, cueTokenIndex)]
        .reverse()
        .find((token) => token.normalized);
      if (previousSpokenToken) return previousSpokenToken.id;

      const nextSpokenToken = document.tokens
        .slice(cueTokenIndex + 1)
        .find((token) => token.normalized);
      return nextSpokenToken?.id ?? activeTokenIndexRef.current;
    }, [document.tokens]);

    const cueVerticalCenter = useCallback((targetTokenId: number) => {
      const targetNode = tokenRefs.current.get(targetTokenId);
      if (!targetNode) return 0;

      const measuredLineHeight = fontSize * lineHeight;
      const currentTop = targetNode.offsetTop;
      return Math.max(0, currentTop + measuredLineHeight * 0.03);
    }, [fontSize, lineHeight]);

    const rebuildVisualLineCache = useCallback(() => {
      const measurements = [...tokenRefs.current.entries()].map(([id, node]) => ({ id, top: node.offsetTop }));
      tokenMeasurementsRef.current = measurements;
      visualLinesRef.current = groupMeasurementsIntoVisualLines(measurements, fontSize * lineHeight);

      const viewport = viewportRef.current;
      const focusBand = focusBandRef.current;
      const viewportRect = viewport?.getBoundingClientRect();
      const bandRect = focusBand?.getBoundingClientRect();
      if (viewportRect && bandRect) {
        focusBandBoundsRef.current = {
          top: bandRect.top - viewportRect.top,
          bottom: bandRect.bottom - viewportRect.top,
        };
      }
    }, [fontSize, lineHeight]);

    const updateFocusedLineTokens = useCallback(() => {
      const viewport = viewportRef.current;
      const lineHeightInPixels = fontSize * lineHeight;
      const { top: bandTop, bottom: bandBottom } = focusBandBoundsRef.current;
      const inBand = viewport
        ? focusedTokenIdsFromVisualLines(
          visualLinesRef.current,
          lineHeightInPixels,
          viewport.scrollTop,
          bandTop,
          bandBottom,
        )
        : [];
      const nextIds = inBand.length > 0
        ? inBand
        : focusedTwoLineTokenIds(tokenMeasurementsRef.current, activeTokenIndexRef.current, lineHeightInPixels);
      const nextSet = new Set(nextIds);
      setFocusedLineTokenIds((current) => {
        if (current.size === nextIds.length && nextIds.every((id) => current.has(id))) return current;
        return nextSet;
      });
      return nextSet;
    }, [fontSize, lineHeight]);

    const selectTokenLine = useCallback((tokenIndex: number) => {
      if (!tokenMeasurementsRef.current.some((measurement) => measurement.id === tokenIndex)) {
        rebuildVisualLineCache();
      }
      onTokenClick?.(firstTokenOnVisualLine(tokenMeasurementsRef.current, tokenIndex, fontSize * lineHeight));
    }, [fontSize, lineHeight, onTokenClick, rebuildVisualLineCache]);

    const updateCuePlacements = useCallback(() => {
      const cues = document.tokens.filter((token) => token.kind === "cue");
      if (!cues.length) {
        setCuePlacements((current) => current.length ? [] : current);
        return;
      }

      const nextPlacements = cues.map((cue) => {
        const anchor = cueAnchorRefs.current.get(cue.id);
        const targetTokenId = cueTargetTokenId(cue.id);
        return {
          id: cue.id,
          text: cue.text,
          top: cueVerticalCenter(targetTokenId),
          left: anchor?.offsetLeft ?? 0,
          targetTokenId,
        };
      });

      setCuePlacements((current) => {
        const unchanged = current.length === nextPlacements.length
          && current.every((placement, index) => {
            const next = nextPlacements[index];
            return placement.id === next.id
              && placement.text === next.text
              && placement.top === next.top
              && placement.left === next.left
              && placement.targetTokenId === next.targetTokenId;
          });
        return unchanged ? current : nextPlacements;
      });
    }, [cueTargetTokenId, cueVerticalCenter, document.tokens]);

    const scrollToToken = (tokenIndex: number, behavior: ScrollBehavior = "smooth") => {
      const viewport = viewportRef.current;
      const measuredLineHeight = fontSize * lineHeight;
      const leadTokenIndex = leadingTwoLineTokenId(tokenMeasurementsRef.current, tokenIndex, measuredLineHeight);
      const token = tokenRefs.current.get(leadTokenIndex) ?? tokenRefs.current.get(tokenIndex);
      if (!viewport || !token) return;

      const currentLineIndex = visualLinesRef.current.findIndex((line) => line.tokenIds.includes(leadTokenIndex));
      const nextLineToken = currentLineIndex >= 0
        ? tokenRefs.current.get(visualLinesRef.current[currentLineIndex + 1]?.tokenIds[0])
        : undefined;
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const target = calculateTwoLineScrollTarget({
        currentTop: token.offsetTop,
        currentHeight: token.offsetHeight || fontSize,
        nextTop: nextLineToken?.offsetTop,
        nextHeight: nextLineToken?.offsetHeight,
        lineHeight: measuredLineHeight,
        viewportHeight: viewport.clientHeight,
        focusRatio: focusPosition / 100,
        maxScroll,
      });

      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      if (scrollUnlockTimerRef.current !== null) {
        window.clearTimeout(scrollUnlockTimerRef.current);
        scrollUnlockTimerRef.current = null;
      }

      programmaticScroll.current = true;
      const start = viewport.scrollTop;
      const distance = target - start;

      if (behavior === "auto" || Math.abs(distance) < 1) {
        viewport.scrollTop = target;
        requestSpotlightPaint();
        scrollUnlockTimerRef.current = window.setTimeout(() => {
          programmaticScroll.current = false;
          scrollUnlockTimerRef.current = null;
        }, 30);
        return;
      }

      const startedAt = performance.now();
      const duration = Math.min(220, Math.max(120, Math.abs(distance) * 0.18));
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - ((1 - progress) ** 3);
        viewport.scrollTop = start + distance * eased;
        requestSpotlightPaint();
        if (progress < 1) {
          scrollFrameRef.current = window.requestAnimationFrame(animate);
        } else {
          scrollFrameRef.current = null;
          programmaticScroll.current = false;
        }
      };
      scrollFrameRef.current = window.requestAnimationFrame(animate);
    };

    useImperativeHandle(ref, () => ({
      scrollToToken,
      getScrollTop: () => viewportRef.current?.scrollTop ?? 0,
      setScrollTop: (value: number) => {
        if (!viewportRef.current) return;
        viewportRef.current.scrollTop = value;
        requestSpotlightPaint();
      },
      getLineHeight: () => fontSize * lineHeight,
      getMaxScroll: () => {
        const viewport = viewportRef.current;
        return viewport ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : 0;
      },
      findFocusedToken: () => {
        const viewport = viewportRef.current;
        if (!viewport) return activeTokenIndex;
        const focusTop = viewport.scrollTop + viewport.clientHeight * (focusPosition / 100) - (fontSize * lineHeight) / 2;
        const lines = visualLinesRef.current;
        let low = 0;
        let high = lines.length - 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (lines[middle].top < focusTop) low = middle + 1;
          else high = middle;
        }
        const candidate = lines[low];
        const previous = lines[low - 1];
        const nearest = previous && Math.abs(previous.top - focusTop) < Math.abs(candidate?.top - focusTop)
          ? previous
          : candidate;
        return nearest?.tokenIds[0] ?? activeTokenIndexRef.current;
      },
    }), [focusPosition, fontSize, lineHeight, requestSpotlightPaint]);

    useEffect(() => {
      if (mode === "follow") scrollToToken(activeTokenIndex);
    }, [activeTokenIndex, mode]);

    useEffect(() => {
      scrollToToken(activeTokenIndex);
    }, [focusPosition]);

    useEffect(() => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
      if (scrollUnlockTimerRef.current !== null) window.clearTimeout(scrollUnlockTimerRef.current);
      if (layoutFrameRef.current !== null) window.cancelAnimationFrame(layoutFrameRef.current);
    }, []);

    useLayoutEffect(() => {
      const frame = window.requestAnimationFrame(() => {
        rebuildVisualLineCache();
        updateFocusedLineTokens();
        updateCuePlacements();
        onChineseCharactersPerLineChange?.(chineseCharactersPerLine());
        requestSpotlightPaint();
      });
      return () => window.cancelAnimationFrame(frame);
    }, [chineseCharactersPerLine, document.tokens, fontSize, lineHeight, sidePadding, focusPosition, focusBandHeight, onChineseCharactersPerLineChange, rebuildVisualLineCache, requestSpotlightPaint, updateCuePlacements, updateFocusedLineTokens]);

    useEffect(() => {
      const scriptNode = scriptRef.current;
      if (!scriptNode) return;

      const updateMeasurements = () => {
        if (layoutFrameRef.current !== null) window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = window.requestAnimationFrame(() => {
          layoutFrameRef.current = null;
          rebuildVisualLineCache();
          updateFocusedLineTokens();
          updateCuePlacements();
          onChineseCharactersPerLineChange?.(chineseCharactersPerLine());
          requestSpotlightPaint();
        });
      };

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", updateMeasurements);
        return () => window.removeEventListener("resize", updateMeasurements);
      }

      const observer = new ResizeObserver(updateMeasurements);
      observer.observe(scriptNode);
      window.addEventListener("resize", updateMeasurements);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updateMeasurements);
      };
    }, [chineseCharactersPerLine, lineHeight, onChineseCharactersPerLineChange, sidePadding, rebuildVisualLineCache, requestSpotlightPaint, updateCuePlacements, updateFocusedLineTokens]);

    useEffect(() => {
      requestSpotlightPaint();
    }, [activeTokenIndex, cuePlacements, dimStyles, focusedLineTokenIds, mirrored, promptClass, requestSpotlightPaint]);

    const renderFocusBand = () => (
      <div className="focus-band" ref={focusBandRef} style={{ top: `${focusPosition}%`, height: `${focusBandHeight}px` }} aria-hidden="true">
        <span className="focus-marker" />
      </div>
    );

    const renderPromptViewport = () => (
      <div
        className="prompt-viewport"
        ref={viewportRef}
        onScroll={() => {
          requestSpotlightPaint();
          if (!shouldResnapAfterScroll(mode, programmaticScroll.current)) {
            updateFocusedLineTokens();
          } else {
            onManualScroll?.();
          }
        }}
      >
        <div className={promptClass} ref={scriptRef} style={{ ...dimStyles, fontSize: `${fontSize}px`, lineHeight, "--prompt-side-padding": `${sidePadding}%` } as CSSProperties}>
          {cuePlacements.length > 0 && (
            <aside className="cue-overlay-layer" aria-label="动作提示">
              {cuePlacements.map((cue) => (
                <div
                  key={cue.id}
                  className={`cue-floating-card ${focusedLineTokenIds.has(cue.targetTokenId) ? "is-active" : ""}`}
                  style={{ top: `${cue.top}px`, left: `${cue.left}px` }}
                >
                  {cue.text}
                </div>
              ))}
            </aside>
          )}
          {document.tokens.map((token) => {
            if (token.kind === "linebreak") return <br key={token.id} />;
            if (token.kind === "space") return <span key={token.id}>{token.text}</span>;
            if (token.kind === "cue") {
              const targetTokenId = cueTargetTokenId(token.id);
              const cueFocusClass = focusedLineTokenIds.has(targetTokenId) ? "is-focused-line" : "is-dimmed-line";
              return (
                <span
                  key={token.id}
                  ref={(node) => {
                    if (node) cueAnchorRefs.current.set(token.id, node);
                    else cueAnchorRefs.current.delete(token.id);
                  }}
                  className={`cue-insertion-anchor ${cueFocusClass}`}
                  aria-label={`动作提示：${token.text}`}
                />
              );
            }
            const focusClass = focusedLineTokenIds.has(token.id) ? "is-focused-line" : "is-dimmed-line";
            return (
              <span
                key={token.id}
                ref={(node) => {
                  if (node) tokenRefs.current.set(token.id, node);
                  else tokenRefs.current.delete(token.id);
                }}
                className={`prompt-token token-${token.kind} ${focusClass} ${token.emphasized ? "is-emphasized" : ""} ${token.id === activeTokenIndex ? "is-active-token" : ""}`}
                data-token-index={token.id}
                onClick={() => selectTokenLine(token.id)}
              >
                {token.text}
              </span>
            );
          })}
        </div>
      </div>
    );

    return (
      <main className="reading-stage">
        {visualTheme === "spotlight" ? (
          <Suspense fallback={(
            <>
              <CanvasThemeLayer
                theme="spotlight"
                activeTokenIndex={activeTokenIndex}
                tokenCount={document.tokens.length}
                focusPosition={focusPosition}
                playing={playing}
                microphoneActive={microphoneActive}
              />
              {renderFocusBand()}
              {renderPromptViewport()}
            </>
          )}>
            <>
              <SpotlightStage3D
                ref={spotlightStageRef}
                activeTokenIndex={activeTokenIndex}
                tokenCount={document.tokens.length}
                focusPosition={focusPosition}
                playing={playing}
                microphoneActive={microphoneActive}
                sourceElementRef={textureSourceRef}
              >
                {renderPromptViewport()}
              </SpotlightStage3D>
              {renderFocusBand()}
            </>
          </Suspense>
        ) : (
          <>
            <CanvasThemeLayer
              theme={visualTheme}
              activeTokenIndex={activeTokenIndex}
              tokenCount={document.tokens.length}
              focusPosition={focusPosition}
              playing={playing}
              microphoneActive={microphoneActive}
            />
            {renderFocusBand()}
            {renderPromptViewport()}
          </>
        )}
      </main>
    );
  },
);
