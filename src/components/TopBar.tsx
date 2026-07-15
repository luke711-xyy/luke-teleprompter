import type { ScrollMode } from "../lib/types";

interface TopBarProps {
  mode: ScrollMode;
  speed: number;
  chineseCharactersPerLine: number;
  onModeChange: (mode: ScrollMode) => void;
  onSpeedChange: (speed: number) => void;
}

export function TopBar({
  mode,
  speed,
  chineseCharactersPerLine,
  onModeChange,
  onSpeedChange,
}: TopBarProps) {
  const charactersPerMinute = Math.round(Math.max(1, chineseCharactersPerLine) * 8 * speed);

  return (
    <header className="topbar">
      <h1 className="app-title"><span>luke</span><span>teleprompter</span></h1>
      <div className="topbar__controls">
        <div className="segmented topbar__mode-switch" role="group" aria-label="滚动模式">
          <button
            className={mode === "follow" ? "is-active" : ""}
            onClick={() => onModeChange("follow")}
            aria-pressed={mode === "follow"}
          >
            自动跟读
          </button>
          <button
            className={mode === "steady" ? "is-active" : ""}
            onClick={() => onModeChange("steady")}
            aria-pressed={mode === "steady"}
          >
            匀速滚动
          </button>
        </div>

        {mode === "steady" && (
          <label className="speed-control" title={`当前约 ${charactersPerMinute} 字/分`}>
            <span className="speed-control__label">速度</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speed}
              onChange={(event) => onSpeedChange(Number(event.target.value))}
              aria-label="匀速滚动速度"
              aria-valuetext={`约 ${charactersPerMinute} 字/分`}
            />
            <output>{charactersPerMinute} 字/分</output>
          </label>
        )}
      </div>
    </header>
  );
}
