import { describe, expect, it } from "vitest";
import { nextSentenceToken, parseScript, previousSentenceToken, searchableUnits } from "./script";

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
});
