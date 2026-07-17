import { describe, expect, it } from "vitest";
import { isCloudTranscriptionConfigured, isRecoverableBrowserSpeechError } from "./cloudTranscription";

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
});
