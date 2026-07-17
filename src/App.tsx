import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Mic, MicOff, Minimize, Pencil, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomControls } from "./components/BottomControls";
import { EditorModal } from "./components/EditorModal";
import { MicrophoneTestModal } from "./components/MicrophoneTestModal";
import { ModelSetup } from "./components/ModelSetup";
import { MobileOrientationGate } from "./components/MobileOrientationGate";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { TeleprompterCanvas, type TeleprompterCanvasHandle } from "./components/TeleprompterCanvas";
import { TopBar } from "./components/TopBar";
import { BrowserSpeechSession, isBrowserSpeechSupported } from "./lib/browserSpeech";
import { findForwardMatch, MatchHysteresis, RecoveryMatchGate, StreamingMatchGate } from "./lib/matcher";
import {
  firstSentenceToken,
  lastSentenceToken,
  nextSentenceToken,
  parseScript,
  previousSentenceToken,
  searchableIndexForDisplay,
} from "./lib/script";
import { loadSettings, saveSettings } from "./lib/storage";
import {
  cancelModelDownload,
  downloadModel,
  getModelStatus,
  isTauri,
  onMicrophoneTestLevel,
  onMicrophoneTestResult,
  onMicrophoneTestState,
  onModelProgress,
  onRecognitionResult,
  onRecognitionState,
  openTextFile,
  requestMicrophonePermission,
  saveTextFile,
  startMicrophoneTest,
  startRecognition,
  stopMicrophoneTest,
  stopRecognition,
} from "./lib/tauri";
import type { ModelProgress, ModelStatus, RecognitionLevel, RecognitionResult, RecognitionState, ScrollMode } from "./lib/types";

const initialSettings = loadSettings();
const RECOVERY_AFTER_LOCAL_MISS_MS = 2500;
const RECOVERY_MIN_FORWARD_START = 10;

