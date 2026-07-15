import { Mic, MicOff, Pencil, Shuffle } from "lucide-react";
import type { ScrollMode } from "../lib/types";

interface TopBarProps {
  mode: ScrollMode;
  speed: number;
  microphoneEnabled: boolean;
  chineseCharactersPerLine: number;
  skipAheadEnabled: boolean;
  onModeChange: (mode: ScrollMode) => void;
  onSpeedChange: (speed: number) => void;
  onToggleMicrophone: () => void;
  onToggleSkipAhead: () => void;
  onEdit: () => void;
}

export function TopBar({
  mode,
  speed,
  microphoneEnabled,
  chineseCharactersPerLine,
  skipAheadEnabled,
  onModeChange,
  onSpeedChange,
  onToggleMicrophone,
  onToggleSkipAhead,
  onEdit,
}: TopBarProps) {
  const charactersPerMinute = Math.round(Math.max(1, chineseCharactersPerLine) * 8 * speed);

  return (
    <header className="topbar">
      <h1 className="app-title"><span>luke</span><span>teleprompter</span></h1>
      <div className="topbar__controls">
        <div className="segmented" role="group" aria-label="滚动模式">
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

        {mode === "follow" ? (
          <>
            <button
              className={`microphone-toggle ${microphoneEnabled ? "is-active" : ""}`}
              onClick={onToggleMicrophone}
              aria-pressed={microphoneEnabled}
              title={microphoneEnabled ? "关闭麦克风" : "开启麦克风"}
            >
              {microphoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
              <span>{microphoneEnabled ? "关闭麦克风" : "开启麦克风"}</span>
            </button>

            <button
              className={`skip-ahead-button ${skipAheadEnabled ? "is-active" : ""}`}
              onClick={onToggleSkipAhead}
              aria-pressed={skipAheadEnabled}
              title={skipAheadEnabled
                ? "智能跳读已开启：局部持续失配后才会尝试恢复定位"
                : "顺序读已开启：只在当前位置附近追赶，不会远距跳读"}
            >
              <Shuffle size={18} />
              <span>{skipAheadEnabled ? "跳读开" : "顺序读"}</span>
            </button>
          </>
        ) : (
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

        <button className="edit-button" onClick={onEdit}>
          <Pencil size={19} />
          <span>编辑文稿</span>
        </button>
      </div>
    </header>
  );
}
