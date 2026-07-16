export interface TwoLineScrollGeometry {
  currentTop: number;
  currentHeight: number;
  nextTop?: number;
  nextHeight?: number;
  lineHeight: number;
  viewportHeight: number;
  focusRatio: number;
  maxScroll: number;
}

export function shouldResnapAfterScroll(
  mode: "follow" | "steady",
  isProgrammatic: boolean,
): boolean {
  return mode === "follow" && !isProgrammatic;
}

/**
 * Places the visual pair made from the current line and the following line
 * at the selected vertical focus point in the reading viewport.
 */
export function calculateTwoLineScrollTarget({
  currentTop,
  currentHeight,
  nextTop,
  nextHeight,
  lineHeight,
  viewportHeight,
  focusRatio,
  maxScroll,
}: TwoLineScrollGeometry): number {
  const followingTop = nextTop ?? currentTop + lineHeight;
  const followingHeight = nextHeight ?? currentHeight;
  const pairCenter = (currentTop + followingTop + followingHeight) / 2;
  const target = pairCenter - viewportHeight * focusRatio;
  return Math.min(Math.max(0, target), Math.max(0, maxScroll));
}
