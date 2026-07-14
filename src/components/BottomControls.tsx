import {
  CaseSensitive,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
} from "lucide-react";
import { IconButton } from "./IconButton";

interface BottomControlsProps {
  playing: boolean;
  mirrored: boolean;
  fullscreen: boolean;
  fontSize: number;
  onPrevious: () => void;
  onTogglePlaying: () => void;
  onNext: () => void;
  onFontSizeChange: (value: number) => void;
  onToggleMirror: () => void;
  onToggleFullscreen: () => void;
}

export function BottomControls({
  playing,
  mirrored,
  fullscreen,
  fontSize,
  onPrevious,
  onTogglePlaying,
  onNext,
  onFontSizeChange,
  onToggleMirror,
  onToggleFullscreen,
}: BottomControlsProps) {
  return (
    <footer className="bottom-controls">
      <div className="transport-controls">
        <IconButton icon={<ChevronLeft size={24} />} label="上一句" onClick={onPrevious} compact />
        <button
          className="play-button"
          onClick={onTogglePlaying}
          aria-label={playing ? "暂停" : "继续"}
        >
          {playing ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
        </button>
        <IconButton icon={<ChevronRight size={24} />} label="下一句" onClick={onNext} compact />
      </div>

      <div className="utility-controls">
        <label className="font-control" title={`当前字号 ${fontSize}px`}>
          <CaseSensitive size={31} strokeWidth={1.65} />
          <span>文字大小</span>
          <input
            type="range"
            min="44"
            max="92"
            step="2"
            value={fontSize}
            onChange={(event) => onFontSizeChange(Number(event.target.value))}
            aria-label="文字大小"
          />
        </label>
        <span className="control-divider" />
        <IconButton
          icon={<RectangleHorizontal size={27} strokeWidth={1.7} />}
          label="镜像（水平）"
          onClick={onToggleMirror}
          aria-pressed={mirrored}
          className={mirrored ? "is-active" : ""}
        />
        <span className="control-divider" />
        <IconButton
          icon={fullscreen ? <Minimize size={26} /> : <Maximize size={26} />}
          label={fullscreen ? "退出全屏" : "全屏"}
          onClick={onToggleFullscreen}
        />
      </div>
    </footer>
  );
}
