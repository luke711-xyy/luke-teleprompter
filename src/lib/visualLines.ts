export interface TokenLineMeasurement {
  id: number;
  top: number;
}

function uniqueLineTops(measurements: TokenLineMeasurement[], tolerance: number): number[] {
  const tops: number[] = [];
  const sorted = [...measurements].sort((left, right) => left.top - right.top || left.id - right.id);

  sorted.forEach((measurement) => {
    if (!tops.some((top) => Math.abs(top - measurement.top) <= tolerance)) {
      tops.push(measurement.top);
    }
  });

  return tops;
}

export function focusedTwoLineTokenIds(
  measurements: TokenLineMeasurement[],
  activeTokenIndex: number,
  lineHeight: number,
): number[] {
  const active = measurements.find((measurement) => measurement.id === activeTokenIndex);
  if (!active) return [activeTokenIndex];

  const tolerance = Math.max(2, lineHeight * 0.18);
  const tops = uniqueLineTops(measurements, tolerance);
  const currentTop = tops.find((top) => Math.abs(top - active.top) <= tolerance) ?? active.top;
  const nextTop = tops.find((top) => top > currentTop + tolerance);
  const focusedTops = nextTop === undefined ? [currentTop] : [currentTop, nextTop];

  return measurements
    .filter((measurement) => focusedTops.some((top) => Math.abs(top - measurement.top) <= tolerance))
    .map((measurement) => measurement.id);
}
