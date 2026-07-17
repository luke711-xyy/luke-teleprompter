import {
  CaseSensitive,
  Cpu,
  EyeOff,
  MoveVertical,
  Radio,
  RectangleHorizontal,
  Shuffle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  DIM_STRENGTH_MAX,
  DIM_STRENGTH_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FOCUS_POSITION_MAX,
  FOCUS_POSITION_MIN,
  FOCUS_BAND_HEIGHT_MAX,
  FOCUS_BAND_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  SIDE_PADDING_MAX,
  SIDE_PADDING_MIN,
} from "../lib/settingsBounds";

interface SettingsDrawerProps {
  open: boolean;
  fontSize: number;
  lineHeight: number;
  sidePadding: number;
  focusPosition: number;
  focusBandHeight: number;
  dimStrength: number;
  skipAheadEnabled: boolean;
  mirrored: boolean;
  localWhisperServiceState?: "ready" | "stopped" | "checking" | "starting" | "stopping" | "unavailable";
  localWhisperServiceMessage: string;
  onClose: () => void;
  onFontSizeChange: (value: number) => void;
  onLineHeightChange: (value: number) => void;
  onSidePaddingChange: (value: number) => void;
  onFocusPositionChange: (value: number) => void;
  onFocusBandHeightChange: (value: number) => void;
  onDimStrengthChange: (value: number) => void;
  onToggleSkipAhead: () => void;
  onToggleMirror: () => void;
  onToggleLocalWhisperService: () => void;
  onMicrophoneTest: () => void;
}

interface SliderSettingProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  output: string;
  icon: ReactNode;
  onChange: (value: number) => void;
  valueText?: string;
}

function SliderSetting({ label, value, min, max, step, output, icon, onChange, valueText }: SliderSettingProps) {
  return (
    <label className="drawer-setting">
      <span className="drawer-setting__heading">
        <span>{icon}</span>
        {label}
        <output>{output}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
      />
    </label>
  );
}

