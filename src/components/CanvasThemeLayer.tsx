import { useEffect, useRef } from "react";
import type { VisualTheme } from "../lib/types";

interface CanvasThemeLayerProps {
  theme: VisualTheme;
  activeTokenIndex: number;
  tokenCount: number;
  focusPosition: number;
  playing: boolean;
  microphoneActive: boolean;
}

type Point = { x: number; y: number };

const TAU = Math.PI * 2;

function drawPrism(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointer: Point,
  focusY: number,
  progress: number,
  energy: number,
) {
  const backdrop = context.createLinearGradient(0, 0, width, height);
  backdrop.addColorStop(0, "#060814");
  backdrop.addColorStop(0.52, "#090a12");
  backdrop.addColorStop(1, "#120b12");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  const halo = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, Math.max(width, height) * 0.58);
  halo.addColorStop(0, `rgba(83, 218, 255, ${0.16 + energy * 0.07})`);
  halo.addColorStop(0.42, "rgba(55, 105, 255, 0.055)");
  halo.addColorStop(1, "rgba(12, 15, 30, 0)");
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);

  const beamOriginX = width * (0.12 + progress * 0.7);
  for (let index = 0; index < 4; index += 1) {
    const drift = Math.sin(time * (0.23 + index * 0.03) + index * 1.7) * height * 0.08;
    const beam = context.createLinearGradient(beamOriginX, focusY, width, focusY + drift);
    beam.addColorStop(0, "rgba(255, 177, 64, 0)");
    beam.addColorStop(0.45, `rgba(255, 177, 64, ${0.025 + index * 0.008})`);
    beam.addColorStop(1, "rgba(85, 218, 255, 0)");
    context.beginPath();
    context.moveTo(beamOriginX - 20, focusY - 8 - index * 7);
    context.lineTo(width, focusY - height * 0.26 + drift + index * 34);
    context.lineTo(width, focusY + height * 0.16 + drift + index * 28);
    context.closePath();
    context.fillStyle = beam;
    context.fill();
  }

  context.translate(pointer.x, focusY);
  for (let ring = 0; ring < 3; ring += 1) {
    context.beginPath();
    context.ellipse(0, 0, width * (0.1 + ring * 0.065), height * (0.08 + ring * 0.048), time * 0.06 + ring * 0.28, 0, TAU);
    context.strokeStyle = ring === 0
      ? `rgba(255, 184, 75, ${0.34 + energy * 0.15})`
      : `rgba(110, 219, 255, ${0.12 - ring * 0.02})`;
    context.lineWidth = ring === 0 ? 1.5 : 1;
    context.stroke();
  }
  context.restore();

  context.fillStyle = "rgba(255, 255, 255, 0.025)";
  for (let x = -40; x < width + 40; x += 88) {
    const offset = Math.sin(time * 0.14 + x * 0.012) * 12;
    context.fillRect(x + offset, focusY - 0.5, 42, 1);
  }
}

