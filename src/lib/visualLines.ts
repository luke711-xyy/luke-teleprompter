export interface TokenLineMeasurement {
  id: number;
  top: number;
}

const LEAD_LINE_PROMOTION_PROGRESS = 0.35;

function sortedMeasurements(measurements: TokenLineMeasurement[]): TokenLineMeasurement[] {
  return [...measurements].sort((left, right) => left.top - right.top || left.id - right.id);
}

function uniqueLineTops(measurements: TokenLineMeasurement[], tolerance: number): number[] {
  const tops: number[] = [];
  const sorted = sortedMeasurements(measurements);

  sorted.forEach((measurement) => {
    if (!tops.some((top) => Math.abs(top - measurement.top) <= tolerance)) {
      tops.push(measurement.top);
    }
  });

  return tops;
}

function lineTokenIds(measurements: TokenLineMeasurement[], top: number, tolerance: number): number[] {
  return sortedMeasurements(measurements)
    .filter((measurement) => Math.abs(measurement.top - top) <= tolerance)
    .map((measurement) => measurement.id);
}

export function firstTokenOnVisualLine(
  measurements: TokenLineMeasurement[],
  tokenIndex: number,
  lineHeight: number,
): number {
  const token = measurements.find((measurement) => measurement.id === tokenIndex);
  if (!token) return tokenIndex;
  const tolerance = Math.max(2, lineHeight * 0.18);
  return lineTokenIds(measurements, token.top, tolerance)[0] ?? tokenIndex;
}

function leadingLineTop(
  measurements: TokenLineMeasurement[],
  activeTokenIndex: number,
  lineHeight: number,
): number | undefined {
  const active = measurements.find((measurement) => measurement.id === activeTokenIndex);
  if (!active) return undefined;

  const tolerance = Math.max(2, lineHeight * 0.18);
  const tops = uniqueLineTops(measurements, tolerance);
  const currentTop = tops.find((top) => Math.abs(top - active.top) <= tolerance) ?? active.top;
  const nextTop = tops.find((top) => top > currentTop + tolerance);
  if (nextTop === undefined) return currentTop;

  const currentLineIds = lineTokenIds(measurements, currentTop, tolerance);
  const activePosition = currentLineIds.indexOf(activeTokenIndex);
  const activeProgress = currentLineIds.length > 1
    ? activePosition / (currentLineIds.length - 1)
    : 0;

  return activeProgress >= LEAD_LINE_PROMOTION_PROGRESS ? nextTop : currentTop;
}

export function focusedTwoLineTokenIds(
  measurements: TokenLineMeasurement[],
  activeTokenIndex: number,
  lineHeight: number,
): number[] {
  const tolerance = Math.max(2, lineHeight * 0.18);
  const tops = uniqueLineTops(measurements, tolerance);
  const currentTop = leadingLineTop(measurements, activeTokenIndex, lineHeight);
  if (currentTop === undefined) return [activeTokenIndex];
  const nextTop = tops.find((top) => top > currentTop + tolerance);
  const focusedTops = nextTop === undefined ? [currentTop] : [currentTop, nextTop];

  return measurements
    .filter((measurement) => focusedTops.some((top) => Math.abs(top - measurement.top) <= tolerance))
    .map((measurement) => measurement.id);
}

export function leadingTwoLineTokenId(
  measurements: TokenLineMeasurement[],
  activeTokenIndex: number,
  lineHeight: number,
): number {
  const top = leadingLineTop(measurements, activeTokenIndex, lineHeight);
  if (top === undefined) return activeTokenIndex;
  const tolerance = Math.max(2, lineHeight * 0.18);
  return lineTokenIds(measurements, top, tolerance)[0] ?? activeTokenIndex;
}