export function SettingsDrawer({
  open,
  fontSize,
  lineHeight,
  sidePadding,
  focusPosition,
  focusBandHeight,
  dimStrength,
  skipAheadEnabled,
  mirrored,
  localWhisperServiceState,
  localWhisperServiceMessage,
  onClose,
  onFontSizeChange,
  onLineHeightChange,
  onSidePaddingChange,
  onFocusPositionChange,
  onFocusBandHeightChange,
  onDimStrengthChange,
  onToggleSkipAhead,
  onToggleMirror,
  onToggleLocalWhisperService,
  onMicrophoneTest,
}: SettingsDrawerProps) {
  if (!open) return null;

  return (
    <aside
      className="settings-drawer"
      aria-label="阅读设置"
    >
      <header className="settings-drawer__header">
        <span><SlidersHorizontal size={20} /> 阅读设置</span>
        <button type="button" onClick={onClose} aria-label="关闭设置" title="关闭设置"><X size={20} /></button>
      </header>
      <div className="settings-drawer__body">
        <SliderSetting
          label="文字大小"
          value={fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={2}
          output={`${fontSize}px`}
          icon={<CaseSensitive size={20} />}
          onChange={onFontSizeChange}
        />
        <SliderSetting
          label="行距"
          value={lineHeight}
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={0.05}
          output={`${lineHeight.toFixed(2)}×`}
          icon={<MoveVertical size={20} />}
          onChange={onLineHeightChange}
        />
        <SliderSetting
          label="左右边距"
          value={sidePadding}
          min={SIDE_PADDING_MIN}
          max={SIDE_PADDING_MAX}
          step={1}
          output={`${sidePadding}%`}
          icon={<RectangleHorizontal size={20} />}
          onChange={onSidePaddingChange}
          valueText={`每侧 ${sidePadding}%`}
        />
        <SliderSetting
          label="阅读位置"
          value={focusPosition}
          min={FOCUS_POSITION_MIN}
          max={FOCUS_POSITION_MAX}
          step={1}
          output={`${focusPosition}%`}
          icon={<MoveVertical size={20} />}
          onChange={onFocusPositionChange}
          valueText={`${focusPosition}%，${focusPosition < 45 ? "靠上" : focusPosition > 55 ? "靠下" : "居中"}`}
        />
        <SliderSetting
          label="高亮区域高度"
          value={focusBandHeight}
          min={FOCUS_BAND_HEIGHT_MIN}
          max={FOCUS_BAND_HEIGHT_MAX}
          step={1}
          output={`${focusBandHeight}px`}
          icon={<RectangleHorizontal size={20} />}
          onChange={onFocusBandHeightChange}
          valueText={`${focusBandHeight}px`}
        />
        <SliderSetting
          label="暗显强度"
          value={dimStrength}
          min={DIM_STRENGTH_MIN}
          max={DIM_STRENGTH_MAX}
          step={1}
          output={`${dimStrength}%`}
          icon={<EyeOff size={20} />}
          onChange={onDimStrengthChange}
          valueText={`${dimStrength}%，${dimStrength === 0 ? "关闭暗显" : dimStrength < 40 ? "轻微暗显" : dimStrength > 75 ? "强暗显" : "中等暗显"}`}
        />
        <button className={`drawer-toggle ${mirrored ? "is-active" : ""}`} onClick={onToggleMirror} aria-pressed={mirrored}>
          <RectangleHorizontal size={20} /> 镜像（水平）
          <span>{mirrored ? "已开启" : "关闭"}</span>
        </button>
        <button
          className={`drawer-toggle ${skipAheadEnabled ? "is-active" : ""}`}
          onClick={onToggleSkipAhead}
          aria-label="跳读匹配"
          aria-pressed={skipAheadEnabled}
          title={skipAheadEnabled
            ? "智能跳读已开启：局部持续失配后才会尝试恢复定位"
            : "顺序读已开启：只在当前位置附近追赶，不会远距跳读"}
        >
          <Shuffle size={20} /> 跳读匹配
          <span>{skipAheadEnabled ? "已开启" : "顺序"}</span>
        </button>
        {localWhisperServiceState && (
          <section className="drawer-service" aria-label="可选本机 Whisper 模型">
            <div className="drawer-service__heading">
              <span><Cpu size={20} /> 可选本机 Whisper 模型</span>
              <output className={`drawer-service__status is-${localWhisperServiceState}`}>
                {localWhisperServiceState === "ready" ? "已载入" : localWhisperServiceState === "stopped" ? "未载入" : localWhisperServiceState === "unavailable" ? "未连接" : "处理中"}
              </output>
            </div>
            <p>
              {localWhisperServiceMessage || (localWhisperServiceState === "ready"
                ? "模型已载入内存。当前网页版仍使用 Chrome 语音识别；关闭这里只会释放可选 Whisper 模型，不会关闭麦克风。"
                : localWhisperServiceState === "stopped"
                  ? "模型未载入，不占用 Whisper 推理内存。网页麦克风仍可用，因为它走 Chrome 语音识别。"
                  : "正在检查这台 Mac 上的本机模型服务。")}
            </p>
            <button
              className={`drawer-service__button ${localWhisperServiceState === "ready" ? "is-stop" : ""}`}
              onClick={onToggleLocalWhisperService}
              disabled={localWhisperServiceState === "checking" || localWhisperServiceState === "starting" || localWhisperServiceState === "stopping"}
            >
              <Cpu size={19} />
              {localWhisperServiceState === "ready" ? "关闭并释放模型" : localWhisperServiceState === "unavailable" ? "重新检测服务" : localWhisperServiceState === "starting" ? "正在启动模型…" : localWhisperServiceState === "stopping" ? "正在释放模型…" : "启动模型服务"}
            </button>
          </section>
        )}
      </div>
      <footer className="settings-drawer__footer">
        <button className="drawer-microphone-test" onClick={onMicrophoneTest}>
          <Radio size={19} /> 麦克风测试
        </button>
      </footer>
    </aside>
  );
}
