import { FileDown, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface EditorModalProps {
  open: boolean;
  script: string;
  fileName?: string;
  onClose: () => void;
  onApply: (script: string) => void;
  onOpenFile: () => Promise<{ path: string; content: string } | null>;
  onSaveFile: (content: string) => Promise<string | null>;
}

export function EditorModal({
  open,
  script,
  fileName,
  onClose,
  onApply,
  onOpenFile,
  onSaveFile,
}: EditorModalProps) {
  const [draft, setDraft] = useState(script);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(script);
      setMessage("");
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, script]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onApply(draft);
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, onApply, onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header className="editor-modal__header">
          <div>
            <h2 id="editor-title">编辑文稿</h2>
            <p>{fileName ?? "未命名文稿.txt"}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="关闭编辑器"><X size={22} /></button>
        </header>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="在这里粘贴或输入文稿……"
          spellCheck={false}
        />

        <footer className="editor-modal__footer">
          <div className="editor-file-actions">
            <button
              onClick={async () => {
                const opened = await onOpenFile();
                if (opened) {
                  setDraft(opened.content);
                  setMessage(`已打开 ${opened.path.split("/").pop()}`);
                }
              }}
            >
              <FileText size={18} />打开 TXT
            </button>
            <button
              onClick={async () => {
                const path = await onSaveFile(draft);
                if (path) setMessage(`已保存 ${path.split("/").pop()}`);
              }}
            >
              <FileDown size={18} />保存 TXT
            </button>
            <span className="editor-message" aria-live="polite">{message}</span>
          </div>
          <div className="editor-confirm-actions">
            <button className="secondary-button" onClick={onClose}>取消</button>
            <button
              className="primary-button"
              onClick={() => {
                onApply(draft.trim() ? draft : " ");
                onClose();
              }}
            >
              应用文稿
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
