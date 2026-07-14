import { Download, RotateCcw, X } from "lucide-react";
import type { ModelProgress, ModelStatus } from "../lib/types";

interface ModelSetupProps {
  status: ModelStatus;
  progress: ModelProgress | null;
  onDownload: () => void;
  onCancel: () => void;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ModelSetup({ status, progress, onDownload, onCancel }: ModelSetupProps) {
  if (status.state === "ready") return null;
  const downloading = status.state === "downloading" || progress?.state === "downloading" || progress?.state === "verifying";
  const downloaded = progress?.downloaded ?? status.size;
  const total = progress?.total || status.expectedSize;
  const percent = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;

  return (
    <div className="modal-backdrop model-backdrop">
      <section className="model-setup" role="dialog" aria-modal="true" aria-labelledby="model-title">
        <div className="model-icon"><Download size={28} /></div>
        <h2 id="model-title">准备本地语音识别</h2>
        <p>首次使用需要下载 Whisper base 多语言模型。下载完成后，中文与 English 识别均在本机离线运行。</p>

        {downloading ? (
          <>
            <div className="model-progress"><span style={{ width: `${percent}%` }} /></div>
            <div className="model-progress-label">
              <span>{progress?.state === "verifying" ? "正在校验模型…" : `正在下载 ${percent.toFixed(0)}%`}</span>
              <span>{formatBytes(downloaded)} / {formatBytes(total)}</span>
            </div>
            <button className="secondary-button model-cancel" onClick={onCancel}><X size={17} />取消下载</button>
          </>
        ) : (
          <>
            {status.state === "error" && <p className="model-error">{status.message ?? "模型下载失败，请重试。"}</p>}
            <button className="primary-button model-download" onClick={onDownload}>
              {status.state === "error" ? <RotateCcw size={18} /> : <Download size={18} />}
              {status.state === "error" ? "重新下载" : `下载模型 · ${formatBytes(status.expectedSize)}`}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