function drawSoundscape(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointer: Point,
  focusY: number,
  progress: number,
  energy: number,
) {
  const backdrop = context.createRadialGradient(pointer.x, focusY, 0, pointer.x, focusY, Math.max(width, height));
  backdrop.addColorStop(0, "#10211f");
  backdrop.addColorStop(0.46, "#091311");
  backdrop.addColorStop(1, "#060b0b");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  const phase = time * (0.45 + energy * 0.5) + progress * 14;
  context.save();
  for (let line = -10; line <= 10; line += 1) {
    const baseline = focusY + line * Math.max(18, height / 18);
    context.beginPath();
    for (let x = -12; x <= width + 12; x += 12) {
      const distance = Math.abs(x - pointer.x) / Math.max(1, width);
      const envelope = Math.max(0.08, 1 - distance * 1.8);
      const wave = Math.sin(x * 0.012 + phase + line * 0.56) * (8 + energy * 18) * envelope;
      const contour = Math.sin(x * 0.0035 - phase * 0.35 + line) * 5;
      const y = baseline + wave + contour;
      if (x === -12) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    const proximity = 1 - Math.min(1, Math.abs(baseline - focusY) / Math.max(1, height * 0.55));
    context.strokeStyle = line === 0
      ? `rgba(77, 232, 196, ${0.5 + energy * 0.2})`
      : `rgba(${line % 2 === 0 ? "78, 224, 195" : "244, 112, 151"}, ${0.055 + proximity * 0.08})`;
    context.lineWidth = line === 0 ? 1.6 : 1;
    context.stroke();
  }

  context.globalCompositeOperation = "screen";
  const pulseRadius = 34 + ((time * 34) % Math.max(80, width * 0.16));
  context.beginPath();
  context.arc(pointer.x, focusY, pulseRadius, 0, TAU);
  context.strokeStyle = `rgba(244, 112, 151, ${Math.max(0, 0.22 - pulseRadius / Math.max(360, width))})`;
  context.stroke();
  context.restore();

  const progressGradient = context.createLinearGradient(0, 0, width, 0);
  progressGradient.addColorStop(0, "rgba(77, 232, 196, 0)");
  progressGradient.addColorStop(Math.max(0.001, progress), "rgba(77, 232, 196, 0.22)");
  progressGradient.addColorStop(Math.min(1, progress + 0.002), "rgba(244, 112, 151, 0.28)");
  progressGradient.addColorStop(1, "rgba(244, 112, 151, 0)");
  context.fillStyle = progressGradient;
  context.fillRect(0, focusY - 1, width, 2);
}

function drawDirector(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pointer: Point,
  focusY: number,
  progress: number,
  energy: number,
) {
  context.fillStyle = "#110909";
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(255, 225, 188, 0.055)";
  context.lineWidth = 1;
  for (let x = width / 6; x < width; x += width / 6) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = height / 5; y < height; y += height / 5) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const sprocketOffset = (time * 18) % 54;
  context.fillStyle = "rgba(255, 225, 188, 0.11)";
  for (let y = -54 + sprocketOffset; y < height + 54; y += 54) {
    context.fillRect(10, y, 7, 24);
    context.fillRect(width - 17, y, 7, 24);
  }

  const frameInset = Math.max(34, Math.min(width, height) * 0.09);
  const corner = Math.min(82, width * 0.09);
  context.strokeStyle = `rgba(255, 92, 67, ${0.55 + energy * 0.24})`;
  context.lineWidth = 2;
  const corners = [
    [frameInset, frameInset, 1, 1],
    [width - frameInset, frameInset, -1, 1],
    [frameInset, height - frameInset, 1, -1],
    [width - frameInset, height - frameInset, -1, -1],
  ] as const;
  for (const [x, y, sx, sy] of corners) {
    context.beginPath();
    context.moveTo(x + sx * corner, y);
    context.lineTo(x, y);
    context.lineTo(x, y + sy * corner);
    context.stroke();
  }

  const cursorX = Math.max(frameInset, Math.min(width - frameInset, pointer.x));
  context.setLineDash([5, 7]);
  context.strokeStyle = "rgba(255, 222, 179, 0.22)";
  context.beginPath();
  context.moveTo(cursorX, focusY - 54);
  context.lineTo(cursorX, focusY + 54);
  context.moveTo(cursorX - 54, focusY);
  context.lineTo(cursorX + 54, focusY);
  context.stroke();
  context.setLineDash([]);

  const slateX = width * progress;
  context.fillStyle = "rgba(255, 92, 67, 0.9)";
  context.fillRect(Math.max(0, slateX - 1), focusY - 18, 2, 36);
  context.restore();
}

