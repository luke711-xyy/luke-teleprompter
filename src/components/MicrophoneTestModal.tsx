import { Mic, RotateCcw, Square, X } from "lucide-react";
import type { ModelState, RecognitionLevel, RecognitionResult, RecognitionState } from "../lib/types";

interface MicrophoneTestModalProps {
  open: boolean;
  modelState: ModelState;
  state: RecognitionState["state"];
  message: string;
  level: RecognitionLevel;
  results: RecognitionResult[];
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onClose: () => void;
}

function stateLabel(state: RecognitionState["state"], modelState: ModelState): string {
  if (modelState !== "ready") return "模型未就绪";
  if (state === "loading") return "正在加载";
  if (state === "listening") return "正在测试";
  if (state === "error") return "需要检查";
  return "未开始";
}

export function MicrophoneTestModal({
  open,
  modelState,
  state,
  message,
  level,
  results,
  onStart,
  onStop,
  onClear,
  onClose,
}: MicrophoneTestModalProps) {
  if (!open) return null;

  const isRunning = state === "loading" || state === "listening";
  const canStart = modelState === "ready" && !isRunning;
  const levelPercent = `${Math.round(level.level * 100)}%`;

  return (
    <div className="modal-backdrop microphone-test-backdrop" role="dialog" aria-modal="true" aria-labelledby="microphone-test-title">
      <section className="microphone-test-modal">
        <header className="microphone-test-modal__header">
          <div>
            <h2 id="microphone-test-title">麦克风测试</h2>
            <p>{message || "说一段中文或 English，下面会显示实时识别结果。"}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="关闭麦克风测试">
            <X size={20} />
          </button>
        </header>

        <div className="microphone-test-body">
          <div className={`mic-health-card ${level.isSpeech ? "is-speaking" : ""}`}>
            <div className="mic-health-card__topline">
              <span className="mic-health-card__icon"><Mic size={26} /></span>
              <span>{stateLabel(state, modelState)}</span>
            </div>
            <div className="mic-meter" aria-label="麦克风输入电平">
              <span style={{ width: levelPercent }} />
            </div>
            <div className="mic-health-card__meta">
              <span>{level.isSpeech ? "检测到说话" : "等待声音"}</span>
              <span>{levelPercent}</span>
            </div>
          </div>

          <div className="transcript-panel">
            <div className="transcript-panel__title">实时转写</div>
            <div className="transcript-list" aria-live="polite">
              {results.length === 0 ? (
                <p className="transcript-empty">测试开始后，说话内容会显示在这里。</p>
              ) : (
                results.map((result, index) => (
                  <p key={`${result.text}-${index}`}>
                    <span>{result.text}</span>
                    <small>{result.detectedLanguage || "auto"} · {Math.round(result.confidence * 100)}%</small>
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        <footer className="microphone-test-modal__footer">
          <button className="secondary-button" onClick={onClear}>
            <RotateCcw size={16} />
            <span>清空结果</span>
          </button>
          {isRunning ? (
            <button className="primary-button microphone-stop-button" onClick={onStop}>
              <Square size={16} />
              <span>停止测试</span>
            </button>
          ) : (
            <button className="primary-button" onClick={onStart} disabled={!canStart}>
              <Mic size={16} />
              <span>开始测试</span>
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