function mergeMicrophoneResult(current: RecognitionResult[], result: RecognitionResult): RecognitionResult[] {
  const previous = current.at(-1);
  if (previous && !previous.isFinal) {
    return [...current.slice(0, -1), result];
  }
  return [...current.slice(-11), result];
}
export default function App() {
  const [script, setScript] = useState(initialSettings.script);
  const [mode, setMode] = useState<ScrollMode>(initialSettings.mode);
  const [speed, setSpeed] = useState(initialSettings.speed);
  const [fontSize, setFontSize] = useState(initialSettings.fontSize);
  const [lineHeight, setLineHeight] = useState(initialSettings.lineHeight);
  const [sidePadding, setSidePadding] = useState(initialSettings.sidePadding);
  const [focusPosition, setFocusPosition] = useState(initialSettings.focusPosition);
  const [focusBandHeight, setFocusBandHeight] = useState(initialSettings.focusBandHeight);
  const [dimStrength, setDimStrength] = useState(initialSettings.dimStrength);
  const [skipAheadEnabled, setSkipAheadEnabled] = useState(initialSettings.skipAheadEnabled);
  const [mirrored, setMirrored] = useState(initialSettings.mirrored);
  const [activeTokenIndex, setActiveTokenIndex] = useState(initialSettings.activeTokenIndex);
  const [playing, setPlaying] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [chineseCharactersPerLine, setChineseCharactersPerLine] = useState(20);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [microphoneTestOpen, setMicrophoneTestOpen] = useState(false);
  const [fileName, setFileName] = useState<string>();
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ state: "ready", size: 0, expectedSize: 147951465 });
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [recognitionState, setRecognitionState] = useState<RecognitionState["state"]>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [microphoneTestState, setMicrophoneTestState] = useState<RecognitionState["state"]>("idle");
  const [microphoneTestMessage, setMicrophoneTestMessage] = useState("");
  const [microphoneTestLevel, setMicrophoneTestLevel] = useState<RecognitionLevel>({ level: 0, isSpeech: false });
  const [microphoneTestResults, setMicrophoneTestResults] = useState<RecognitionResult[]>([]);
  const canvasRef = useRef<TeleprompterCanvasHandle>(null);
  const activeTokenIndexRef = useRef(activeTokenIndex);
  const manualResnapTimerRef = useRef<number | null>(null);
  const currentSearchableRef = useRef(0);
  const steadyPositionRef = useRef(0);
  const hysteresisRef = useRef(new MatchHysteresis());
  const recoveryMatchGateRef = useRef(new RecoveryMatchGate());
  const streamingMatchGateRef = useRef(new StreamingMatchGate());
  const localMissStartedAtRef = useRef<number | null>(null);
  const browserSpeechRef = useRef<BrowserSpeechSession | null>(null);
  const followResultHandlerRef = useRef<(result: RecognitionResult) => void>(() => undefined);

  const document = useMemo(() => parseScript(script), [script]);
  activeTokenIndexRef.current = activeTokenIndex;

  followResultHandlerRef.current = (result) => {
    if (!playing || !microphoneEnabled || mode !== "follow") return;
    const nativeRecognition = isTauri();
    if (nativeRecognition && !result.isFinal) return;
    const currentSearchableIndex = currentSearchableRef.current;
    const localCandidate = findForwardMatch(
      result.text,
      document,
      currentSearchableIndex,
      result.isFinal ? 30 : 20,
      false,
    );
    const localMinimumScore = result.isFinal ? 0.72 : 0.76;
    const localMatch = localCandidate && localCandidate.score >= localMinimumScore
      ? localCandidate
      : null;
    let match = localMatch;

    if (localMatch) {
      localMissStartedAtRef.current = null;
      recoveryMatchGateRef.current.reset();
    } else {
      const now = performance.now();
      localMissStartedAtRef.current ??= now;
      const canAttemptRecovery = skipAheadEnabled
        && now - localMissStartedAtRef.current >= RECOVERY_AFTER_LOCAL_MISS_MS;
      if (!canAttemptRecovery) return;

      const recoveryMatch = findForwardMatch(result.text, document, currentSearchableIndex, result.isFinal ? 180 : 72, true);
      const isDistant = recoveryMatch
        && recoveryMatch.startSearchableIndex - currentSearchableIndex >= RECOVERY_MIN_FORWARD_START;
      if (!recoveryMatch || !isDistant) return;

      const recoveryConfirmed = result.isFinal
        ? recoveryMatchGateRef.current.confirmFinal(recoveryMatch)
        : recoveryMatchGateRef.current.confirm(recoveryMatch);
      if (!recoveryConfirmed) return;

      match = recoveryMatch;
      localMissStartedAtRef.current = null;
    }

    if (!match || match.searchableIndex < currentSearchableRef.current) return;
    // Chrome interim transcripts arrive much earlier than final results. A
    // stronger text-match threshold lets them move the prompt provisionally
    // without trusting the browser's often-misleading interim confidence.
    if (!result.isFinal && match.score < 0.76) return;
    const confirmed = nativeRecognition
      ? hysteresisRef.current.confirm(match, document)
      : streamingMatchGateRef.current.confirm(match, result.isFinal);
    if (confirmed) {
      currentSearchableRef.current = match.searchableIndex;
      setActiveTokenIndex(match.displayTokenIndex);
    }
  };

  useEffect(() => {
    if (activeTokenIndex >= document.tokens.length) setActiveTokenIndex(0);
  }, [activeTokenIndex, document.tokens.length]);

  useEffect(() => {
    currentSearchableRef.current = searchableIndexForDisplay(document, activeTokenIndex);
  }, [activeTokenIndex, document]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveSettings({ script, mode, speed, fontSize, lineHeight, sidePadding, focusPosition, focusBandHeight, dimStrength, skipAheadEnabled, mirrored, activeTokenIndex });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [script, mode, speed, fontSize, lineHeight, sidePadding, focusPosition, focusBandHeight, dimStrength, skipAheadEnabled, mirrored, activeTokenIndex]);

  useEffect(() => {
    let cancelled = false;
    void getModelStatus().then((status) => {
      if (!cancelled) setModelStatus(status);
    }).catch((error) => {
      if (!cancelled) setModelStatus({ state: "error", size: 0, expectedSize: 147951465, message: String(error) });
    });

    const unlisteners = Promise.all([
      onModelProgress((progress) => {
        setModelProgress(progress);
        if (progress.state === "downloading" || progress.state === "verifying") {
          setModelStatus((current) => ({ ...current, state: "downloading", size: progress.downloaded }));
        } else if (progress.state === "ready") {
          setModelStatus({ state: "ready", size: progress.total, expectedSize: progress.total });
        } else if (progress.state === "error") {
          setModelStatus({ state: "error", size: progress.downloaded, expectedSize: progress.total, message: progress.message });
        } else if (progress.state === "cancelled") {
          setModelStatus({ state: "missing", size: progress.downloaded, expectedSize: progress.total });
        }
      }),
      onRecognitionState((state) => {
        setRecognitionState(state.state);
        setStatusMessage(state.message ?? "");
      }),
      onRecognitionResult((result) => {
        followResultHandlerRef.current(result);
      }),
    ]);

    return () => {
      cancelled = true;
      void unlisteners.then((listeners) => listeners.forEach((unlisten) => unlisten()));
    };
  }, [document, mode, playing]);

  useEffect(() => {
    const unlisteners = Promise.all([
      onMicrophoneTestState((state) => {
        setMicrophoneTestState(state.state);
        setMicrophoneTestMessage(state.message ?? "");
      }),
      onMicrophoneTestLevel((level) => setMicrophoneTestLevel(level)),
      onMicrophoneTestResult((result) => {
        setMicrophoneTestResults((current) => mergeMicrophoneResult(current, result));
      }),
    ]);

    return () => {
      void unlisteners.then((listeners) => listeners.forEach((unlisten) => unlisten()));
    };
  }, []);

  const nearbyPrompt = useMemo(() => {
    const start = Math.max(0, activeTokenIndex - 10);
    return document.tokens
      .slice(start, activeTokenIndex + 120)
      .filter((token) => token.kind !== "cue")
      .map((token) => token.text)
      .join("");
  }, [activeTokenIndex, document.tokens]);

  useEffect(() => {
    if (modelStatus.state !== "ready" || mode !== "follow" || !playing || !microphoneEnabled || editorOpen || microphoneTestOpen) {
      if (isTauri()) void stopRecognition();
      else {
        browserSpeechRef.current?.stop();
        browserSpeechRef.current = null;
      }
      streamingMatchGateRef.current.reset();
      if ((!playing || !microphoneEnabled) && recognitionState === "listening") setRecognitionState("paused");
      return;
    }

    if (isTauri()) {
      void startRecognition(nearbyPrompt).catch((error) => {
        setRecognitionState("error");
        setStatusMessage(String(error));
      });
      return () => { void stopRecognition(); };
    }

    const session = new BrowserSpeechSession({
      onState: (state) => {
        setRecognitionState(state.state);
        setStatusMessage(state.message ?? "");
      },
      onLevel: () => undefined,
      onResult: (result) => followResultHandlerRef.current(result),
    });
    browserSpeechRef.current = session;
    void session.start(nearbyPrompt).catch((error) => {
      setRecognitionState("error");
      setStatusMessage(String(error));
    });
    return () => {
      session.stop();
      if (browserSpeechRef.current === session) browserSpeechRef.current = null;
    };
  }, [editorOpen, microphoneEnabled, microphoneTestOpen, mode, modelStatus.state, playing]);

  const handleOpenMicrophoneTest = () => {
    setMicrophoneTestOpen(true);
    setPlaying(false);
    if (isTauri()) void stopRecognition();
    else {
      browserSpeechRef.current?.stop();
      browserSpeechRef.current = null;
    }
  };

  const handleStartMicrophoneTest = async () => {
    setPlaying(false);
    setMicrophoneTestResults([]);
    setMicrophoneTestLevel({ level: 0, isSpeech: false });
    if (modelStatus.state !== "ready") {
      setMicrophoneTestState("error");
      setMicrophoneTestMessage("本地模型尚未准备好。");
      return;
    }
    if (!isTauri()) {
      if (!isBrowserSpeechSupported()) {
        setMicrophoneTestState("error");
        setMicrophoneTestMessage("当前浏览器不支持语音识别，请使用最新版 Google Chrome。");
        return;
      }
      try {
        const session = new BrowserSpeechSession({
          onState: (state) => {
            setMicrophoneTestState(state.state);
            setMicrophoneTestMessage(state.message ?? "");
          },
          onLevel: setMicrophoneTestLevel,
          onResult: (result) => {
            setMicrophoneTestResults((current) => mergeMicrophoneResult(current, result));
          },
        });
        browserSpeechRef.current = session;
        await session.start(script, { language: "zh-CN" });
      } catch (error) {
        setMicrophoneTestState("error");
        setMicrophoneTestMessage(String(error));
      }
      return;
    }
    try {
      setMicrophoneTestState("loading");
      setMicrophoneTestMessage("正在请求麦克风权限");
      await requestMicrophonePermission();
      setMicrophoneTestMessage("正在加载本地模型");
      await stopRecognition();
      await startMicrophoneTest();
    } catch (error) {
      setMicrophoneTestState("error");
      setMicrophoneTestMessage(String(error));
    }
  };

  const handleStopMicrophoneTest = async () => {
    if (isTauri()) await stopMicrophoneTest();
    else {
      browserSpeechRef.current?.stop();
      browserSpeechRef.current = null;
    }
    setMicrophoneTestState("idle");
    setMicrophoneTestMessage("");
    setMicrophoneTestLevel({ level: 0, isSpeech: false });
  };

  const handleCloseMicrophoneTest = () => {
    void handleStopMicrophoneTest();
    setMicrophoneTestOpen(false);
  };

  useEffect(() => {
    if (mode !== "steady" || !playing) {
      return;
    }

    steadyPositionRef.current = canvasRef.current?.getScrollTop() ?? 0;
    let animationFrame: number | null = null;
    let previousTime: number | null = null;
    let lastFocusedTokenUpdate = 0;

    const animate = (now: number) => {
      const elapsed = previousTime === null ? 0 : Math.min(100, now - previousTime);
      previousTime = now;
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      const lineHeightInPixels = fontSize * lineHeight;
      const pixelsPerMillisecond = (lineHeightInPixels * 8 * speed) / 60_000;
      const current = canvas.getScrollTop();
      if (Math.abs(current - steadyPositionRef.current) > 2) steadyPositionRef.current = current;
      const maxScroll = canvas.getMaxScroll();
      const next = Math.min(maxScroll, steadyPositionRef.current + pixelsPerMillisecond * elapsed);
      steadyPositionRef.current = next;
      canvas.setScrollTop(next);

      if (maxScroll > 0 && next >= maxScroll) {
        setPlaying(false);
        return;
      }

      if (now - lastFocusedTokenUpdate >= 250) {
        lastFocusedTokenUpdate = now;
        const focused = canvas.findFocusedToken();
        setActiveTokenIndex((currentToken) => focused >= currentToken ? focused : currentToken);
      }
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [chineseCharactersPerLine, fontSize, lineHeight, mode, playing, speed]);

  const clearManualResnap = useCallback(() => {
    if (manualResnapTimerRef.current !== null) {
      window.clearTimeout(manualResnapTimerRef.current);
      manualResnapTimerRef.current = null;
    }
  }, []);

  const moveToToken = useCallback((index: number) => {
    clearManualResnap();
    const safeIndex = Math.min(Math.max(0, index), Math.max(0, document.tokens.length - 1));
    hysteresisRef.current.reset();
    recoveryMatchGateRef.current.reset();
    streamingMatchGateRef.current.reset();
    localMissStartedAtRef.current = null;
    setActiveTokenIndex(safeIndex);
    canvasRef.current?.scrollToToken(safeIndex);
  }, [clearManualResnap, document.tokens.length]);

  const handleManualScroll = useCallback(() => {
    clearManualResnap();
    manualResnapTimerRef.current = window.setTimeout(() => {
      manualResnapTimerRef.current = null;
      canvasRef.current?.scrollToToken(activeTokenIndexRef.current);
    }, 750);
  }, [clearManualResnap]);

  useEffect(() => clearManualResnap, [clearManualResnap]);

  const handleModeChange = (nextMode: ScrollMode) => {
    const focused = canvasRef.current?.findFocusedToken();
    if (focused !== undefined) setActiveTokenIndex(focused);
    setMode(nextMode);
    setPlaying(true);
    hysteresisRef.current.reset();
    recoveryMatchGateRef.current.reset();
    streamingMatchGateRef.current.reset();
    localMissStartedAtRef.current = null;
  };

  const handleChineseCharactersPerLineChange = useCallback((value: number) => {
    setChineseCharactersPerLine((current) => current === value ? current : value);
  }, []);

  const handleToggleFullscreen = async () => {
    const next = !fullscreen;
    try {
      if (isTauri()) await getCurrentWindow().setFullscreen(next);
      else if (next) await globalThis.document.documentElement.requestFullscreen();
      else if (globalThis.document.fullscreenElement) await globalThis.document.exitFullscreen();
      setFullscreen(next);
    } catch (error) {
      setStatusMessage(`无法切换全屏：${String(error)}`);
    }
  };

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (editorOpen || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === "ArrowLeft") {
        moveToToken(previousSentenceToken(document, activeTokenIndex));
      } else if (event.key === "ArrowRight") {
        moveToToken(nextSentenceToken(document, activeTokenIndex));
      } else if (event.key === "Home") {
        moveToToken(firstSentenceToken(document));
      } else if (event.key === "End") {
        moveToToken(lastSentenceToken(document));
      } else if (event.key.toLowerCase() === "m") {
        setMirrored((value) => !value);
      } else if (event.key.toLowerCase() === "f") {
        void handleToggleFullscreen();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setEditorOpen(true);
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  });

  useEffect(() => {
    const syncBrowserFullscreen = () => {
      if (!isTauri()) setFullscreen(Boolean(globalThis.document.fullscreenElement));
    };
    globalThis.document.addEventListener("fullscreenchange", syncBrowserFullscreen);
    let disposed = false;
    let unlistenPromise: Promise<() => void> | undefined;
    if (isTauri()) {
      unlistenPromise = getCurrentWindow().onResized(async () => {
        const value = await getCurrentWindow().isFullscreen();
        if (!disposed) setFullscreen(value);
      });
    }
    return () => {
      disposed = true;
      globalThis.document.removeEventListener("fullscreenchange", syncBrowserFullscreen);
      void unlistenPromise?.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="chrome-actions">
        <button
          className="chrome-toggle-button edit-button"
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-label="编辑文稿"
          title="编辑文稿"
        >
          <Pencil size={22} />
        </button>
        <button
          className={`chrome-toggle-button ${settingsOpen ? "is-active" : ""}`}
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          aria-label={settingsOpen ? "关闭设置" : "打开设置"}
          title={settingsOpen ? "关闭设置" : "打开设置"}
        >
          <Settings size={22} />
        </button>
        <button
          className={`chrome-toggle-button microphone-toggle-button ${microphoneEnabled && mode === "follow" && recognitionState === "listening" ? "is-live" : ""}`}
          type="button"
          onClick={() => setMicrophoneEnabled((value) => !value)}
          aria-pressed={microphoneEnabled}
          aria-label={microphoneEnabled ? "关闭麦克风" : "开启麦克风"}
          title={microphoneEnabled && mode === "follow" && recognitionState === "listening" ? "麦克风正在收音；点击关闭" : microphoneEnabled ? "关闭麦克风" : "开启麦克风"}
        >
          {microphoneEnabled ? <Mic size={21} /> : <MicOff size={21} />}
        </button>
      </div>

      <button
        className="fullscreen-floating-button"
        type="button"
        onClick={() => void handleToggleFullscreen()}
        aria-label={fullscreen ? "退出全屏" : "全屏"}
        title={fullscreen ? "退出全屏" : "全屏"}
      >
        {fullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
      </button>

      <TopBar
        mode={mode}
        speed={speed}
        chineseCharactersPerLine={chineseCharactersPerLine}
        onModeChange={handleModeChange}
        onSpeedChange={setSpeed}
      />

      <TeleprompterCanvas
        ref={canvasRef}
        document={document}
        activeTokenIndex={activeTokenIndex}
        fontSize={fontSize}
        lineHeight={lineHeight}
        sidePadding={sidePadding}
        focusPosition={focusPosition}
        focusBandHeight={focusBandHeight}
        dimStrength={dimStrength}
        mirrored={mirrored}
        mode={mode}
        onChineseCharactersPerLineChange={handleChineseCharactersPerLineChange}
        onManualScroll={handleManualScroll}
        onTokenClick={moveToToken}
      />

      <BottomControls
        playing={playing}
        onFirst={() => moveToToken(firstSentenceToken(document))}
        onPrevious={() => moveToToken(previousSentenceToken(document, activeTokenIndex))}
        onTogglePlaying={() => setPlaying((value) => !value)}
        onNext={() => moveToToken(nextSentenceToken(document, activeTokenIndex))}
        onLast={() => moveToToken(lastSentenceToken(document))}
      />

      <SettingsDrawer
        open={settingsOpen}
        fontSize={fontSize}
        lineHeight={lineHeight}
        sidePadding={sidePadding}
        focusPosition={focusPosition}
        focusBandHeight={focusBandHeight}
        dimStrength={dimStrength}
        skipAheadEnabled={skipAheadEnabled}
        mirrored={mirrored}
        onClose={() => setSettingsOpen(false)}
        onFontSizeChange={setFontSize}
        onLineHeightChange={setLineHeight}
        onSidePaddingChange={setSidePadding}
        onFocusPositionChange={setFocusPosition}
        onFocusBandHeightChange={setFocusBandHeight}
        onDimStrengthChange={setDimStrength}
        onToggleSkipAhead={() => {
          setSkipAheadEnabled((value) => !value);
          hysteresisRef.current.reset();
          recoveryMatchGateRef.current.reset();
          streamingMatchGateRef.current.reset();
          localMissStartedAtRef.current = null;
        }}
        onToggleMirror={() => setMirrored((value) => !value)}
        onMicrophoneTest={() => {
          setSettingsOpen(false);
          handleOpenMicrophoneTest();
        }}
      />

      <EditorModal
        open={editorOpen}
        script={script}
        fileName={fileName}
        onClose={() => setEditorOpen(false)}
        onApply={(value) => {
          setScript(value);
          setActiveTokenIndex(0);
          currentSearchableRef.current = 0;
          hysteresisRef.current.reset();
          recoveryMatchGateRef.current.reset();
          streamingMatchGateRef.current.reset();
          localMissStartedAtRef.current = null;
          canvasRef.current?.setScrollTop(0);
        }}
        onOpenFile={async () => {
          if (isTauri()) {
            const opened = await openTextFile();
            if (opened) setFileName(opened.path.split("/").pop());
            return opened;
          }
          return new Promise((resolve) => {
            const input = globalThis.document.createElement("input");
            input.type = "file";
            input.accept = ".txt,text/plain";
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return resolve(null);
              const reader = new FileReader();
              reader.onload = () => {
                setFileName(file.name);
                resolve({ path: file.name, content: String(reader.result ?? "") });
              };
              reader.onerror = () => resolve(null);
              reader.readAsText(file, "utf-8");
            };
            input.click();
          });
        }}
        onSaveFile={async (content) => {
          if (isTauri()) return saveTextFile(content, fileName);
          const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
          const anchor = globalThis.document.createElement("a");
          anchor.href = URL.createObjectURL(blob);
          anchor.download = fileName ?? "提词稿.txt";
          anchor.click();
          URL.revokeObjectURL(anchor.href);
          return anchor.download;
        }}
      />

      <MicrophoneTestModal
        open={microphoneTestOpen}
        modelState={modelStatus.state}
        state={microphoneTestState}
        message={microphoneTestMessage}
        level={microphoneTestLevel}
        results={microphoneTestResults}
        onStart={() => void handleStartMicrophoneTest()}
        onStop={() => void handleStopMicrophoneTest()}
        onClear={() => setMicrophoneTestResults([])}
        onClose={handleCloseMicrophoneTest}
      />

      {isTauri() && (
        <ModelSetup
          status={modelStatus}
          progress={modelProgress}
          onDownload={() => {
            setModelStatus((current) => ({ ...current, state: "downloading" }));
            void downloadModel().catch((error) => {
              setModelStatus((current) => ({ ...current, state: "error", message: String(error) }));
            });
          }}
          onCancel={() => void cancelModelDownload()}
        />
      )}

      <MobileOrientationGate />
    </div>
  );
}
