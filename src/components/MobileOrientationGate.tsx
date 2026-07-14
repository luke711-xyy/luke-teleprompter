import { RotateCw, Smartphone } from "lucide-react";
import { useCallback, useState } from "react";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

export function MobileOrientationGate() {
  const [message, setMessage] = useState("手机建议横屏使用");

  const requestLandscape = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      await (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape");
      setMessage("已进入横屏模式");
    } catch {
      setMessage("请将设备旋转为横屏");
    }
  }, []);

  return (
    <aside className="mobile-orientation-gate" aria-label="横屏提示">
      <div className="mobile-orientation-gate__panel">
        <Smartphone size={44} strokeWidth={1.5} />
        <h2>请横屏使用</h2>
        <p>{message}</p>
        <button type="button" onClick={requestLandscape}>
          <RotateCw size={19} />
          <span>进入横屏</span>
        </button>
      </div>
    </aside>
  );
}
