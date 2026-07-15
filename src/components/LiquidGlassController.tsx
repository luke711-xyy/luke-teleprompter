import { LiquidGlass } from "@ybouane/liquidglass";
import { useEffect, type RefObject } from "react";

interface LiquidGlassControllerProps {
  rootRef: RefObject<HTMLElement | null>;
  revision: number;
}

function supportsLiquidGlass(): boolean {
  if (typeof window === "undefined" || !("WebGLRenderingContext" in window)) return false;
  const canvas = document.createElement("canvas");
  try {
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function LiquidGlassController({ rootRef, revision }: LiquidGlassControllerProps) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !supportsLiquidGlass()) return;

    const glassElements = Array.from(root.querySelectorAll<HTMLElement>(":scope > .liquid-glass"));
    if (!glassElements.length) return;

    let cancelled = false;
    let instance: Awaited<ReturnType<typeof LiquidGlass.init>> | undefined;

    void LiquidGlass.init({ root, glassElements })
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        instance = created;
        root.classList.add("is-liquid-glass-ready");
      })
      .catch(() => {
        root.classList.remove("is-liquid-glass-ready");
      });

    return () => {
      cancelled = true;
      root.classList.remove("is-liquid-glass-ready");
      instance?.destroy();
    };
  }, [revision, rootRef]);

  return null;
}
