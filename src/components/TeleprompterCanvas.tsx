import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { calculateTwoLineScrollTarget } from "../lib/scroll";
import type { ScriptDocument, ScrollMode } from "../lib/types";

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
  focusPosition: number;
  mirrored: boolean;
  mode: ScrollMode;
  onManualScroll?: () => void;
}

export const TeleprompterCanvas = forwardRef<TeleprompterCanvasHandle, TeleprompterCanvasProps>(
  function TeleprompterCanvas({ document, activeTokenIndex, fontSize, focusPosition, mirrored, mode, onManualScroll }, ref) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const tokenRefs = useRef(new Map<number, HTMLSpanElement>());
    const programmaticScroll = useRef(false);
    const scrollFrameRef = useRef<number | null>(null);
    const scrollUnlockTimerRef = useRef<number | null>(null);
    const activeSentence = document.tokens[activeTokenIndex]?.sentenceIndex ?? 0;

    const promptClass = useMemo(
      () => `prompt-script ${mirrored ? "is-mirrored" : ""}`,
      [mirrored],
    );

    const scrollToToken = (tokenIndex: number, behavior: ScrollBehavior = "smooth") => {
      const viewport = viewportRef.current;
      const token = tokenRefs.current.get(tokenIndex);
      if (!viewport || !token) return;

      const lineHeight = fontSize * 1.42;
      const nextLineToken = [...tokenRefs.current.entries()]
        .filter(([index, node]) => index > tokenIndex && node.offsetTop >= token.offsetTop + lineHeight * 0.5)
        .sort(([left], [right]) => left - right)[0]?.[1];
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const target = calculateTwoLineScrollTarget({
        currentTop: token.offsetTop,
        currentHeight: token.offsetHeight || fontSize,
        nextTop: nextLineToken?.offsetTop,
        nextHeight: nextLineToken?.offsetHeight,
        lineHeight,
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
      getLineHeight: () => fontSize * 1.42,
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
    }), [activeTokenIndex, focusPosition, fontSize]);

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
          <div className={promptClass} style={{ fontSize: `${fontSize}px` }}>
            {document.tokens.map((token) => {
              if (token.kind === "linebreak") return <br key={token.id} />;
              if (token.kind === "space") return <span key={token.id}>{token.text}</span>;
              const sentenceClass = token.sentenceIndex < activeSentence
                ? "is-past"
                : token.sentenceIndex === activeSentence
                  ? "is-current"
                  : "is-future";
              return (
                <span
                  key={token.id}
                  ref={(node) => {
                    if (node) tokenRefs.current.set(token.id, node);
                    else tokenRefs.current.delete(token.id);
                  }}
                  className={`prompt-token token-${token.kind} ${sentenceClass} ${token.id === activeTokenIndex ? "is-active-token" : ""}`}
                  data-token-index={token.id}
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
