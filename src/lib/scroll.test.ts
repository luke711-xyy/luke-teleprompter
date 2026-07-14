import { describe, expect, it } from "vitest";
import { calculateTwoLineScrollTarget } from "./scroll";

describe("two-line prompt placement", () => {
  it("centers the actual current and following visual lines", () => {
    const target = calculateTwoLineScrollTarget({
      currentTop: 720,
      currentHeight: 72,
      nextTop: 816,
      nextHeight: 72,
      lineHeight: 96,
      viewportHeight: 600,
      focusRatio: 0.5,
      maxScroll: 1600,
    });

    expect(target).toBe(504);
    expect((720 + 816 + 72) / 2 - target).toBe(300);
  });

  it("uses the current font line height when the next line has not rendered", () => {
    expect(calculateTwoLineScrollTarget({
      currentTop: 900,
      currentHeight: 80,
      lineHeight: 110,
      viewportHeight: 500,
      focusRatio: 0.5,
      maxScroll: 2000,
    })).toBe(745);
  });

  it("clamps the target at both document edges", () => {
    expect(calculateTwoLineScrollTarget({
      currentTop: 20,
      currentHeight: 60,
      lineHeight: 80,
      viewportHeight: 600,
      focusRatio: 0.5,
      maxScroll: 1200,
    })).toBe(0);
    expect(calculateTwoLineScrollTarget({
      currentTop: 1800,
      currentHeight: 60,
      lineHeight: 80,
      viewportHeight: 600,
      focusRatio: 0.5,
      maxScroll: 1200,
    })).toBe(1200);
  });

  it("moves the two-line reading area above or below center", () => {
    const geometry = {
      currentTop: 720,
      currentHeight: 72,
      nextTop: 816,
      nextHeight: 72,
      lineHeight: 96,
      viewportHeight: 600,
      maxScroll: 1600,
    };

    expect(calculateTwoLineScrollTarget({ ...geometry, focusRatio: 0.3 })).toBe(624);
    expect(calculateTwoLineScrollTarget({ ...geometry, focusRatio: 0.7 })).toBe(384);
  });
});
