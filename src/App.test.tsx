import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const speechStartMock = vi.fn();
const speechLanguageMock = vi.fn();
const recognizedPhrase = "接下来我们会进行实际演示 so you can see exactly how it works";
let emitFinalRecognition = true;
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

      start(_track?: MediaStreamTrack) {
        speechStartMock(_track);
        speechLanguageMock(this.lang);
        this.onstart?.(new Event("start"));
        const interim = Object.assign(
          [{ transcript: recognizedPhrase, confidence: 0.01 }],
          { isFinal: false },
        );
        this.onresult?.(Object.assign(new Event("result"), {
          resultIndex: 0,
          results: [interim],
        }));
        if (emitFinalRecognition) {
          const finalResult = Object.assign(
            [{ transcript: recognizedPhrase, confidence: 0.91 }],
            { isFinal: true },
          );
          this.onresult?.(Object.assign(new Event("result"), {
            resultIndex: 0,
            results: [finalResult],
          }));
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

  it("advances the browser teleprompter from one final recognition result", async () => {
    render(<App />);

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("works.");
    });
  });

  it("advances provisionally from a strong Chrome interim result", async () => {
    emitFinalRecognition = false;
    render(<App />);

    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("works.");
    });
  });

  it("moves and persists the two-line reading position", async () => {
    render(<App />);

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
  });

  it("allows a larger maximum font size", () => {
    render(<App />);

    const fontSlider = screen.getByRole("slider", { name: "文字大小" });
    expect(fontSlider).toHaveAttribute("min", "44");
    expect(fontSlider).toHaveAttribute("max", "148");
  });

  it("adjusts and persists dimming strength for non-reading text", async () => {
    render(<App />);

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

  it("toggles the pure reading mode chrome", () => {
    render(<App />);

    const shell = globalThis.document.querySelector<HTMLElement>(".app-shell");
    expect(shell).not.toHaveClass("is-chrome-hidden");
    expect(screen.getByRole("button", { name: "进入纯净阅览模式" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(globalThis.document.querySelector(".bottom-controls")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "进入纯净阅览模式" }));

    expect(shell).toHaveClass("is-chrome-hidden");
    expect(screen.getByRole("button", { name: "显示上下边栏" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "显示上下边栏" }));

    expect(shell).not.toHaveClass("is-chrome-hidden");
    expect(screen.getByRole("button", { name: "进入纯净阅览模式" })).toBeInTheDocument();
  });

  it("jumps to the first and last sentences from the transport controls", async () => {
    render(<App />);
    await waitFor(() => {
      expect(globalThis.document.querySelector(".is-active-token")?.textContent).toBe("works.");
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
