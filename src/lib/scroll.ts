export interface TwoLineScrollGeometry {
  currentTop: number;
  currentHeight: number;
  nextTop?: number;
  nextHeight?: number;
  lineHeight: number;
  viewportHeight: number;
  maxScroll: number;
}

/**
 * Keeps the visual pair made from the current line and the following line
 * around the exact vertical center of the reading viewport.
 */
export function calculateTwoLineScrollTarget({
  currentTop,
  currentHeight,
  nextTop,
  nextHeight,
  lineHeight,
  viewportHeight,
  maxScroll,
}: TwoLineScrollGeometry): number {
  const followingTop = nextTop ?? currentTop + lineHeight;
  const followingHeight = nextHeight ?? currentHeight;
  const pairCenter = (currentTop + followingTop + followingHeight) / 2;
  const target = pairCenter - viewportHeight / 2;
  return Math.min(Math.max(0, target), Math.max(0, maxScroll));
}