function drawLightBeam(
  context: CanvasRenderingContext2D,
  origin: Point,
  target: Point,
  width: number,
  intensity: number,
) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicular = { x: -dy / length, y: dx / length };
  const beamGradient = context.createLinearGradient(origin.x, origin.y, target.x, target.y);
  beamGradient.addColorStop(0, `rgba(255, 229, 170, ${0.19 * intensity})`);
  beamGradient.addColorStop(0.32, `rgba(255, 218, 135, ${0.105 * intensity})`);
  beamGradient.addColorStop(0.78, `rgba(255, 203, 102, ${0.055 * intensity})`);
  beamGradient.addColorStop(1, "rgba(255, 191, 82, 0)");

  context.beginPath();
  context.moveTo(origin.x + perpendicular.x * 7, origin.y + perpendicular.y * 7);
  context.lineTo(target.x + perpendicular.x * width, target.y + perpendicular.y * width);
  context.quadraticCurveTo(target.x, target.y + width * 0.18, target.x - perpendicular.x * width, target.y - perpendicular.y * width);
  context.lineTo(origin.x - perpendicular.x * 7, origin.y - perpendicular.y * 7);
  context.closePath();
  context.fillStyle = beamGradient;
  context.fill();
}

function drawStageLamp(context: CanvasRenderingContext2D, origin: Point, target: Point, intensity: number) {
  const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  context.save();
  context.translate(origin.x, origin.y);
  context.rotate(angle);
  context.shadowColor = "rgba(0, 0, 0, 0.72)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;

  const bodyGradient = context.createLinearGradient(-82, -28, -12, 32);
  bodyGradient.addColorStop(0, "#17181b");
  bodyGradient.addColorStop(0.3, "#4b4d50");
  bodyGradient.addColorStop(0.55, "#222326");
  bodyGradient.addColorStop(1, "#090a0c");
  context.beginPath();
  context.moveTo(-82, -24);
  context.lineTo(-25, -31);
  context.quadraticCurveTo(-5, -28, 2, -18);
  context.lineTo(2, 18);
  context.quadraticCurveTo(-5, 28, -25, 31);
  context.lineTo(-82, 24);
  context.closePath();
  context.fillStyle = bodyGradient;
  context.fill();
  context.shadowColor = "transparent";

  context.strokeStyle = "rgba(215, 218, 216, 0.34)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(-38, 0, 45, Math.PI * 0.73, Math.PI * 1.27);
  context.stroke();
  context.fillStyle = "#0b0c0e";
  context.beginPath();
  context.arc(-38, -43, 5, 0, TAU);
  context.arc(-38, 43, 5, 0, TAU);
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 1;
  for (let vent = -64; vent <= -32; vent += 8) {
    context.beginPath();
    context.moveTo(vent, -17);
    context.lineTo(vent + 4, 17);
    context.stroke();
  }

  const lens = context.createRadialGradient(0, 0, 2, 0, 0, 24);
  lens.addColorStop(0, `rgba(255, 250, 211, ${0.98 * intensity})`);
  lens.addColorStop(0.25, `rgba(255, 222, 135, ${0.94 * intensity})`);
  lens.addColorStop(0.65, `rgba(255, 168, 54, ${0.55 * intensity})`);
  lens.addColorStop(1, "rgba(69, 39, 11, 0.18)");
  context.fillStyle = "#08090a";
  context.beginPath();
  context.arc(0, 0, 29, 0, TAU);
  context.fill();
  context.fillStyle = lens;
  context.beginPath();
  context.arc(0, 0, 23, 0, TAU);
  context.fill();
  context.strokeStyle = "rgba(236, 237, 230, 0.42)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#101113";
  context.beginPath();
  context.moveTo(-3, -26);
  context.lineTo(19, -48);
  context.lineTo(24, -14);
  context.lineTo(5, -8);
  context.closePath();
  context.moveTo(-3, 26);
  context.lineTo(19, 48);
  context.lineTo(24, 14);
  context.lineTo(5, 8);
  context.closePath();
  context.fill();

  context.restore();
}

