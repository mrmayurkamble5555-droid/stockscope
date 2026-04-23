// backend/src/services/calculatorService.ts
// Pure math functions used by workers.
// No external dependencies — just calculations.

// ── Percentile rank ───────────────────────────────────────────────────────────
// Returns 0-100: how this value compares to all values in the sector.
export function percentileRank(
  values:       (number | null)[],
  value:        number | null,
  lowerBetter:  boolean
): number {
  if (value === null || value === undefined) return 0;
  const valid = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  if (valid.length === 0) return 50;
  const beaten = lowerBetter
    ? valid.filter(v => v > value).length   // lower is better → beat those with higher values
    : valid.filter(v => v < value).length;  // higher is better → beat those with lower values
  return Math.round((beaten / valid.length) * 100);
}

// ── Composite score ───────────────────────────────────────────────────────────
// Average of all metric percentile scores, ignoring zeros (missing data).
export function calcCompositeScore(scores: number[]): number {
  const valid = scores.filter(s => s > 0);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((a, b) => a + b, 0);
  return Math.round((sum / valid.length) * 100) / 100;
}

// ── Pivot points ──────────────────────────────────────────────────────────────
// Classic pivot point formula from previous session H/L/C.
export function calcPivots(high: number, low: number, close: number) {
  const p  = (high + low + close) / 3;
  return {
    pivot: round2(p),
    r1:    round2(2 * p - low),
    r2:    round2(p + (high - low)),
    s1:    round2(2 * p - high),
    s2:    round2(p - (high - low)),
  };
}

// ── EMA (Exponential Moving Average) ─────────────────────────────────────────
// closes: array of close prices ordered OLDEST → NEWEST (ascending date)
// period: 20, 50, or 100
export function calcEma(closes: number[], period: number): number {
  if (closes.length < period) {
    // Not enough data — return SMA of available data
    const valid = closes.filter(c => c > 0);
    if (valid.length === 0) return 0;
    return round2(valid.reduce((a, b) => a + b, 0) / valid.length);
  }

  const k      = 2 / (period + 1);
  // Seed with SMA of first `period` candles
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }

  return round2(ema);
}

// ── Helper ────────────────────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
