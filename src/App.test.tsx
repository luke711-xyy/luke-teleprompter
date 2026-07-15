import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const speechStartMock = vi.fn();
const speechLanguageMock = vi.fn();
const localRecognizedPhrase = "今天我们来看看这款产品 and why it fits naturally into your everyday workflow";
const distantRecognizedPhrase = "接下来我们会进行实际演示 so you can see exactly how it works";
let recognizedPhrase = localRecognizedPhrase;
let emitFinalRecognition = true;
let emitRecognition: ((text: string, isFinal: boolean) => void) | undefined;
const requestFullscreenMock = vi.fn(async () => undefined);
const orientationLockMock = vi.fn(async () => undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setFullscreen: vi.fn(),
    onResized: vi.fn(async () => vi.fn()),
    isFullscreen: vi.fn(async () => false),
  }),
}));

describe("microphone test panel", () => {
  beforeEach(() => {
    speechStartMock.mockReset();
    speechLanguageMock.mockReset();
    emitFinalRecognition = true;
    recognizedPhrase = localRecognizedPhrase;
    emitRecognition = undefined;
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
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
          getAudioTracks: () => [{ kind: "audio", readyState: "live", stop: vi.fn() }],
        })),
      },
    });

    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      lang = "";
      onstart: ((event: Event) => void) | null = null;
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: ((event: Event) => void) | null = null;
      onspeechstart: ((event: Event) => void) | null = null;
      onspeechend: ((event: Event) => void) | null = null;

      constructor() {
        emitRecognition = (text, isFinal) => {
          const result = Object.assign(
            [{ transcript: text, confidence: isFinal ? 0.91 : 0.01 }],
            { isFinal },
          );
          this.onresult?.(Object.assign(new Event("result"), {
            resultIndex: 0,
            results: [result],
          }));
        };
      }

      start(_track?: MediaStreamTrack) {
        speechStartMock(_track);
        speechLanguageMock(this.lang);
        this.onstart?.(new Event("start"));
        emitRecognition?.(recognizedPhrase, false);
        if (emitFinalRecognition) {
          emitRecognition?.(recognizedPhrase, true);
        }
      }

      abort() {}
    }

    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: MockSpeechRecognition,
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
    expect(screen.getAllByText(recognizedPhrase)).toHaveLength(1);
    expect(screen.getByText("zh-CN · 91%")).toBeInTheDocument();
    expect(screen.queryByText("zh-CN · 1%")).not.toBeInTheDocument();
    expect(speechStartMock.mock.calls.some(([track]) => track?.kind === "audio")).toBe(true);
    expect(speechLanguageMock).toHaveBeenCalledWith("zh-CN");

    fireEvent.click(screen.getByRole("button", { name: /清空结果/ }));
    expect(screen.queryByText(recognizedPhrase)).not.toBeInTheDocument();
  });

  it("advances the browser teleprompter from one local final recognition result", async () => {
    render(<App />);

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("workflow.");
    });
  });

  it("advances provisionally from a strong local Chrome interim result", async () => {
    emitFinalRecognition = false;
    render(<App />);

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("workflow.");
    });
  });

  it("only recovers to a distant final result after local tracking has been missing for a while", async () => {
    emitFinalRecognition = false;
    recognizedPhrase = distantRecognizedPhrase;
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<App />);

    await waitFor(() => expect(speechStartMock).toHaveBeenCalled());
    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("今");
    now = 2501;
    await act(async () => emitRecognition?.(distantRecognizedPhrase, true));

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("works.");
    });
    clock.mockRestore();
  });

  it("does not use distant recovery when sequential reading is enabled", async () => {
    emitFinalRecognition = false;
    recognizedPhrase = distantRecognizedPhrase;
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    render(<App />);
    await waitFor(() => expect(speechStartMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "跳读开" }));

    now = 2501;
    await act(async () => emitRecognition?.(distantRecognizedPhrase, true));

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

    const skipButton = screen.getByRole("button", { name: "跳读开" });
    expect(skipButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(skipButton);

    expect(screen.getByRole("button", { name: "顺序读" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("luke-teleprompter:settings:v1") ?? "{}").skipAheadEnabled).toBe(false);
    });
  });

  it("shows microphone control only for follow mode and a horizontal speed slider only for steady mode", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "关闭麦克风" })).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "匀速滚动速度" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "匀速滚动" }));

    expect(screen.getByRole("slider", { name: "匀速滚动速度" })).toHaveValue("1");
    expect(screen.queryByRole("button", { name: "关闭麦克风" })).not.toBeInTheDocument();
  });

  it("renders font size as a draggable range with its current pixel value", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    expect(screen.getByRole("slider", { name: "文字大小" })).toHaveValue("68");
    expect(screen.getByText("68px")).toBeInTheDocument();
  });

  it("toggles the pure reading mode chrome", () => {
    render(<App />);

    const shell = globalThis.document.querySelector<HTMLElement>(".app-shell");
    expect(shell).not.toHaveClass("is-chrome-hidden");
    expect(screen.getByRole("button", { name: "进入纯净阅览模式" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开设置" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "进入纯净阅览模式" }));

    expect(shell).toHaveClass("is-chrome-hidden");
    expect(screen.getByRole("button", { name: "显示上下边栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全屏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开设置" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "显示上下边栏" }));

    expect(shell).not.toHaveClass("is-chrome-hidden");
    expect(screen.getByRole("button", { name: "进入纯净阅览模式" })).toBeInTheDocument();
  });

  it("jumps to the first and last sentences from the transport controls", async () => {
    render(<App />);
    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("workflow.");
    });

    fireEvent.click(screen.getByRole("button", { name: "第一句" }));
    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("在");

    fireEvent.click(screen.getByRole("button", { name: "最后一句" }));
    expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("接");
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
