import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { calculateTwoLineScrollTarget } from "../lib/scroll";
import type { ScriptDocument, ScrollMode } from "../lib/types";
import { firstTokenOnVisualLine, focusedTwoLineTokenIds, leadingTwoLineTokenId } from "../lib/visualLines";

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
  dimStrength: number;
  mirrored: boolean;
  mode: ScrollMode;
  onChineseCharactersPerLineChange?: (value: number) => void;
  onManualScroll?: () => void;
  onTokenClick?: (tokenIndex: number) => void;
}

export const TeleprompterCanvas = forwardRef<TeleprompterCanvasHandle, TeleprompterCanvasProps>(
  function TeleprompterCanvas({ document, activeTokenIndex, fontSize, lineHeight, sidePadding, focusPosition, dimStrength, mirrored, mode, onChineseCharactersPerLineChange, onManualScroll, onTokenClick }, ref) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const scriptRef = useRef<HTMLDivElement>(null);
    const tokenRefs = useRef(new Map<number, HTMLSpanElement>());
    const cueAnchorRefs = useRef(new Map<number, HTMLSpanElement>());
    const programmaticScroll = useRef(false);
    const scrollFrameRef = useRef<number | null>(null);
    const scrollUnlockTimerRef = useRef<number | null>(null);
    const [focusedLineTokenIds, setFocusedLineTokenIds] = useState<Set<number>>(() => new Set([activeTokenIndex]));
    const [cuePlacements, setCuePlacements] = useState<Array<{ id: number; text: string; top: number; left: number; isActive: boolean }>>([]);

    const promptClass = useMemo(
      () => `prompt-script ${mirrored ? "is-mirrored" : ""}`,
      [mirrored],
    );

    const dimStyles = useMemo(() => {
      const strength = Math.min(100, Math.max(0, dimStrength)) / 100;
      const mix = (from: [number, number, number], to: [number, number, number]) => {
        const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * strength);
        return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
      };
      return {
        "--dimmed-token-color": mix([250, 248, 241], [52, 52, 53]),
        "--dimmed-emphasized-color": mix([255, 209, 95], [94, 70, 31]),
        "--dimmed-cue-color": mix([255, 173, 40], [100, 75, 34]),
        "--dimmed-cue-opacity": String(0.9 - (0.35 * strength)),
      } as CSSProperties;
    }, [dimStrength]);

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
      return nextSpokenToken?.id ?? activeTokenIndex;
    }, [activeTokenIndex, document.tokens]);

    const cueVerticalCenter = useCallback((targetTokenId: number) => {
      const targetNode = tokenRefs.current.get(targetTokenId);
      if (!targetNode) return 0;

      const measuredLineHeight = fontSize * lineHeight;
      const currentTop = targetNode.offsetTop;
      return Math.max(0, currentTop + measuredLineHeight * 0.03);
    }, [fontSize, lineHeight]);

    const updateFocusedLineTokens = useCallback(() => {
      const measurements = [...tokenRefs.current.entries()].map(([id, node]) => ({ id, top: node.offsetTop }));
      const nextIds = focusedTwoLineTokenIds(measurements, activeTokenIndex, fontSize * lineHeight);
      setFocusedLineTokenIds((current) => {
        if (current.size === nextIds.length && nextIds.every((id) => current.has(id))) return current;
        return new Set(nextIds);
      });
    }, [activeTokenIndex, fontSize, lineHeight]);

    const selectTokenLine = useCallback((tokenIndex: number) => {
      const measurements = [...tokenRefs.current.entries()].map(([id, node]) => ({ id, top: node.offsetTop }));
      onTokenClick?.(firstTokenOnVisualLine(measurements, tokenIndex, fontSize * lineHeight));
    }, [fontSize, lineHeight, onTokenClick]);

    const updateCuePlacements = useCallback((focusedIds = focusedLineTokenIds) => {
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
          isActive: focusedIds.has(targetTokenId),
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
              && placement.isActive === next.isActive;
          });
        return unchanged ? current : nextPlacements;
      });
    }, [cueTargetTokenId, cueVerticalCenter, document.tokens, focusedLineTokenIds, fontSize]);

    const scrollToToken = (tokenIndex: number, behavior: ScrollBehavior = "smooth") => {
      const viewport = viewportRef.current;
      const measurements = [...tokenRefs.current.entries()].map(([id, node]) => ({ id, top: node.offsetTop }));
      const measuredLineHeight = fontSize * lineHeight;
      const leadTokenIndex = leadingTwoLineTokenId(measurements, tokenIndex, measuredLineHeight);
      const token = tokenRefs.current.get(leadTokenIndex) ?? tokenRefs.current.get(tokenIndex);
      if (!viewport || !token) return;

      const nextLineToken = [...tokenRefs.current.entries()]
        .filter(([index, node]) => index > leadTokenIndex && node.offsetTop >= token.offsetTop + measuredLineHeight * 0.5)
        .sort(([left], [right]) => left - right)[0]?.[1];
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
        if (viewportRef.current) viewportRef.current.scrollTop = value;
      },
      getLineHeight: () => fontSize * lineHeight,
      getMaxScroll: () => {
        const viewport = viewportRef.current;
        return viewport ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : 0;
      },
      findFocusedToken: () => {
        const viewport = viewportRef.current;
        if (!viewport) return activeTokenIndex;
        const focusY = viewport.getBoundingClientRect().top + viewport.clientHeight * (focusPosition / 100);
        let nearest = activeTokenIndex;
        let nearestDistance = Number.POSITIVE_INFINITY;
        tokenRefs.current.forEach((node, index) => {
          const rect = node.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - focusY);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = index;
          }
        });
        return nearest;
      },
    }), [activeTokenIndex, focusPosition, fontSize, lineHeight]);

    useEffect(() => {
      if (mode === "follow") scrollToToken(activeTokenIndex);
    }, [activeTokenIndex, mode]);

    useEffect(() => {
      scrollToToken(activeTokenIndex);
    }, [focusPosition]);

    useEffect(() => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
      if (scrollUnlockTimerRef.current !== null) window.clearTimeout(scrollUnlockTimerRef.current);
    }, []);

    useLayoutEffect(() => {
      const frame = window.requestAnimationFrame(() => {
        updateFocusedLineTokens();
        updateCuePlacements();
        onChineseCharactersPerLineChange?.(chineseCharactersPerLine());
      });
      return () => window.cancelAnimationFrame(frame);
    }, [chineseCharactersPerLine, fontSize, lineHeight, sidePadding, onChineseCharactersPerLineChange, updateCuePlacements, updateFocusedLineTokens]);

    useEffect(() => {
      const scriptNode = scriptRef.current;
      if (!scriptNode) return;

      const updateMeasurements = () => {
        updateFocusedLineTokens();
        updateCuePlacements();
        onChineseCharactersPerLineChange?.(chineseCharactersPerLine());
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
    }, [chineseCharactersPerLine, lineHeight, onChineseCharactersPerLineChange, sidePadding, updateCuePlacements, updateFocusedLineTokens]);

    return (
      <main className="reading-stage">
        <div className="focus-band" style={{ top: `${focusPosition}%` }} aria-hidden="true">
          <span className="focus-marker" />
        </div>
        <div
          className="prompt-viewport"
          ref={viewportRef}
          onScroll={() => {
            if (!programmaticScroll.current) onManualScroll?.();
          }}
        >
          <div className={promptClass} ref={scriptRef} style={{ ...dimStyles, fontSize: `${fontSize}px`, lineHeight, "--prompt-side-padding": `${sidePadding}%` } as CSSProperties}>
            {cuePlacements.length > 0 && (
              <aside className="cue-overlay-layer" aria-label="动作提示">
                {cuePlacements.map((cue) => (
                  <div
                    key={cue.id}
                    className={`cue-floating-card ${cue.isActive ? "is-active" : ""}`}
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
      </main>
    );
  },
);
