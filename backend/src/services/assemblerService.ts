// ─── Assembles DB row into StockDetailData shape ─────────────────────────────
// This shape must match src/types/index.ts in the RN app EXACTLY.

type TrendDir = 'up' | 'down' | 'flat';
type DataSource = 'NSE' | 'SCREENER' | 'COMPUTED';

function trend(current: number | null, previous: number | null, lowerIsBetter = false): TrendDir {
  if (current === null || previous === null) return 'flat';
  const diff = current - previous;
  if (Math.abs(diff) < 0.005 * Math.abs(previous || 1)) return 'flat';
  const isUp = diff > 0;
  if (lowerIsBetter) return isUp ? 'down' : 'up';
  return isUp ? 'up' : 'down';
}

function fmtDelta(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) return null;
  const d = current - previous;
  const abs = Math.abs(d);
  if (abs >= 100) return `${d > 0 ? '+' : ''}${Math.round(d)}cr`;
  return `${d > 0 ? '+' : ''}${abs.toFixed(2)}`;
}

function fmtValue(val: number | null, unit: string): string | null {
  if (val === null) return null;
  if (unit === 'cr') return `₹${val.toFixed(0)}cr`;
  if (unit === 'pct') return `${val.toFixed(2)}%`;
  if (unit === 'x') return `${val.toFixed(1)}x`;
  return String(val);
}

function metric(
  label: string,
  current: number | null,
  previous: number | null,
  unit: string,
  source: DataSource,
  lowerIsBetter: boolean,
  context?: string,
) {
  return {
    label,
    value:         fmtValue(current, unit),
    rawValue:      current,
    prevValue:     previous,
    trend:         trend(current, previous, lowerIsBetter),
    trendDelta:    fmtDelta(current, previous),
    source,
    lowerIsBetter,
    context,
  };
}

export function assembleStockDetail(row: any, peers: any[], prevRow: any = null) {
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });

  // ─── Header ────────────────────────────────────────────────────────────────
  const header = {
    ticker:    row.ticker,
    name:      row.name,
    exchange:  row.exchange || 'NSE',
    sector:    row.sector   || '',
    industry:  row.industry || '',
    cmp:       parseFloat(row.cmp)    || 0,
    change:    0,     // Real-time via TradingView — not stored in DB
    changePct: 0,
    asOf:      `${today}, EOD`,
  };

  // ─── Fundamentals ──────────────────────────────────────────────────────────
  const src: DataSource = (row.fund_source as DataSource) || 'MIXED';
  const fundamentals = {
    peRatio:        metric('P/E Ratio',  row.pe_ratio,          prevRow?.pe_ratio,           'x',   src,        true,  row.industry_pe ? `vs Industry: ${row.industry_pe}x` : undefined),
    roce:           metric('ROCE %',     row.roce_pct,          prevRow?.roce_pct,            'pct', src,        false),
    debtToEquity:   metric('Debt / Eq',  row.debt_to_equity,    prevRow?.debt_to_equity,      '',    'NSE',      true),
    netProfit:      metric('Net Profit', row.net_profit_cr,     prevRow?.net_profit_cr,       'cr',  'NSE',      false),
    freeCashFlow:   metric('Free CF',    row.free_cashflow_cr,  prevRow?.free_cashflow_cr,    'cr',  'NSE',      false),
    profitGrowth5Y: metric('5Yr Growth', row.profit_growth_5y,  prevRow?.profit_growth_5y,    'pct', 'SCREENER', false),
    pledgedPct:     metric('Pledged %',  row.pledged_pct,       prevRow?.pledged_pct,         'pct', 'NSE',      true),
    asOf: today,
  };

  // ─── Peers ─────────────────────────────────────────────────────────────────
  const metricKeys = ['pe_ratio','roce_pct','debt_to_equity','net_profit_cr','free_cashflow_cr','profit_growth_5y','pledged_pct'];
  const metricLabels = ['P/E Ratio','ROCE %','Debt/Equity','Net Profit','Free CF','5Yr Growth','Pledged %'];
  const lowerBetter  = [true, false, true, false, false, false, true];

  const metricScores = metricLabels.map((label, i) => {
    const allVals = peers.map(p => p[metricKeys[i]] !== null ? parseFloat(p[metricKeys[i]]) : null);
    const myVal   = row[metricKeys[i]] !== null ? parseFloat(row[metricKeys[i]]) : null;
    const score   = pctRank(allVals, myVal, lowerBetter[i]);
    return { label, score };
  });

  const peerList = peers.map((p, idx) => ({
    ticker:         p.ticker,
    name:           p.name,
    pe:             toNum(p.pe_ratio),
    roce:           toNum(p.roce_pct),
    debtToEquity:   toNum(p.debt_to_equity),
    netProfit:      toNum(p.net_profit_cr),
    freeCashFlow:   toNum(p.free_cashflow_cr),
    profitGrowth5Y: toNum(p.profit_growth_5y),
    pledgedPct:     toNum(p.pledged_pct),
    compositeScore: toNum(p.composite_score) || 0,
    rank:           p.rank_position || idx + 1,
  }));

  const myRank = peerList.findIndex(p => p.ticker === row.ticker) + 1 || (row.rank_position || 1);

  const peerData = {
    searchedTicker: row.ticker,
    rank:           myRank,
    totalPeers:     peerList.length,
    sector:         row.sector || '',
    compositeScore: toNum(row.composite_score) || 0,
    metricScores,
    peers:          peerList,
    asOf:           today,
  };

  // ─── Technicals ────────────────────────────────────────────────────────────
  const technicals = {
    pivot:       toNum(row.pivot)  || 0,
    r1:          toNum(row.r1)     || 0,
    r2:          toNum(row.r2)     || 0,
    s1:          toNum(row.s1)     || 0,
    s2:          toNum(row.s2)     || 0,
    ema20:       toNum(row.ema20)  || 0,
    ema50:       toNum(row.ema50)  || 0,
    ema100:      toNum(row.ema100) || 0,
    cmp:         toNum(row.cmp)    || 0,
    sessionDate: row.tech_date ? new Date(row.tech_date).toLocaleDateString('en-IN') : today,
    asOf:        today,
  };

  return { header, fundamentals, peers: peerData, technicals };
}

function toNum(val: any): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function pctRank(values: (number | null)[], value: number | null, lowerIsBetter: boolean): number {
  if (value === null) return 0;
  const valid = values.filter((v): v is number => v !== null);
  if (!valid.length) return 50;
  const below = lowerIsBetter
    ? valid.filter(v => v > value).length
    : valid.filter(v => v < value).length;
  return Math.round((below / valid.length) * 100);
}
