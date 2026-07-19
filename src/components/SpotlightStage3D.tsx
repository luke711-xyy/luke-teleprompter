import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { InteractionManager } from "three/addons/interaction/InteractionManager.js";
import { htmlCanvasMode, installThreeHtmlTextureCompatibility } from "../lib/htmlCanvas";
import type { HtmlCanvas } from "../lib/htmlCanvas";
import { CanvasThemeLayer } from "./CanvasThemeLayer";

interface SpotlightStage3DProps {
  activeTokenIndex: number;
  tokenCount: number;
  focusPosition: number;
  playing: boolean;
  microphoneActive: boolean;
  sourceElementRef: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
}

export interface SpotlightStageHandle {
  requestPaint: () => void;
  getMode: () => "initializing" | "native" | "polyfill" | "fallback";
}

type LampRig = {
  group: THREE.Group;
  spot: THREE.SpotLight;
  point: THREE.PointLight;
  target: THREE.Object3D;
  origin: THREE.Vector3;
  bulbMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.SpriteMaterial;
};

function createGlowTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.14, "rgba(255,226,172,.82)");
    gradient.addColorStop(0.48, "rgba(255,167,78,.2)");
    gradient.addColorStop(1, "rgba(255,140,54,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLampRig(color: number, glowTexture: THREE.Texture): LampRig {
  const group = new THREE.Group();
  group.scale.setScalar(0.95);

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x25272b, metalness: 0.82, roughness: 0.3 });
  const brushedMetal = new THREE.MeshStandardMaterial({ color: 0x777a80, metalness: 0.9, roughness: 0.2 });
  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x060709, metalness: 0.7, roughness: 0.38 });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 3.2,
    metalness: 0.04,
    roughness: 0.12,
  });

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 1.15, 32), darkMetal);
  housing.rotation.x = Math.PI / 2;
  housing.position.z = -0.18;
  group.add(housing);

  const rearCap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.25, 24), brushedMetal);
  rearCap.rotation.x = Math.PI / 2;
  rearCap.position.z = -0.84;
  group.add(rearCap);

  const rearRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.027, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0xb87826, emissive: color, emissiveIntensity: 0.85, metalness: 0.6, roughness: 0.25 }),
  );
  rearRing.position.z = -0.975;
  group.add(rearRing);

  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.075, 12, 40), brushedMetal);
  lensRing.position.z = 0.43;
  group.add(lensRing);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.41, 48), bulbMaterial);
  lens.position.z = 0.442;
  group.add(lens);

  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.045, 8, 36, Math.PI), brushedMetal);
  yoke.rotation.z = Math.PI / 2;
  yoke.position.z = -0.16;
  group.add(yoke);

  const horizontalDoor = new THREE.BoxGeometry(0.74, 0.055, 0.38);
  const topDoor = new THREE.Mesh(horizontalDoor, blackMetal);
  topDoor.position.set(0, 0.58, 0.57);
  topDoor.rotation.x = -0.34;
  group.add(topDoor);
  const bottomDoor = topDoor.clone();
  bottomDoor.position.y = -0.58;
  bottomDoor.rotation.x = 0.34;
  group.add(bottomDoor);

  const verticalDoor = new THREE.BoxGeometry(0.055, 0.74, 0.38);
  const leftDoor = new THREE.Mesh(verticalDoor, blackMetal);
  leftDoor.position.set(-0.58, 0, 0.57);
  leftDoor.rotation.y = 0.34;
  group.add(leftDoor);
  const rightDoor = leftDoor.clone();
  rightDoor.position.x = 0.58;
  rightDoor.rotation.y = -0.34;
  group.add(rightDoor);

  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.position.z = 0.48;
  glow.scale.set(1.15, 1.15, 1.15);
  group.add(glow);

  const target = new THREE.Object3D();
  const spot = new THREE.SpotLight(color, 1, 22, THREE.MathUtils.degToRad(38), 0.72, 2);
  spot.target = target;
  const point = new THREE.PointLight(color, 1, 8, 2);

  return {
    group,
    spot,
    point,
    target,
    origin: new THREE.Vector3(),
    bulbMaterial,
    glowMaterial,
  };
}

function disposeObject(object: THREE.Object3D) {
  const disposedMaterials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
    if (child instanceof THREE.Mesh) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!disposedMaterials.has(material)) {
        material.dispose();
        disposedMaterials.add(material);
      }
    });
  });
}

