import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const localRecognizedPhrase = "今天我们来看看这款产品 and why it fits naturally into your everyday workflow";
const distantRecognizedPhrase = "接下来我们会进行实际演示 so you can see exactly how it works";
const browserSpeechMock = vi.hoisted(() => ({
  starts: [] as Array<{ prompt: string; options: { language?: string } }>,
  emitFinalRecognition: true,
  recognizedPhrase: "今天我们来看看这款产品 and why it fits naturally into your everyday workflow",
  emit: undefined as ((text: string, isFinal: boolean) => void) | undefined,
  recoverable: undefined as (() => void) | undefined,
}));
const localWhisperMock = vi.hoisted(() => ({
  starts: [] as Array<{ prompt: string; options: { language?: string } }>,
  stops: 0,
  recognizedPhrase: "今天我们来看看这款产品 and why it fits naturally into your everyday workflow",
}));
const cloudTranscriptionMock = vi.hoisted(() => ({
  starts: [] as Array<{ prompt: string; options: { language?: string } }>,
  stops: 0,
  recognizedPhrase: "今天我们来看看这款产品 and why it fits naturally into your everyday workflow",
}));
const requestFullscreenMock = vi.fn(async () => undefined);
const orientationLockMock = vi.fn(async () => undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setFullscreen: vi.fn(),
    onResized: vi.fn(async () => vi.fn()),
    isFullscreen: vi.fn(async () => false),
  }),
}));

vi.mock("./lib/browserSpeech", () => {
  class MockBrowserSpeechSession {
    constructor(private readonly callbacks: {
      onState: (state: { state: "loading" | "listening" | "error"; message?: string }) => void;
      onLevel: (level: { level: number; isSpeech: boolean }) => void;
      onResult: (result: { text: string; detectedLanguage: string; confidence: number; isFinal: boolean }) => void;
      onRecoverableError?: (error: "network" | "language-not-supported" | "service-not-allowed") => void;
    }) {}

    async start(prompt = "", options: { language?: string } = {}) {
      browserSpeechMock.starts.push({ prompt, options });
      this.callbacks.onState({ state: "listening", message: "Chrome 正在识别中文 / English" });
      this.callbacks.onLevel({ level: 0.2, isSpeech: true });
      browserSpeechMock.emit = (text, isFinal) => {
        this.callbacks.onResult({
          text,
          detectedLanguage: "zh-CN",
          confidence: isFinal ? 0.91 : 0.01,
          isFinal,
        });
      };
      browserSpeechMock.recoverable = () => this.callbacks.onRecoverableError?.("network");
      browserSpeechMock.emit(browserSpeechMock.recognizedPhrase, false);
      if (browserSpeechMock.emitFinalRecognition) browserSpeechMock.emit(browserSpeechMock.recognizedPhrase, true);
    }

    stop() {}
  }

  return { BrowserSpeechSession: MockBrowserSpeechSession, isBrowserSpeechSupported: () => true };
});

vi.mock("./lib/cloudTranscription", () => {
  class MockCloudTranscriptionSession {
    constructor(private readonly callbacks: {
      onState: (state: { state: "loading" | "listening" | "error"; message?: string }) => void;
      onLevel: (level: { level: number; isSpeech: boolean }) => void;
      onResult: (result: { text: string; detectedLanguage: string; confidence: number; isFinal: boolean }) => void;
    }) {}

    async start(prompt = "", options: { language?: string } = {}) {
      cloudTranscriptionMock.starts.push({ prompt, options });
      this.callbacks.onState({ state: "listening", message: "Cloudflare 正在识别中文 / English" });
      this.callbacks.onLevel({ level: 0.2, isSpeech: true });
      this.callbacks.onResult({
        text: cloudTranscriptionMock.recognizedPhrase,
        detectedLanguage: "chinese",
        confidence: 0.8,
        isFinal: true,
      });
    }

    stop() {
      cloudTranscriptionMock.stops += 1;
    }
  }

  return { CloudTranscriptionSession: MockCloudTranscriptionSession, isCloudTranscriptionConfigured: () => true };
});