function drawSpotlight(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  targetY: number,
  energy: number,
) {
  const backdrop = context.createLinearGradient(0, 0, 0, height);
  backdrop.addColorStop(0, "#09090b");
  backdrop.addColorStop(0.48, "#0d0c0b");
  backdrop.addColorStop(1, "#050506");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  const leftOrigin = { x: Math.max(38, width * 0.035), y: height * 0.16 };
  const rightOrigin = { x: Math.min(width - 38, width * 0.965), y: height * 0.16 };
  const target = { x: width * 0.5, y: Math.max(height * 0.36, Math.min(height * 0.78, targetY)) };
  const breathing = 0.92 + Math.sin(time * 0.72) * 0.035;
  const intensity = (0.68 + energy * 0.3) * breathing;

  context.save();
  context.globalCompositeOperation = "screen";
  drawLightBeam(context, leftOrigin, target, width * 0.2, intensity);
  drawLightBeam(context, rightOrigin, target, width * 0.2, intensity);
  drawLightBeam(context, leftOrigin, target, width * 0.11, intensity * 0.72);
  drawLightBeam(context, rightOrigin, target, width * 0.11, intensity * 0.72);

  const pool = context.createRadialGradient(target.x, target.y, 0, target.x, target.y, Math.max(160, width * 0.3));
  pool.addColorStop(0, `rgba(255, 241, 199, ${0.17 * intensity})`);
  pool.addColorStop(0.35, `rgba(255, 206, 112, ${0.075 * intensity})`);
  pool.addColorStop(1, "rgba(255, 188, 70, 0)");
  context.fillStyle = pool;
  context.fillRect(0, 0, width, height);

  for (let mote = 0; mote < 34; mote += 1) {
    const seed = mote * 31.73;
    const x = (seed * 47.1 + time * (4 + (mote % 4))) % width;
    const y = (seed * 19.7 + Math.sin(time * 0.3 + mote) * 22 + height) % height;
    const nearBeam = Math.abs(x - target.x) < width * 0.32;
    if (!nearBeam) continue;
    context.fillStyle = `rgba(255, 226, 164, ${0.025 + (mote % 3) * 0.012})`;
    context.beginPath();
    context.arc(x, y, 0.6 + (mote % 3) * 0.45, 0, TAU);
    context.fill();
  }
  context.restore();

  drawStageLamp(context, leftOrigin, target, intensity);
  drawStageLamp(context, rightOrigin, target, intensity);
}

export function CanvasThemeLayer({ theme, activeTokenIndex, tokenCount, focusPosition, playing, microphoneActive }: CanvasThemeLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || theme === "classic") return;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!context) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pointer: Point = { x: 0, y: 0 };
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let lastPaint = -Infinity;
    let smoothedSpotlightY = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!pointer.x && !pointer.y) {
        pointer.x = width * 0.68;
        pointer.y = height * (focusPosition / 100);
        smoothedSpotlightY = pointer.y;
      }
    };

    const paint = (now: number) => {
      const time = reducedMotion ? 0 : now / 1000;
      const progress = Math.min(1, Math.max(0, activeTokenIndex / Math.max(1, tokenCount - 1)));
      const focusY = height * (focusPosition / 100);
      const energy = playing ? (microphoneActive ? 1 : 0.58) : 0.16;
      smoothedSpotlightY += (pointer.y - smoothedSpotlightY) * (reducedMotion ? 1 : 0.09);
      if (theme === "spotlight") drawSpotlight(context, width, height, time, smoothedSpotlightY, energy);
      else if (theme === "soundscape") drawSoundscape(context, width, height, time, pointer, focusY, progress, energy);
      else if (theme === "director") drawDirector(context, width, height, time, pointer, focusY, progress, energy);
      else drawPrism(context, width, height, time, pointer, focusY, progress, energy);
    };

    const animate = (now: number) => {
      if (now - lastPaint >= 1000 / 30) {
        lastPaint = now;
        paint(now);
      }
      animationFrame = window.requestAnimationFrame(animate);
    };

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      pointer.y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      if (reducedMotion) paint(0);
    };

    resize();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      resize();
      if (reducedMotion) paint(0);
    });
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    if (reducedMotion) paint(0);
    else animationFrame = window.requestAnimationFrame(animate);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", updatePointer);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [activeTokenIndex, focusPosition, microphoneActive, playing, theme, tokenCount]);

  return <canvas ref={canvasRef} className={`canvas-theme-layer ${theme === "classic" ? "is-classic" : ""}`} aria-hidden="true" />;
}
