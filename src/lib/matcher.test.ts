import { describe, expect, it } from "vitest";
import { findForwardMatch, MatchHysteresis, RecoveryMatchGate } from "./matcher";
import { parseScript, searchableIndexForDisplay } from "./script";
import { DEFAULT_SCRIPT, DEFAULT_SETTINGS } from "./storage";

describe("forward script matching", () => {
  const script = parseScript(
    "今天我们介绍产品。This tool fits your everyday workflow. 接下来开始实际演示。最后谢谢大家。",
  );

  it("matches mixed Chinese and English regardless of punctuation and case", () => {
    const match = findForwardMatch("THIS tool fits your everyday workflow", script, 0);
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThan(0.8);
    expect(script.tokens[match!.displayTokenIndex].sentenceIndex).toBe(1);
  });

  it("can skip a sentence and catch up", () => {
    const match = findForwardMatch("接下来开始实际演示", script, 0);
    expect(match).not.toBeNull();
    expect(script.tokens[match!.displayTokenIndex].sentenceIndex).toBe(2);
  });

  it("can require sequential matching without searching later script positions", () => {
    const skipped = findForwardMatch("接下来开始实际演示", script, 0, 180, false);
    expect(skipped).toBeNull();

    const sequential = findForwardMatch("今天我们介绍产品", script, 0, 180, false);
    expect(sequential).not.toBeNull();
    expect(script.tokens[sequential!.displayTokenIndex].sentenceIndex).toBe(0);
  });

  it("allows sequential reading to catch up within the current line after a missed opening", () => {
    const document = parseScript("今天我们一起看看这个产品如何工作。接下来开始实际演示。");

    const match = findForwardMatch("一起看看这个产品如何工作", document, 0, 180, false);

    expect(match).not.toBeNull();
    expect(match!.searchableIndex).toBeGreaterThan(0);
    expect(document.tokens[match!.displayTokenIndex].sentenceIndex).toBe(0);
  });

  it("keeps sequential catch-up inside the local reading window", () => {
    const document = parseScript(
      "今天我们一起看看这个产品如何工作。这里补充一些普通说明。接下来开始实际演示。",
    );

    expect(findForwardMatch("接下来开始实际演示", document, 0, 180, false)).toBeNull();
  });

  it("never searches behind the current position", () => {
    const current = script.searchableTokens.findIndex((token) => token.sentenceIndex === 2);
    const match = findForwardMatch("今天我们介绍产品", script, current);
    expect(match).toBeNull();
  });

  it("requires repeated medium-confidence matches but accepts strong matches immediately", () => {
    const hysteresis = new MatchHysteresis();
    const weak = {
      displayTokenIndex: script.searchableTokens.find((token) => token.sentenceIndex === 2)!.displayIndex,
      startSearchableIndex: 9,
      searchableIndex: 12,
      score: 0.7,
      matchedText: "接下来演示",
    };
    expect(hysteresis.confirm(weak, script)).toBe(false);
    expect(hysteresis.confirm(weak, script)).toBe(true);
    expect(hysteresis.confirm({ ...weak, score: 0.9 }, script)).toBe(true);
  });

  it("requires two strong matching transcripts before accepting a distant recovery", () => {
    const gate = new RecoveryMatchGate();
    const candidate = {
      displayTokenIndex: 30,
      startSearchableIndex: 18,
      searchableIndex: 24,
      score: 0.92,
      matchedText: "接 下 来 开 始 实 际 演 示",
    };

    expect(gate.confirm(candidate)).toBe(false);
    expect(gate.confirm(candidate)).toBe(true);
    expect(gate.confirm({ ...candidate, searchableIndex: 42, displayTokenIndex: 50 })).toBe(false);
    expect(gate.confirm({ ...candidate, score: 0.7 })).toBe(false);
    expect(gate.confirmFinal(candidate)).toBe(true);
    expect(gate.confirmFinal({ ...candidate, score: 0.7 })).toBe(false);
  });

  it("matches the default script from its saved starting position with one browser final result", () => {
    const document = parseScript(DEFAULT_SCRIPT);
    const current = searchableIndexForDisplay(document, DEFAULT_SETTINGS.activeTokenIndex);
    const match = findForwardMatch(
      "接下来我们会进行实际演示 so you can see exactly how it works",
      document,
      current,
    );

    expect(match).not.toBeNull();
    expect(document.tokens[match!.displayTokenIndex].text).toBe("works.");
  });

  it("ignores action cues as recognition targets while matching nearby spoken script", () => {
    const document = parseScript("开场介绍。//举手示意//接下来展示产品价值。");

    expect(findForwardMatch("举手示意", document, 0)).toBeNull();

    const match = findForwardMatch("接下来展示产品价值", document, 0);
    expect(match).not.toBeNull();
    expect(document.tokens[match!.displayTokenIndex].sentenceIndex).toBe(1);
  });

  it("matches emphasized text as normal spoken script", () => {
    const document = parseScript("今天我们介绍 **Product 2** 和 **重点词**。");

    expect(findForwardMatch("product 2", document, 0)).not.toBeNull();
    expect(findForwardMatch("重点词", document, 0)).not.toBeNull();
  });
});
