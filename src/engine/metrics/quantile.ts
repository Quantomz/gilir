/** Nearest-rank quantile Qp = x[ceil(p * N)] over sorted observations (1-based). */
export function nearestRankQuantile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // The epsilon stops float error (0.07 * 100 = 7.000000000000001) from bumping the rank.
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length - 1e-9)));
  return sorted[rank - 1];
}
