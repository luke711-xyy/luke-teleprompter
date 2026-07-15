import { describe, expect, it } from "vitest";
import { firstTokenOnVisualLine, focusedTwoLineTokenIds, leadingTwoLineTokenId } from "./visualLines";

describe("focusedTwoLineTokenIds", () => {
  it("selects the active visual line and the following visual line", () => {
    expect(focusedTwoLineTokenIds([
      { id: 1, top: 100 },
      { id: 2, top: 100 },
      { id: 6, top: 100 },
      { id: 3, top: 172 },
      { id: 4, top: 172 },
      { id: 5, top: 244 },
    ], 1, 72)).toEqual([1, 2, 6, 3, 4]);
  });

  it("dims both earlier and later lines by selecting only the current pair", () => {
    expect(focusedTwoLineTokenIds([
      { id: 1, top: 80 },
      { id: 2, top: 152 },
      { id: 3, top: 224 },
      { id: 4, top: 296 },
      { id: 5, top: 368 },
    ], 3, 72)).toEqual([3, 4]);
  });

  it("falls back to the active line at the end of the script", () => {
    expect(focusedTwoLineTokenIds([
      { id: 8, top: 400 },
      { id: 9, top: 400 },
    ], 8, 72)).toEqual([8, 9]);
  });

  it("promotes the next line once the active token reaches the middle of the current line", () => {
    const measurements = [
      { id: 1, top: 100 },
      { id: 2, top: 100 },
      { id: 3, top: 100 },
      { id: 4, top: 172 },
      { id: 5, top: 172 },
      { id: 6, top: 244 },
    ];

    expect(focusedTwoLineTokenIds(measurements, 2, 72)).toEqual([4, 5, 6]);
    expect(leadingTwoLineTokenId(measurements, 2, 72)).toBe(4);
  });

  it("anchors a clicked token to the start of its own visual line", () => {
    const measurements = [
      { id: 1, top: 100 },
      { id: 2, top: 100 },
      { id: 3, top: 100 },
      { id: 4, top: 172 },
      { id: 5, top: 172 },
    ];

    expect(firstTokenOnVisualLine(measurements, 3, 72)).toBe(1);
    expect(firstTokenOnVisualLine(measurements, 5, 72)).toBe(4);
  });
});
