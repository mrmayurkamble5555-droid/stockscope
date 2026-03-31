import { db } from '../db/connection';

// ─── Stock lookup ─────────────────────────────────────────────────────────────
export async function getStockId(ticker: string): Promise<number | null> {
  const res = await db.query(
    'SELECT id FROM stocks WHERE ticker = $1 AND is_active = true',
    [ticker.toUpperCase()]
  );
  return res.rows[0]?.id || null;
}

export async function upsertStock(
  ticker: string, name: string, exchange: string, sector: string, industry: string
): Promise<number> {
  const res = await db.query(`
    INSERT INTO stocks (ticker, name, exchange, sector, industry)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (ticker) DO UPDATE
      SET name     = EXCLUDED.name,
          sector   = EXCLUDED.sector,
          industry = EXCLUDED.industry
    RETURNING id
  `, [ticker.toUpperCase(), name, exchange, sector, industry]);
  return res.rows[0].id;
}

// ─── Fundamentals ─────────────────────────────────────────────────────────────
export async function getLatestFundamentals(stockId: number) {
  const res = await db.query(`
    SELECT * FROM fundamentals
    WHERE stock_id = $1
    ORDER BY date DESC
    LIMIT 2
  `, [stockId]);
  return res.rows; // [today, yesterday] for trend calculation
}

export async function upsertFundamentals(stockId: number, date: string, data: {
  peRatio?:       number | null;
  industryPe?:    number | null;
  roce?:          number | null;
  debtToEquity?:  number | null;
  netProfit?:     number | null;
  freeCashFlow?:  number | null;
  profitGrowth5Y?:number | null;
  pledgedPct?:    number | null;
  marketCap?:     number | null;
  cmp?:           number | null;
  source?:        string;
}) {
  await db.query(`
    INSERT INTO fundamentals
      (stock_id, date, pe_ratio, industry_pe, roce_pct, debt_to_equity,
       net_profit_cr, free_cashflow_cr, profit_growth_5y, pledged_pct,
       market_cap_cr, cmp, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (stock_id, date) DO UPDATE SET
      pe_ratio       = EXCLUDED.pe_ratio,
      industry_pe    = EXCLUDED.industry_pe,
      roce_pct       = EXCLUDED.roce_pct,
      debt_to_equity = EXCLUDED.debt_to_equity,
      net_profit_cr  = EXCLUDED.net_profit_cr,
      free_cashflow_cr= EXCLUDED.free_cashflow_cr,
      profit_growth_5y= EXCLUDED.profit_growth_5y,
      pledged_pct    = EXCLUDED.pledged_pct,
      market_cap_cr  = EXCLUDED.market_cap_cr,
      cmp            = EXCLUDED.cmp,
      source         = EXCLUDED.source
  `, [
    stockId, date,
    data.peRatio, data.industryPe, data.roce, data.debtToEquity,
    data.netProfit, data.freeCashFlow, data.profitGrowth5Y, data.pledgedPct,
    data.marketCap, data.cmp, data.source || 'MIXED'
  ]);
}

// ─── OHLC ─────────────────────────────────────────────────────────────────────
export async function getOhlcHistory(stockId: number, days = 365) {
  const res = await db.query(`
    SELECT date, open, high, low, close, volume
    FROM ohlc
    WHERE stock_id = $1
    ORDER BY date DESC
    LIMIT $2
  `, [stockId, days]);
  return res.rows;
}

export async function upsertOhlc(stockId: number, date: string, data: {
  open: number; high: number; low: number; close: number; volume: number; source?: string;
}) {
  await db.query(`
    INSERT INTO ohlc (stock_id, date, open, high, low, close, volume, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (stock_id, date) DO UPDATE SET
      open   = EXCLUDED.open,
      high   = EXCLUDED.high,
      low    = EXCLUDED.low,
      close  = EXCLUDED.close,
      volume = EXCLUDED.volume,
      source = EXCLUDED.source
  `, [stockId, date, data.open, data.high, data.low, data.close, data.volume, data.source || 'NSE']);
}

