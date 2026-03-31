import { Router } from 'express';
import { getStockDetail, getFundamentals, getPeers, getTechnicals } from '../controllers/stockController';
import { db } from '../db/connection';
import { cache } from '../services/cacheService';

const router = Router();

// ─── Health check ─────────────────────────────────────────────────────────────
router.get('/health', async (_req, res) => {
  let dbOk = false, redisOk = false;
  try { await db.query('SELECT 1'); dbOk = true; } catch {}
  try { redisOk = await cache.ping(); } catch {}
  const status = dbOk && redisOk ? 200 : 503;
  res.status(status).json({
    status: dbOk && redisOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    redis: redisOk ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toUpperCase();
  if (q.length < 2) return res.json([]);
  try {
    const result = await db.query(`
      SELECT ticker, name, exchange, sector
      FROM stocks
      WHERE (ticker ILIKE $1 OR name ILIKE $2) AND is_active = true
      ORDER BY CASE WHEN ticker = $3 THEN 0 ELSE 1 END, ticker
      LIMIT 10
    `, [`${q}%`, `%${q}%`, q]);
    return res.json(result.rows.map(r => ({
      ticker: r.ticker, name: r.name,
      exchange: r.exchange || 'NSE', sector: r.sector || '',
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Search failed' });
  }
});

// ─── Stock endpoints ──────────────────────────────────────────────────────────
router.get('/stock/:ticker', getStockDetail);
router.get('/stock/:ticker/fundamentals', getFundamentals);
router.get('/stock/:ticker/peers', getPeers);
router.get('/stock/:ticker/technicals', getTechnicals);

// ─── 52-week & All-Time High/Low ──────────────────────────────────────────────
router.get('/stock/:ticker/pricerange', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const cacheKey = `pricerange:${ticker}`;

  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await db.query(`
      SELECT
        MAX(CASE WHEN o.date >= CURRENT_DATE - INTERVAL '52 weeks' THEN o.high END) AS week52_high,
        MIN(CASE WHEN o.date >= CURRENT_DATE - INTERVAL '52 weeks' THEN o.low  END) AS week52_low,
        MAX(o.high) AS all_time_high,
        MIN(o.low)  AS all_time_low,
        (SELECT o2.close FROM ohlc o2 WHERE o2.stock_id = s.id ORDER BY o2.date DESC LIMIT 1) AS latest_close,
        (SELECT o2.volume FROM ohlc o2 WHERE o2.stock_id = s.id ORDER BY o2.date DESC LIMIT 1) AS latest_volume,
        (SELECT o2.date FROM ohlc o2 WHERE o2.stock_id = s.id ORDER BY o2.date DESC LIMIT 1) AS latest_date,
        COUNT(o.id) AS total_days
      FROM stocks s
      JOIN ohlc o ON o.stock_id = s.id
      WHERE s.ticker = $1 AND s.is_active = true
      GROUP BY s.id
    `, [ticker]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'No price data found' });
    }

    const row = result.rows[0];
    const data = {
      ticker,
      week52High:   parseFloat(row.week52_high) || null,
      week52Low:    parseFloat(row.week52_low)  || null,
      allTimeHigh:  parseFloat(row.all_time_high) || null,
      allTimeLow:   parseFloat(row.all_time_low)  || null,
      latestClose:  parseFloat(row.latest_close)  || null,
      latestVolume: parseInt(row.latest_volume)   || null,
      latestDate:   row.latest_date,
      totalDays:    parseInt(row.total_days),
    };

    await cache.set(cacheKey, data, 90000);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Sector Screener ──────────────────────────────────────────────────────────
router.get('/screener', async (req, res) => {
  const sector   = String(req.query.sector || '').trim();
  const sortBy   = String(req.query.sort   || 'rank').trim();
  const minPE    = parseFloat(String(req.query.min_pe || '0'));
  const maxPE    = parseFloat(String(req.query.max_pe || '9999'));
  const cacheKey = `screener:${sector}:${sortBy}:${minPE}:${maxPE}`;

  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Get all sectors if no sector specified
    if (!sector) {
      const sectors = await db.query(`
        SELECT DISTINCT sector, COUNT(*) as count
        FROM stocks WHERE is_active = true AND sector IS NOT NULL AND sector != ''
        GROUP BY sector ORDER BY sector
      `);
      return res.json({ sectors: sectors.rows });
    }

    const orderMap: Record<string, string> = {
      rank:       'pr.rank_position ASC NULLS LAST',
      pe:         'f.pe_ratio ASC NULLS LAST',
      pe_desc:    'f.pe_ratio DESC NULLS LAST',
      profit:     'f.net_profit_cr DESC NULLS LAST',
      growth:     'f.profit_growth_5y DESC NULLS LAST',
      debt:       'f.debt_to_equity ASC NULLS LAST',
      cmp:        'f.cmp DESC NULLS LAST',
    };
    const orderClause = orderMap[sortBy] || orderMap.rank;

    const result = await db.query(`
      SELECT
        s.ticker, s.name, s.exchange, s.sector, s.industry,
        f.cmp, f.pe_ratio, f.debt_to_equity,
        f.net_profit_cr, f.profit_growth_5y, f.market_cap_cr,
        pr.rank_position AS rank, pr.total_peers, pr.composite_score,
        t.pivot, t.ema20, t.ema50,
        o.week52_high, o.week52_low
      FROM stocks s
      LEFT JOIN LATERAL (
        SELECT * FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
      ) f ON true
      LEFT JOIN LATERAL (
        SELECT * FROM peer_ranks WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
      ) pr ON true
      LEFT JOIN LATERAL (
        SELECT * FROM technicals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT
          MAX(high) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '52 weeks') AS week52_high,
          MIN(low)  FILTER (WHERE date >= CURRENT_DATE - INTERVAL '52 weeks') AS week52_low
        FROM ohlc WHERE stock_id = s.id
      ) o ON true
      WHERE s.sector = $1 AND s.is_active = true
        AND (f.pe_ratio IS NULL OR (f.pe_ratio >= $2 AND f.pe_ratio <= $3))
      ORDER BY ${orderClause}
      LIMIT 100
    `, [sector, minPE, maxPE]);

    const data = {
      sector,
      count: result.rows.length,
      sortBy,
      stocks: result.rows.map(r => ({
        ticker:        r.ticker,
        name:          r.name,
        exchange:      r.exchange || 'NSE',
        sector:        r.sector,
        industry:      r.industry,
        cmp:           parseFloat(r.cmp) || null,
        pe:            parseFloat(r.pe_ratio) || null,
        debtToEquity:  parseFloat(r.debt_to_equity) || null,
        netProfit:     parseFloat(r.net_profit_cr) || null,
        growth5Y:      parseFloat(r.profit_growth_5y) || null,
        marketCap:     parseFloat(r.market_cap_cr) || null,
        rank:          r.rank || null,
        totalPeers:    r.total_peers || null,
        pivot:         parseFloat(r.pivot) || null,
        ema20:         parseFloat(r.ema20) || null,
        ema50:         parseFloat(r.ema50) || null,
        week52High:    parseFloat(r.week52_high) || null,
        week52Low:     parseFloat(r.week52_low) || null,
      })),
    };

    await cache.set(cacheKey, data, 3600); // 1hr cache for screener
    return res.json(data);
  } catch (err: any) {
    console.error('Screener error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
