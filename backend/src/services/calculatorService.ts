// ─── Pivot Point Calculator ───────────────────────────────────────────────────
// Formula from TRD v1.1
export function calcPivots(high: number, low: number, close: number) {
  const pivot = (high + low + close) / 3;
  const r1    = 2 * pivot - low;
  const r2    = pivot + (high - low);
  const s1    = 2 * pivot - high;
  const s2    = pivot - (high - low);
  return {
    pivot: round2(pivot),
    r1:    round2(r1),
    r2:    round2(r2),
    s1:    round2(s1),
    s2:    round2(s2),
  };
}

// ─── EMA Calculator ───────────────────────────────────────────────────────────
// Formula: k = 2/(N+1); EMA_today = Close × k + EMA_yesterday × (1−k)
export function calcEma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] || 0;

  const k   = 2 / (period + 1);
  // Seed with SMA of first N closes
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let ema = seed;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return round2(ema);
}

// ─── Percentile rank (for composite peer scoring) ─────────────────────────────
// Returns 0–100 where 100 = best
export function percentileRank(values: (number | null)[], value: number | null, lowerIsBetter = false): number {
  if (value === null) return 0;
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return 50;

  const below = lowerIsBetter
    ? valid.filter(v => v > value).length   // if lower is better, "above" means worse
    : valid.filter(v => v < value).length;

  return Math.round((below / valid.length) * 100);
}

// ─── Composite score from 7 metric percentiles ────────────────────────────────
export function calcCompositeScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
