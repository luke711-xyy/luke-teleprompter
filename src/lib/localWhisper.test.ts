import { describe, expect, it } from "vitest";
import { resampleLinear, selectWhisperLanguage, tailAudioWindow } from "./localWhisper";

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
