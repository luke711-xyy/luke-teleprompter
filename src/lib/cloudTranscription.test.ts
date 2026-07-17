import { describe, expect, it } from "vitest";
import {
  cloudFailureInfo,
  isCloudTranscriptionConfigured,
  isRecoverableBrowserSpeechError,
} from "./cloudTranscription";

describe("cloud transcription routing", () => {
  it("marks browser service failures as recoverable only when cloud fallback can help", () => {
    expect(isRecoverableBrowserSpeechError("network")).toBe(true);
    expect(isRecoverableBrowserSpeechError("language-not-supported")).toBe(true);
    expect(isRecoverableBrowserSpeechError("not-allowed")).toBe(false);
    expect(isRecoverableBrowserSpeechError("audio-capture")).toBe(false);
  });

  it("does not claim that an unconfigured cloud endpoint is available", () => {
    expect(isCloudTranscriptionConfigured()).toBe(false);
  });

  it("retries a blank transient response from the Cloudflare model instead of surfacing a parsing error", () => {
    expect(cloudFailureInfo(400, "")).toEqual({
      retryAfterMs: 2_000,
      message: "Cloudflare 转写服务正在重试，请继续说话。",
    });
  });
});
