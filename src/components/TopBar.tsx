import { ChevronDown, Mic, Pencil, Radio } from "lucide-react";
import type { ModelState, RecognitionState, ScrollMode } from "../lib/types";

interface TopBarProps {
  mode: ScrollMode;
  speed: number;
  modelState: ModelState;
  recognitionState: RecognitionState["state"];
  onModeChange: (mode: ScrollMode) => void;
  onSpeedChange: (speed: number) => void;
  onEdit: () => void;
  onMicrophoneTest: () => void;
}

function listeningLabel(modelState: ModelState, state: RecognitionState["state"], mode: ScrollMode): string {
  if (modelState === "downloading") return "准备模型";
  if (modelState !== "ready") return "模型未就绪";
  if (mode === "steady") return "匀速滚动";
  if (state === "loading") return "正在加载";
  if (state === "error") return "需要检查";
  if (state === "paused" || state === "idle") return "已暂停";
  return "正在聆听";
}

export function TopBar({
  mode,
  speed,
  modelState,
  recognitionState,
  onModeChange,
  onSpeedChange,
  onEdit,
  onMicrophoneTest,
}: TopBarProps) {
  const isListening = recognitionState === "listening" && mode === "follow";

  return (
    <header className="topbar">
      <h1 className="app-title">提词器</h1>
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

        <div className={`listening-status ${isListening ? "is-live" : ""}`} aria-live="polite">
          <Mic size={21} strokeWidth={2} />
          <span>{listeningLabel(modelState, recognitionState, mode)}</span>
        </div>

        <label className={`speed-select ${mode === "follow" ? "is-muted" : ""}`}>
          <span>速度</span>
          <select
            value={speed.toFixed(1)}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            disabled={mode === "follow"}
            aria-label="匀速滚动速度"
          >
            {Array.from({ length: 16 }, (_, index) => 0.5 + index * 0.1).map((value) => (
              <option value={value.toFixed(1)} key={value.toFixed(1)}>{value.toFixed(1)}×</option>
            ))}
          </select>
          <ChevronDown size={17} aria-hidden="true" />
        </label>

        <button className="microphone-test-button" onClick={onMicrophoneTest}>
          <Radio size={19} />
          <span>麦克风测试</span>
        </button>

        <button className="edit-button" onClick={onEdit}>
          <Pencil size={19} />
          <span>编辑文稿</span>
        </button>
      </div>
    </header>
  );
}
