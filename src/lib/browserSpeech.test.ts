import { describe, expect, it } from "vitest";
import { SpeechActivityGate } from "./browserSpeech";

describe("SpeechActivityGate", () => {
  it("keeps speech active through brief volume dips", () => {
    const gate = new SpeechActivityGate();

    expect(gate.update(0.03, false, 0)).toBe(false);
    expect(gate.update(0.03, false, 20)).toBe(true);
    expect(gate.update(0.002, false, 260)).toBe(true);
    expect(gate.update(0.002, false, 880)).toBe(true);
    expect(gate.update(0.002, false, 940)).toBe(false);
  });

  it("uses recognition speech events even for a quiet voice", () => {
    const gate = new SpeechActivityGate();

    expect(gate.update(0.004, true, 0)).toBe(true);
    expect(gate.update(0.003, false, 500)).toBe(true);
    expect(gate.update(0.003, false, 920)).toBe(false);
  });
});