export const SpotlightStage3D = forwardRef<SpotlightStageHandle, SpotlightStage3DProps>(
  function SpotlightStage3D(props, ref) {
    const canvasRef = useRef<HtmlCanvas>(null);
    const [sourceElement] = useState(() => {
      const element = document.createElement("div");
      element.className = "spotlight-html-source";
      return element;
    });
    const livePropsRef = useRef(props);
    const wakeRef = useRef<(() => void) | null>(null);
    const paintFrameRef = useRef<number | null>(null);
    const paintTimerRef = useRef<number | null>(null);
    const lastPaintAtRef = useRef(0);
    const [htmlCanvasReady, setHtmlCanvasReady] = useState(false);
    const [ready, setReady] = useState(false);
    const [fallback, setFallback] = useState(false);
    const [mode, setMode] = useState<"initializing" | "native" | "polyfill" | "fallback">("initializing");
    livePropsRef.current = props;

    const requestPaint = useCallback(() => {
      if (paintFrameRef.current !== null || paintTimerRef.current !== null) return;
      const remaining = Math.max(0, 33 - (performance.now() - lastPaintAtRef.current));
      const scheduleFrame = () => {
        paintTimerRef.current = null;
        paintFrameRef.current = window.requestAnimationFrame(() => {
          paintFrameRef.current = null;
          lastPaintAtRef.current = performance.now();
          canvasRef.current?.requestPaint?.();
        });
      };
      if (remaining > 1) paintTimerRef.current = window.setTimeout(scheduleFrame, remaining);
      else scheduleFrame();
    }, []);

    useImperativeHandle(ref, () => ({
      requestPaint,
      getMode: () => mode,
    }), [mode, requestPaint]);

    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setAttribute("layoutsubtree", "");
      canvas.appendChild(sourceElement);
      props.sourceElementRef.current = sourceElement;

      return () => {
        props.sourceElementRef.current = null;
        if (canvas.contains(sourceElement)) canvas.removeChild(sourceElement);
      };
    }, [props.sourceElementRef, sourceElement]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      let active = true;
      void import("three-html-render/polyfill")
        .then(({ installHtmlInCanvasPolyfill }) => {
          if (!active) return;
          installHtmlInCanvasPolyfill();
          installThreeHtmlTextureCompatibility();
          setMode(htmlCanvasMode());
          setHtmlCanvasReady(true);
        })
        .catch((error: unknown) => {
          console.error("HTML-in-Canvas could not be initialized.", error);
          if (active) {
            setMode("fallback");
            setFallback(true);
          }
        });

      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      if (!htmlCanvasReady) return;
      const canvas = canvasRef.current;
      const source = sourceElement;
      if (!canvas || !canvas.contains(source)) return;

      let disposed = false;
      let animationFrame = 0;
      let resizeFrame = 0;
      let stableFrames = 0;
      let pointerRatio = livePropsRef.current.focusPosition / 100;
      let smoothedRatio = pointerRatio;
      let pageWidth = 12.8;
      let pageHeight = 7.2;
      let promptLeftRatio = 0.09;
      let promptRightRatio = 0.91;
      let hasTextureSnapshot = false;
      let renderer: THREE.WebGLRenderer;

      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
      } catch (error) {
        console.error("HTMLTexture WebGL renderer could not be initialized.", error);
        setMode("fallback");
        setFallback(true);
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.setClearColor(0x050506, 1);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050506);
      const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 60);

      source.style.width = `${Math.max(1, canvas.clientWidth)}px`;
      source.style.height = `${Math.max(1, canvas.clientHeight)}px`;

      const pageTexture = new THREE.HTMLTexture(source);
      pageTexture.colorSpace = THREE.SRGBColorSpace;
      pageTexture.minFilter = THREE.LinearFilter;
      pageTexture.magFilter = THREE.LinearFilter;
      pageTexture.generateMipmaps = false;

      const pageGeometry = new THREE.PlaneGeometry(1, 1);
      const pageMaterial = new THREE.MeshStandardMaterial({
        map: pageTexture,
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0,
        side: THREE.FrontSide,
      });
      const pageMesh = new THREE.Mesh(pageGeometry, pageMaterial);
      pageMesh.position.z = 0;
      scene.add(pageMesh);

      const backing = new THREE.Mesh(
        new THREE.PlaneGeometry(1.012, 1.018),
        new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95, metalness: 0.02 }),
      );
      backing.position.z = -0.035;
      scene.add(backing);

      scene.add(new THREE.HemisphereLight(0x697284, 0x030304, 0.3));
      const fill = new THREE.DirectionalLight(0xaeb8c9, 0.18);
      fill.position.set(0, 5, 8);
      scene.add(fill);

      const glowTexture = createGlowTexture();
      const leftRig = createLampRig(0xffd58d, glowTexture);
      const rightRig = createLampRig(0xffbf61, glowTexture);
      const rigs = [leftRig, rightRig];
      rigs.forEach((rig) => scene.add(rig.group, rig.spot, rig.point, rig.target));

      const interactions = new InteractionManager();
      interactions.connect(renderer, camera);
      interactions.add(pageMesh);

      const readPromptBounds = () => {
        const prompt = source.querySelector<HTMLElement>(".prompt-script");
        const surfaceWidth = Math.max(1, source.clientWidth);
        if (!prompt) return;

        const styles = window.getComputedStyle(prompt);
        const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
        const contentLeft = prompt.offsetLeft + paddingLeft;
        const contentRight = prompt.offsetLeft + prompt.offsetWidth - paddingRight;
        promptLeftRatio = THREE.MathUtils.clamp(contentLeft / surfaceWidth, 0.035, 0.46);
        promptRightRatio = THREE.MathUtils.clamp(contentRight / surfaceWidth, 0.54, 0.965);
        canvas.dataset.spotlightPromptLeft = promptLeftRatio.toFixed(4);
        canvas.dataset.spotlightPromptRight = promptRightRatio.toFixed(4);
      };

      const updateRig = (now = performance.now()) => {
        const current = livePropsRef.current;
        const desiredRatio = THREE.MathUtils.clamp(pointerRatio, 0.14, 0.88);
        smoothedRatio = THREE.MathUtils.lerp(smoothedRatio, desiredRatio, 0.12);
        const targetY = pageHeight * (0.5 - smoothedRatio);
        const progress = current.activeTokenIndex / Math.max(1, current.tokenCount - 1);
        const promptLeft = (promptLeftRatio - 0.5) * pageWidth;
        const promptRight = (promptRightRatio - 0.5) * pageWidth;
        const promptCenter = (promptLeft + promptRight) * 0.5;
        const promptSpan = Math.max(1, promptRight - promptLeft);
        const targetDrift = THREE.MathUtils.lerp(-0.025, 0.025, progress) * promptSpan;
        const activePower = current.playing ? (current.microphoneActive ? 1120 : 960) : 710;
        const pulse = current.microphoneActive ? 0.98 + Math.sin(now * 0.0014) * 0.025 : 1;
        let remainingMotion = Math.abs(desiredRatio - smoothedRatio);

        rigs.forEach((rig, index) => {
          const isLeft = index === 0;
          const side = isLeft ? -1 : 1;
          const originX = side * pageWidth * 0.43;
          const targetX = promptCenter + targetDrift + (isLeft ? -0.25 : 0.25) * promptSpan;
          const target = new THREE.Vector3(targetX, targetY, 0.03);
          rig.origin.set(originX, pageHeight * 0.34, 2.35);
          const lightDistance = rig.origin.distanceTo(target);
          const requiredRadius = promptSpan * 0.34;
          const requiredAngle = Math.atan2(requiredRadius, Math.max(0.1, lightDistance)) * 1.18;
          const nextAngle = THREE.MathUtils.clamp(
            requiredAngle,
            THREE.MathUtils.degToRad(34),
            THREE.MathUtils.degToRad(52),
          );
          rig.group.position.copy(rig.origin);
          rig.group.lookAt(target);
          rig.target.position.copy(target);
          rig.spot.position.copy(rig.origin);
          remainingMotion = Math.max(remainingMotion, Math.abs(nextAngle - rig.spot.angle));
          rig.spot.angle = THREE.MathUtils.lerp(rig.spot.angle, nextAngle, 0.16);
          rig.spot.power = activePower * pulse;
          rig.point.position.copy(rig.origin);
          rig.point.distance = Math.max(7, promptSpan * 0.82);
          rig.point.power = current.playing ? 56 : 34;
          rig.bulbMaterial.emissiveIntensity = current.playing ? 3.15 : 2.1;
          rig.glowMaterial.opacity = current.playing ? 0.48 : 0.32;
        });

        canvas.dataset.spotlightConeAngle = THREE.MathUtils.radToDeg(leftRig.spot.angle).toFixed(2);

        return remainingMotion;
      };

      const resize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        const dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1.25 : 1.5);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        source.style.width = `${width}px`;
        source.style.height = `${height}px`;
        readPromptBounds();

        pageWidth = 12.8;
        pageHeight = pageWidth * (height / width);
        pageMesh.scale.set(pageWidth, pageHeight, 1);
        backing.scale.set(pageWidth, pageHeight, 1);

        camera.aspect = width / height;
        const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const distanceForHeight = pageHeight / (2 * Math.tan(halfFov));
        const distanceForWidth = pageWidth / (2 * Math.tan(halfFov) * camera.aspect);
        camera.position.set(0, 0, Math.max(distanceForHeight, distanceForWidth) * 1.01);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        pageMesh.updateMatrixWorld(true);
        interactions.update();
        canvas.requestPaint?.();
        if (hasTextureSnapshot) wake();
      };

      const renderFrame = (now: number) => {
        if (!hasTextureSnapshot) return;
        const remainingMotion = updateRig(now);
        interactions.update();
        try {
          renderer.render(scene, camera);
        } catch (error) {
          console.error("HTMLTexture frame could not be rendered.", error);
          setMode("fallback");
          setFallback(true);
          return;
        }
        canvas.dataset.htmlTextureMode = mode;
        canvas.dataset.htmlTextureActive = "true";
        canvas.dataset.htmlTextureFrames = String(Number(canvas.dataset.htmlTextureFrames ?? 0) + 1);
        if (remainingMotion < 0.0005) stableFrames += 1;
        else stableFrames = 0;
      };

      const animate = (now: number) => {
        animationFrame = 0;
        if (disposed || document.visibilityState === "hidden") return;
        renderFrame(now);
        if (stableFrames < 18) animationFrame = window.requestAnimationFrame(animate);
      };

      function wake() {
        stableFrames = 0;
        if (!animationFrame && !disposed) animationFrame = window.requestAnimationFrame(animate);
      }

      wakeRef.current = wake;

      const updatePointer = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        if (event.clientY < rect.top || event.clientY > rect.bottom) return;
        pointerRatio = THREE.MathUtils.clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
        wake();
      };

      const onPaint = () => {
        hasTextureSnapshot = true;
        readPromptBounds();
        const count = Number(canvas.dataset.htmlTexturePaints ?? 0) + 1;
        canvas.dataset.htmlTexturePaints = String(count);
        wake();
      };

      const onContextLost = (event: Event) => {
        event.preventDefault();
        setMode("fallback");
        setFallback(true);
      };

      const onResize = () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resize);
      };

      canvas.addEventListener("paint", onPaint);
      canvas.addEventListener("webglcontextlost", onContextLost);
      window.addEventListener("pointermove", updatePointer, { passive: true });
      window.addEventListener("resize", onResize, { passive: true });
      const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
      resizeObserver?.observe(canvas);

      void document.fonts.ready.then(() => {
        if (disposed) return;
        resize();
        canvas.requestPaint?.();
        setReady(true);
      });

      return () => {
        disposed = true;
        resizeObserver?.disconnect();
        window.cancelAnimationFrame(animationFrame);
        window.cancelAnimationFrame(resizeFrame);
        canvas.removeEventListener("paint", onPaint);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        window.removeEventListener("pointermove", updatePointer);
        window.removeEventListener("resize", onResize);
        interactions.disconnect();
        wakeRef.current = null;
        pageTexture.dispose();
        pageGeometry.dispose();
        pageMaterial.dispose();
        backing.geometry.dispose();
        (backing.material as THREE.Material).dispose();
        rigs.forEach((rig) => {
          disposeObject(rig.group);
          rig.spot.dispose();
          rig.point.dispose();
        });
        glowTexture.dispose();
        renderer.dispose();
      };
    }, [htmlCanvasReady, mode, sourceElement]);

    useEffect(() => {
      if (!ready) return;
      requestPaint();
    }, [props.activeTokenIndex, props.focusPosition, props.microphoneActive, props.playing, ready]);

    useEffect(() => () => {
      if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current);
      if (paintTimerRef.current !== null) window.clearTimeout(paintTimerRef.current);
    }, []);

    if (fallback) {
      return (
        <div className="spotlight-fallback-stage" data-html-texture-mode="fallback">
          <CanvasThemeLayer
            theme="spotlight"
            activeTokenIndex={props.activeTokenIndex}
            tokenCount={props.tokenCount}
            focusPosition={props.focusPosition}
            playing={props.playing}
            microphoneActive={props.microphoneActive}
          />
          <div className="spotlight-html-source spotlight-html-source--fallback">
            {props.children}
          </div>
        </div>
      );
    }

    return (
      <>
        <canvas
          ref={canvasRef}
          className={`webgl-stage-layer html-texture-stage${ready ? " is-ready" : ""}`}
          aria-label="受舞台灯光照明的提词区"
          data-html-texture-mode={mode}
        />
        {createPortal(props.children, sourceElement)}
      </>
    );
  },
);