vi.mock("./lib/localWhisper", () => {
  class MockLocalWhisperSession {
    constructor(private readonly callbacks: {
      onState: (state: { state: "loading" | "listening" | "error"; message?: string }) => void;
      onLevel: (level: { level: number; isSpeech: boolean }) => void;
      onResult: (result: { text: string; detectedLanguage: string; confidence: number; isFinal: boolean }) => void;
    }) {}

    async start(prompt = "", options: { language?: string } = {}) {
      localWhisperMock.starts.push({ prompt, options });
      this.callbacks.onState({ state: "listening", message: "Whisper base 正在本机识别中文 / English" });
      this.callbacks.onLevel({ level: 0.2, isSpeech: true });
      this.callbacks.onResult({
        text: localWhisperMock.recognizedPhrase,
        detectedLanguage: "chinese",
        confidence: 0.8,
        isFinal: true,
      });
    }

    stop() {
      localWhisperMock.stops += 1;
    }
  }

  return {
    LocalWhisperSession: MockLocalWhisperSession,
    isLocalWhisperSupported: () => true,
    getLocalWhisperServiceStatus: async () => "stopped",
    startLocalWhisperService: async () => "ready",
    stopLocalWhisperService: async () => "stopped",
  };
});

describe("microphone test panel", () => {
  beforeEach(() => {
    browserSpeechMock.starts = [];
    browserSpeechMock.emitFinalRecognition = true;
    browserSpeechMock.recognizedPhrase = localRecognizedPhrase;
    browserSpeechMock.emit = undefined;
    browserSpeechMock.recoverable = undefined;
    localWhisperMock.starts = [];
    localWhisperMock.stops = 0;
    localWhisperMock.recognizedPhrase = localRecognizedPhrase;
    cloudTranscriptionMock.starts = [];
    cloudTranscriptionMock.stops = 0;
    cloudTranscriptionMock.recognizedPhrase = localRecognizedPhrase;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreenMock,
    });
    Object.defineProperty(globalThis.screen, "orientation", {
      configurable: true,
      value: { lock: orientationLockMock },
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    requestFullscreenMock.mockClear();
    orientationLockMock.mockClear();
  });

  it("opens, starts, shows live transcript, and clears results", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: /麦克风测试/ }));
    expect(screen.getByRole("dialog", { name: "麦克风测试" })).toBeInTheDocument();
    expect(screen.getByText("未开始")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /开始测试/ }));
    await waitFor(() => expect(screen.getByText("正在测试")).toBeInTheDocument());
    expect(screen.getAllByText(browserSpeechMock.recognizedPhrase)).toHaveLength(1);
    expect(screen.getByText("zh-CN · 91%")).toBeInTheDocument();
    expect(screen.queryByText("zh-CN · 1%")).not.toBeInTheDocument();
    expect(browserSpeechMock.starts).toContainEqual(expect.objectContaining({ options: { language: "zh-CN" } }));

    fireEvent.click(screen.getByRole("button", { name: /清空结果/ }));
    expect(screen.queryByText(browserSpeechMock.recognizedPhrase)).not.toBeInTheDocument();
  });

  it("keeps the browser microphone disabled until the user activates it", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "开启麦克风" })).toBeInTheDocument();
    expect(browserSpeechMock.starts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
    expect(browserSpeechMock.starts).toHaveLength(1);
  });

  it("switches automatic following to local Whisper and starts the local audio pipeline", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "本机 Whisper" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "本机 Whisper" })).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
    await waitFor(() => expect(localWhisperMock.starts).toHaveLength(1));
    expect(browserSpeechMock.starts).toHaveLength(0);
  });

  it("labels microphone testing with the selected local Whisper engine", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "本机 Whisper" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "本机 Whisper" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: /麦克风测试/ }));

    expect(screen.getByText("当前识别方式：本机 Whisper")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /开始测试/ }));
    await waitFor(() => expect(localWhisperMock.starts).toHaveLength(1));
    expect(screen.getByText("chinese · 80%")).toBeInTheDocument();
  });

  it("switches the microphone test to Cloudflare transcription when selected", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "Cloudflare 转写" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cloudflare 转写" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: /麦克风测试/ }));

    expect(screen.getByText("当前识别方式：Cloudflare 转写")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /开始测试/ }));
    await waitFor(() => expect(cloudTranscriptionMock.starts).toHaveLength(1));
    expect(screen.getByText("chinese · 80%")).toBeInTheDocument();
  });

  it("automatically falls back from Chrome to Cloudflare for following", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
    await waitFor(() => expect(browserSpeechMock.starts).toHaveLength(1));

    await act(async () => browserSpeechMock.recoverable?.());

    await waitFor(() => expect(cloudTranscriptionMock.starts).toHaveLength(1));
  });

  it("advances the browser teleprompter from one Chrome final recognition result", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("workflow.");
    });
  });

  it("advances provisionally from a strong Chrome interim result", async () => {
    browserSpeechMock.emitFinalRecognition = false;
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("workflow.");
    });
  });

  it("only recovers to a distant final result after local tracking has been missing for a while", async () => {
    browserSpeechMock.emitFinalRecognition = false;
    browserSpeechMock.recognizedPhrase = distantRecognizedPhrase;
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));

    await waitFor(() => expect(browserSpeechMock.starts.length).toBeGreaterThan(0));
    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("今");
    now = 2501;
    await act(async () => browserSpeechMock.emit?.(distantRecognizedPhrase, true));

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("works.");
    });
    clock.mockRestore();
  });

  it("does not use distant recovery when sequential reading is enabled", async () => {
    browserSpeechMock.emitFinalRecognition = false;
    browserSpeechMock.recognizedPhrase = distantRecognizedPhrase;
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
    await waitFor(() => expect(browserSpeechMock.starts.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "跳读匹配" }));

    now = 2501;
    await act(async () => browserSpeechMock.emit?.(distantRecognizedPhrase, true));

    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("今");
    clock.mockRestore();
  });

  it("keeps reading settings in the right-side drawer and persists layout changes", async () => {
    render(<App />);

    expect(screen.queryByRole("slider", { name: "阅读位置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /麦克风测试/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    expect(screen.getByRole("complementary", { name: "阅读设置" })).toBeInTheDocument();
    const positionSlider = screen.getByRole("slider", { name: "阅读位置" });
    expect(positionSlider).toHaveValue("50");
    expect(positionSlider).toHaveAttribute("min", "20");
    expect(positionSlider).toHaveAttribute("max", "80");
    fireEvent.change(positionSlider, { target: { value: "36" } });

    expect(positionSlider).toHaveValue("36");
    expect(globalThis.document.querySelector<HTMLElement>(".focus-band")?.style.top).toBe("36%");
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("luke-teleprompter:settings:v1") ?? "{}").focusPosition).toBe(36);
    });

    const focusBandHeightSlider = screen.getByRole("slider", { name: "高亮区域高度" });
    expect(focusBandHeightSlider).toHaveValue("240");
    expect(focusBandHeightSlider).toHaveAttribute("min", "120");
    expect(focusBandHeightSlider).toHaveAttribute("max", "480");
    fireEvent.change(focusBandHeightSlider, { target: { value: "300" } });
    expect(globalThis.document.querySelector<HTMLElement>(".focus-band")?.style.height).toBe("300px");
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("luke-teleprompter:settings:v1") ?? "{}").focusBandHeight).toBe(300);
    });

    const lineHeightSlider = screen.getByRole("slider", { name: "行距" });
    fireEvent.change(lineHeightSlider, { target: { value: "1.7" } });
    const sidePaddingSlider = screen.getByRole("slider", { name: "左右边距" });
    fireEvent.change(sidePaddingSlider, { target: { value: "18" } });
    const prompt = globalThis.document.querySelector<HTMLElement>(".prompt-script");
    expect(prompt?.style.lineHeight).toBe("1.7");
    expect(prompt?.style.getPropertyValue("--prompt-side-padding")).toBe("18%");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("luke-teleprompter:settings:v1") ?? "{}");
      expect(saved.lineHeight).toBe(1.7);
      expect(saved.sidePadding).toBe(18);
    });
  });

  it("allows a larger maximum font size", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    const fontSlider = screen.getByRole("slider", { name: "文字大小" });
    expect(fontSlider).toHaveAttribute("min", "44");
    expect(fontSlider).toHaveAttribute("max", "148");
    expect(screen.getByRole("slider", { name: "行距" })).toHaveAttribute("min", "0.8");
  });

  it("does not render the removed recognition status bar", () => {
    render(<App />);

    expect(screen.queryByText(/中文\s*\/\s*English/)).not.toBeInTheDocument();
    expect(globalThis.document.querySelector(".local-status")).not.toBeInTheDocument();
  });

  it("adjusts and persists dimming strength for non-reading text", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    const dimSlider = screen.getByRole("slider", { name: "暗显强度" });
    expect(dimSlider).toHaveValue("100");
    expect(dimSlider).toHaveAttribute("min", "0");
    expect(dimSlider).toHaveAttribute("max", "100");

    fireEvent.change(dimSlider, { target: { value: "0" } });

    expect(dimSlider).toHaveValue("0");
    const prompt = globalThis.document.querySelector<HTMLElement>(".prompt-script");
    expect(prompt?.style.getPropertyValue("--dimmed-token-color")).toBe("rgb(250, 248, 241)");
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("luke-teleprompter:settings:v1") ?? "{}").dimStrength).toBe(0);
    });
  });

  it("toggles and persists skip-ahead matching", async () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "跳读匹配" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    const skipButton = screen.getByRole("button", { name: "跳读匹配" });
    expect(skipButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(skipButton);

    expect(screen.getByRole("button", { name: "跳读匹配" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("luke-teleprompter:settings:v1") ?? "{}").skipAheadEnabled).toBe(false);
    });
  });

  it("uses the former pure-reading slot for the only microphone toggle and keeps speed in steady mode", () => {
    render(<App />);

    const microphoneToggle = screen.getByRole("button", { name: "开启麦克风" });
    expect(microphoneToggle).toHaveClass("chrome-toggle-button");
    expect(globalThis.document.querySelector(".microphone-indicator")).not.toBeInTheDocument();
    expect(globalThis.document.querySelector(".microphone-toggle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /纯净阅览|显示上下边栏/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "匀速滚动速度" })).not.toBeInTheDocument();

    fireEvent.click(microphoneToggle);
    expect(screen.getByRole("button", { name: "关闭麦克风" })).toHaveClass("microphone-toggle-button");

    fireEvent.click(screen.getByRole("button", { name: "匀速滚动" }));

    const speedSlider = screen.getByRole("slider", { name: "匀速滚动速度" });
    expect(speedSlider).toHaveValue("1");
    expect(speedSlider).toHaveAttribute("max", "10");
    expect(screen.getByRole("button", { name: "关闭麦克风" })).toHaveClass("microphone-toggle-button");
  });

  it("renders font size as a draggable range with its current pixel value", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    expect(screen.getByRole("slider", { name: "文字大小" })).toHaveValue("68");
    expect(screen.getByText("68px")).toBeInTheDocument();
  });

  it("keeps a floating fullscreen control at the bottom right, places edit beside settings, and centers the mode switch", () => {
    render(<App />);

    expect(globalThis.document.querySelector(".app-shell")).not.toHaveClass("liquid-glass-root");
    expect(globalThis.document.querySelector(".reading-stage")).not.toHaveAttribute("data-dynamic");
    expect(globalThis.document.querySelector(".topbar")).not.toHaveClass("liquid-glass");
    expect(globalThis.document.querySelector(".chrome-actions")).not.toHaveClass("liquid-glass");
    expect(screen.getByRole("button", { name: "全屏" })).toHaveClass("fullscreen-floating-button");
    expect(screen.getByRole("button", { name: "全屏" })).not.toHaveClass("liquid-glass");
    expect(globalThis.document.querySelector(".bottom-controls")).not.toHaveClass("liquid-glass");
    const editButton = screen.getByRole("button", { name: "编辑文稿" });
    expect(editButton).toHaveClass("edit-button");
    expect(editButton).toHaveClass("chrome-toggle-button");
    expect(editButton).not.toHaveTextContent("编辑文稿");
    const actionButtons = [...globalThis.document.querySelectorAll(".chrome-actions > button")];
    expect(actionButtons.indexOf(editButton)).toBeLessThan(actionButtons.indexOf(screen.getByRole("button", { name: "打开设置" })));
    expect(globalThis.document.querySelector(".topbar__mode-switch")).toBeInTheDocument();
  });

  it("jumps to the first and last sentences from the transport controls", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "开启麦克风" }));
    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("workflow.");
    });

    fireEvent.click(screen.getByRole("button", { name: "第一句" }));
    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("在");

    fireEvent.click(screen.getByRole("button", { name: "最后一句" }));
    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("接");
  });

  it("makes a clicked script line the current reading line", () => {
    render(<App />);

    const tokens = [...globalThis.document.querySelectorAll<HTMLElement>(".prompt-token[data-token-index]")];
    fireEvent.click(tokens.at(-1)!);

    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("在");
  });

  it("offers a mobile landscape entry point", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "进入横屏" }));

    await waitFor(() => {
      expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
      expect(orientationLockMock).toHaveBeenCalledWith("landscape");
    });
  });

  it("renders zero-width action cue markers, floating cue cards, and emphasized text after editing", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /编辑文稿/ }));
    expect(screen.getByLabelText("文稿格式提示")).toHaveTextContent("//动作提示//");
    expect(screen.getByLabelText("文稿格式提示")).toHaveTextContent("**重点词**");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "开场介绍。//动作 1//接下来展示**产品价值**。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用文稿" }));

    await waitFor(() => {
      expect(globalThis.document.querySelector(".cue-floating-card")?.textContent).toBe("动作 1");
    });
    expect(globalThis.document.querySelector(".cue-insertion-anchor")).toHaveAttribute("aria-label", "动作提示：动作 1");
    expect(globalThis.document.querySelector(".cue-insertion-anchor")?.textContent).toBe("");
    expect([...globalThis.document.querySelectorAll(".prompt-token.is-emphasized")].map((node) => node.textContent).join("")).toBe("产品价值");
    expect(screen.queryByText("//动作 1//")).not.toBeInTheDocument();
    expect(screen.queryByText("**产品价值**")).not.toBeInTheDocument();
  });
});
