import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
} from "lucide-react";
import { IconButton } from "./IconButton";
interface BottomControlsProps {
  className?: string;
  playing: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onTogglePlaying: () => void;
  onNext: () => void;
  onLast: () => void;
}

export function BottomControls({
  className,
  playing,
  onFirst,
  onPrevious,
  onTogglePlaying,
  onNext,
  onLast,
}: BottomControlsProps) {
  return (
    <footer
      className={`bottom-controls ${className ?? ""}`.trim()}
      data-config='{"blurAmount":0.18,"refraction":0.32,"chromAberration":0.025,"edgeHighlight":0.2,"specular":0.32,"fresnel":0.86,"cornerRadius":34,"zRadius":24,"opacity":0.94,"shadowOpacity":0.24,"shadowSpread":12}'
    >
      <div className="transport-controls">
        <IconButton
          icon={<ChevronsLeft size={20} />}
          label="第一句"
          onClick={onFirst}
          className="transport-button transport-button--edge"
          compact
        />
        <IconButton
          icon={<ChevronLeft size={22} />}
          label="上一句"
          onClick={onPrevious}
          className="transport-button"
          compact
        />
        <button
          className="play-button"
          onClick={onTogglePlaying}
          aria-label={playing ? "暂停" : "继续"}
        >
          {playing ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
        </button>
        <IconButton
          icon={<ChevronRight size={22} />}
          label="下一句"
          onClick={onNext}
          className="transport-button"
          compact
        />
        <IconButton
          icon={<ChevronsRight size={20} />}
          label="最后一句"
          onClick={onLast}
          className="transport-button transport-button--edge"
          compact
        />
      </div>

    </footer>
  );
}
