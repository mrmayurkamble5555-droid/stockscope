// backend/src/routes/api.ts
// Core routes: search, stock detail, price range
// SECURITY: ticker validation middleware, search sanitisation, safe error handling

import { Router, Request, Response, NextFunction } from "express";
import { getStockDetail, getFundamentals, getPeers, getTechnicals } from "../controllers/stockController";
import { db }    from "../db/connection";
import { cache } from "../services/cacheService";

const router = Router();

// ── Ticker validation middleware ──────────────────────────────────────────────
// Blocks path traversal (../../etc/passwd), SQL injection, and oversized inputs.
// NSE tickers: 1–20 uppercase letters, digits, ampersand (M&M, L&T)
const TICKER_REGEX = /^[A-Z0-9&]{1,20}$/;

function validateTicker(req: Request, res: Response, next: NextFunction) {
  const raw    = req.params.ticker || "";
  const ticker = raw.toUpperCase().trim();

  if (!TICKER_REGEX.test(ticker)) {
    return res.status(400).json({
      error:  "Invalid ticker format",
      detail: "Ticker must be 1–20 uppercase letters, digits, or & only",
    });
  }

  // Overwrite with sanitised value so downstream handlers always get clean input
  req.params.ticker = ticker;
  next();
}

// ── Search ────────────────────────────────────────────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  // q is already trimmed + sliced to 50 chars by app.ts middleware
  const q = String(req.query.q || "").trim().toUpperCase();

  // Reject obviously bad inputs
  if (q.length < 2)  return res.json([]);
  if (q.length > 50) return res.status(400).json({ error: "Query too long" });

  // Only allow alphanumeric + space + & for search — no SQL special chars
  const SEARCH_REGEX = /^[A-Z0-9\s&.-]{2,50}$/;
  if (!SEARCH_REGEX.test(q)) return res.json([]);

  try {
    // Parameterised query — safe from SQL injection
    const result = await db.query(`
      SELECT ticker, name, exchange, sector
      FROM stocks
      WHERE (ticker ILIKE $1 OR name ILIKE $2) AND is_active = true
      ORDER BY CASE WHEN ticker = $3 THEN 0 ELSE 1 END, ticker
      LIMIT 10
    `, [`${q}%`, `%${q}%`, q]);

    return res.json(result.rows.map(r => ({
      ticker:   r.ticker,
      name:     r.name,
      exchange: r.exchange || "NSE",
      sector:   r.sector   || "",
    })));
  } catch {
    // Never leak DB errors to client
    return res.status(500).json({ error: "Search failed" });
  }
});

// ── Stock detail — all routes protected by validateTicker ─────────────────────
router.get("/stock/:ticker",              validateTicker, getStockDetail);
router.get("/stock/:ticker/fundamentals", validateTicker, getFundamentals);
router.get("/stock/:ticker/peers",        validateTicker, getPeers);
router.get("/stock/:ticker/technicals",   validateTicker, getTechnicals);

// ── Price range (52W + ATH) ───────────────────────────────────────────────────
router.get("/stock/:ticker/pricerange", validateTicker, async (req: Request, res: Response) => {
  const ticker   = req.params.ticker; // already sanitised by validateTicker
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
        (SELECT o2.close  FROM ohlc o2 WHERE o2.stock_id = s.id ORDER BY o2.date DESC LIMIT 1) AS latest_close,
        (SELECT o2.volume FROM ohlc o2 WHERE o2.stock_id = s.id ORDER BY o2.date DESC LIMIT 1) AS latest_volume,
        (SELECT o2.date   FROM ohlc o2 WHERE o2.stock_id = s.id ORDER BY o2.date DESC LIMIT 1) AS latest_date,
        COUNT(o.id) AS total_days
      FROM stocks s
      JOIN ohlc o ON o.stock_id = s.id
      WHERE s.ticker = $1 AND s.is_active = true
      GROUP BY s.id
    `, [ticker]);

    if (!result.rows[0]) return res.status(404).json({ error: "No price data found" });

    const row  = result.rows[0];
    const data = {
      ticker,
      week52High:   parseFloat(row.week52_high)   || null,
      week52Low:    parseFloat(row.week52_low)     || null,
      allTimeHigh:  parseFloat(row.all_time_high)  || null,
      allTimeLow:   parseFloat(row.all_time_low)   || null,
      latestClose:  parseFloat(row.latest_close)   || null,
      latestVolume: parseInt(row.latest_volume)    || null,
      latestDate:   row.latest_date,
      totalDays:    parseInt(row.total_days),
    };

    await cache.set(cacheKey, data, 90000);
    return res.json(data);
  } catch {
    // Never expose DB error message to client
    return res.status(500).json({ error: "Failed to fetch price range" });
  }
});

export default router;
