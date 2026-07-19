export type HtmlCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
};

type HtmlCanvasWindow = Window & {
  __HTML_IN_CANVAS_POLYFILL__?: boolean;
};

type ElementTexturePrototype = {
  texElementImage2D?: (
    target: number,
    level: number,
    internalFormat: number,
    format: number,
    type: number,
    source: HTMLElement,
  ) => void;
};

/**
 * three-html-render 0.1.x implements the current short texElementImage2D
 * overload. Three.js r185 still probes the legacy six-argument signature in
 * part of its WebGL upload path, so bridge the two only when the polyfill is
 * active. Native browser implementations are left untouched.
 */
export function installThreeHtmlTextureCompatibility() {
  if (!(window as HtmlCanvasWindow).__HTML_IN_CANVAS_POLYFILL__) return;

  const contextConstructors = [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext];
  for (const contextConstructor of contextConstructors) {
    if (!contextConstructor) continue;
    const prototype = contextConstructor.prototype as ElementTexturePrototype;
    const uploadElement = prototype.texElementImage2D;
    if (!uploadElement || uploadElement.length !== 3) continue;

    Object.defineProperty(prototype, "texElementImage2D", {
      configurable: true,
      writable: true,
      value: function texElementImage2D(
        this: WebGLRenderingContext | WebGL2RenderingContext,
        target: number,
        level: number,
        internalFormat: number,
        format: number,
        type: number,
        source: HTMLElement,
      ) {
        uploadElement.call(this, target, level, internalFormat, format, type, source);
      },
    });
  }
}

export function htmlCanvasMode() {
  return (window as HtmlCanvasWindow).__HTML_IN_CANVAS_POLYFILL__ ? "polyfill" : "native";
}