// ─── Technicals ───────────────────────────────────────────────────────────────
export async function getLatestTechnicals(stockId: number) {
  const res = await db.query(`
    SELECT * FROM technicals
    WHERE stock_id = $1
    ORDER BY date DESC
    LIMIT 1
  `, [stockId]);
  return res.rows[0] || null;
}

export async function upsertTechnicals(stockId: number, date: string, data: {
  pivot: number; r1: number; r2: number; s1: number; s2: number;
  ema20: number; ema50: number; ema100: number;
}) {
  await db.query(`
    INSERT INTO technicals (stock_id, date, pivot, r1, r2, s1, s2, ema20, ema50, ema100)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (stock_id, date) DO UPDATE SET
      pivot  = EXCLUDED.pivot, r1 = EXCLUDED.r1, r2 = EXCLUDED.r2,
      s1     = EXCLUDED.s1,    s2 = EXCLUDED.s2,
      ema20  = EXCLUDED.ema20, ema50 = EXCLUDED.ema50, ema100 = EXCLUDED.ema100
  `, [stockId, date, data.pivot, data.r1, data.r2, data.s1, data.s2, data.ema20, data.ema50, data.ema100]);
}

// ─── Peer ranks ───────────────────────────────────────────────────────────────
export async function getLatestPeerRank(stockId: number) {
  const res = await db.query(`
    SELECT * FROM peer_ranks
    WHERE stock_id = $1
    ORDER BY date DESC
    LIMIT 1
  `, [stockId]);
  return res.rows[0] || null;
}

export async function upsertPeerRank(stockId: number, date: string, data: {
  sector: string; compositeScore: number; rankPosition: number; totalPeers: number;
}) {
  await db.query(`
    INSERT INTO peer_ranks (stock_id, date, sector, composite_score, rank_position, total_peers)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (stock_id, date) DO UPDATE SET
      sector          = EXCLUDED.sector,
      composite_score = EXCLUDED.composite_score,
      rank_position   = EXCLUDED.rank_position,
      total_peers     = EXCLUDED.total_peers
  `, [stockId, date, data.sector, data.compositeScore, data.rankPosition, data.totalPeers]);
}

// ─── Combined stock detail query (used by /api/v1/stock/:ticker) ──────────────
export async function getFullStockData(ticker: string) {
  const res = await db.query(`
    SELECT
      s.id, s.ticker, s.name, s.exchange, s.sector, s.industry,
      f.date AS fund_date,
      f.pe_ratio, f.industry_pe, f.roce_pct, f.debt_to_equity,
      f.net_profit_cr, f.free_cashflow_cr, f.profit_growth_5y,
      f.pledged_pct, f.market_cap_cr,
      COALESCE(NULLIF(f.cmp, 0), o.close) AS cmp,
      f.source AS fund_source,
      t.date AS tech_date,
      t.pivot, t.r1, t.r2, t.s1, t.s2, t.ema20, t.ema50, t.ema100,
      o.close AS ohlc_close, o.open AS ohlc_open,
      o.high AS ohlc_high, o.low AS ohlc_low,
      o.date AS ohlc_date,
      pr.composite_score, pr.rank_position, pr.total_peers,
      pr.date AS rank_date
    FROM stocks s
    LEFT JOIN LATERAL (
      SELECT * FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT * FROM technicals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT * FROM ohlc WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT * FROM peer_ranks WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) pr ON true
    WHERE s.ticker = $1 AND s.is_active = true
  `, [ticker.toUpperCase()]);
  return res.rows[0] || null;
}

// ─── Get all peers for a sector ───────────────────────────────────────────────
export async function getSectorPeers(sector: string, excludeTicker?: string) {
  const res = await db.query(`
    SELECT
      s.ticker, s.name,
      f.pe_ratio, f.roce_pct, f.debt_to_equity, f.net_profit_cr,
      f.free_cashflow_cr, f.profit_growth_5y, f.pledged_pct,
      pr.composite_score, pr.rank_position
    FROM stocks s
    LEFT JOIN LATERAL (
      SELECT * FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT * FROM peer_ranks WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) pr ON true
    WHERE s.sector = $1 AND s.is_active = true
    ORDER BY pr.composite_score DESC NULLS LAST
    LIMIT 20
  `, [sector]);
  return res.rows;
}
