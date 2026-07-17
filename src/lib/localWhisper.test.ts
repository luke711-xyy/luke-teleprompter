import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLocalWhisperServiceStatus,
  resampleLinear,
  selectWhisperLanguage,
  startLocalWhisperService,
  stopLocalWhisperService,
  tailAudioWindow,
} from "./localWhisper";

describe("local Whisper audio preparation", () => {
  it("keeps the most recent fixed-duration PCM window", () => {
    expect([...tailAudioWindow(new Float32Array([0, 1, 2, 3, 4, 5]), 2, 2)]).toEqual([2, 3, 4, 5]);
  });

  it("resamples microphone PCM to Whisper's 16 kHz input rate", () => {
    const source = new Float32Array(48_000).fill(0.5);
    const output = resampleLinear(source, 48_000, 16_000);

    expect(output).toHaveLength(16_000);
    expect(output[0]).toBeCloseTo(0.5);
  });

  it("selects a Whisper language hint from the nearby script", () => {
    expect(selectWhisperLanguage("今天介绍 this product")).toBe("chinese");
    expect(selectWhisperLanguage("This is an English-only script.")).toBe("english");
  });
});

describe("local Whisper service controls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks, starts, and stops the lightweight local service manager", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "stopped" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "ready" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: "stopped" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getLocalWhisperServiceStatus()).resolves.toBe("stopped");
    await expect(startLocalWhisperService()).resolves.toBe("ready");
    await expect(stopLocalWhisperService()).resolves.toBe("stopped");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:8788/service/status", { method: "GET" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:8788/service/start", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://127.0.0.1:8788/service/stop", { method: "POST" });
  });
});
