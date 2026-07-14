import { describe, expect, it } from "vitest";
import {
  firstSentenceToken,
  lastSentenceToken,
  nextSentenceToken,
  parseScript,
  previousSentenceToken,
  searchableUnits,
} from "./script";

describe("script parsing", () => {
  it("keeps normal English words as indivisible latin tokens", () => {
    const document = parseScript("今天 hello-world, everyday workflow.");
    const latin = document.tokens.filter((token) => token.kind === "latin").map((token) => token.text);
    expect(latin).toEqual(["hello-world,", "everyday", "workflow."]);
  });

  it("indexes Chinese characters and English words for matching", () => {
    expect(searchableUnits("今天我们 test the Product 2.0！")).toEqual([
      "今", "天", "我", "们", "test", "the", "product", "2", "0",
    ]);
  });

  it("moves between sentence boundaries", () => {
    const document = parseScript("第一句。第二句！Third sentence.");
    const next = nextSentenceToken(document, 0);
    expect(document.tokens[next].text).toBe("第");
    expect(document.tokens[next].sentenceIndex).toBe(1);
    const previous = previousSentenceToken(document, next);
    expect(document.tokens[previous].sentenceIndex).toBe(0);
  });

  it("jumps to the beginning of the first and last sentences", () => {
    const document = parseScript("第一句。第二句！Third sentence.");

    expect(document.tokens[firstSentenceToken(document)].text).toBe("第");
    expect(document.tokens[firstSentenceToken(document)].sentenceIndex).toBe(0);
    expect(document.tokens[lastSentenceToken(document)].text).toBe("Third");
    expect(document.tokens[lastSentenceToken(document)].sentenceIndex).toBe(2);
  });

  it("extracts double-slash action cues without making them searchable", () => {
    const document = parseScript("大家好，//动作 1//今天我们开始。Next line //look at camera// now.");

    expect(document.actionCues).toEqual([
      expect.objectContaining({ text: "动作 1", sentenceIndex: 0 }),
      expect.objectContaining({ text: "look at camera", sentenceIndex: 1 }),
    ]);
    expect(document.tokens.filter((token) => token.kind === "cue").map((token) => token.text)).toEqual([
      "动作 1",
      "look at camera",
    ]);
    expect(document.searchableTokens.map((token) => token.normalized)).not.toContain("动作");
    expect(document.searchableTokens.map((token) => token.normalized)).not.toContain("look");
    expect(document.searchableTokens.map((token) => token.normalized)).toContain("今");
    expect(document.searchableTokens.map((token) => token.normalized)).toContain("now");
  });
});
