// backend/src/controllers/trendingController.ts
// FIXED: Removed @supabase/supabase-js and redis (node-redis) imports — not installed.
// Uses existing db (pg Pool) and cache (ioredis) that are already in the project.
// SECURITY: No internal error details exposed to client.

import { Request, Response } from "express";
import { db }    from "../db/connection";
import { cache } from "../services/cacheService";

const CACHE_TTL = 3600; // 1 hour

// ── GET /api/v1/trending ──────────────────────────────────────────────────────
export const getTrendingStocksHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const cacheKey = "trending:today";
    const cached   = await cache.get<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const today = new Date().toISOString().split("T")[0];

    // Try today first, fall back to most recent date
    const result = await db.query(`
      SELECT
        ts.rank_position, ts.trending_score, ts.volume_surge_pct,
        ts.price_change_pct, ts.date,
        s.ticker, s.name, s.sector, s.exchange,
        f.cmp, f.market_cap_cr
      FROM trending_stocks ts
      JOIN stocks s ON s.id = ts.stock_id
      LEFT JOIN LATERAL (
        SELECT cmp, market_cap_cr FROM fundamentals
        WHERE stock_id = ts.stock_id ORDER BY date DESC LIMIT 1
      ) f ON true
      WHERE ts.date = (
        SELECT MAX(date) FROM trending_stocks
        WHERE date <= $1
      )
      ORDER BY ts.rank_position ASC
      LIMIT 20
    `, [today]);

    const rows      = result.rows;
    const asOf      = rows[0]?.date ?? today;
    const isFallback = asOf !== today;

    const payload = {
      trending: rows.map(r => ({
        ticker:         r.ticker,
        name:           r.name,
        sector:         r.sector,
        exchange:       r.exchange,
        cmp:            r.cmp            ? parseFloat(r.cmp)            : null,
        marketCap:      r.market_cap_cr  ? parseFloat(r.market_cap_cr)  : null,
        priceChangePct: parseFloat(r.price_change_pct  ?? 0),
        volumeSurgePct: parseFloat(r.volume_surge_pct  ?? 0),
        trendingScore:  parseFloat(r.trending_score     ?? 0),
        rank:           r.rank_position,
      })),
      asOf,
      isFallback,
    };

    await cache.set(cacheKey, payload, CACHE_TTL);
    res.json(payload);
  } catch (err) {
    console.error("[getTrendingStocksHandler]", err);
    res.status(500).json({ error: "Failed to fetch trending stocks" });
  }
};

// ── POST /api/v1/trending/refresh ─────────────────────────────────────────────
export const refreshTrendingHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const today       = new Date().toISOString().split("T")[0];
    const twentyAgo   = new Date();
    twentyAgo.setDate(twentyAgo.getDate() - 20);
    const fromDate    = twentyAgo.toISOString().split("T")[0];
    const yesterday   = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Today's OHLC
    const todayRes = await db.query(
      "SELECT stock_id, close, volume FROM ohlc WHERE date = $1", [today]
    );
    if (todayRes.rows.length === 0) {
      res.status(400).json({ error: "No OHLC data for today yet. Run after market close." });
      return;
    }

    // 20-day average volume
    const avgRes = await db.query(
      "SELECT stock_id, AVG(volume)::float AS avg_vol FROM ohlc WHERE date >= $1 AND date < $2 GROUP BY stock_id",
      [fromDate, today]
    );
    const avgVolMap: Record<number, number> = {};
    for (const r of avgRes.rows) avgVolMap[r.stock_id] = r.avg_vol;

    // Yesterday's close
    const prevRes = await db.query(
      "SELECT stock_id, close FROM ohlc WHERE date = $1", [yesterdayStr]
    );
    const prevCloseMap: Record<number, number> = {};
    for (const r of prevRes.rows) prevCloseMap[r.stock_id] = parseFloat(r.close);

    // Score and rank
    const scored = todayRes.rows
      .map((r: any) => {
        const avgVol          = avgVolMap[r.stock_id] ?? 0;
        const volumeSurgePct  = avgVol > 0 ? ((r.volume - avgVol) / avgVol) * 100 : 0;
        const prevClose       = prevCloseMap[r.stock_id] ?? null;
        const priceChangePct  = prevClose && prevClose > 0
          ? ((parseFloat(r.close) - prevClose) / prevClose) * 100 : 0;
        const trendingScore   = Math.max(volumeSurgePct, 0) * 0.6 + Math.abs(priceChangePct) * 0.4;
        return { stock_id: r.stock_id, trendingScore, volumeSurgePct, priceChangePct };
      })
      .filter((s: any) => s.trendingScore > 0)
      .sort((a: any, b: any) => b.trendingScore - a.trendingScore)
      .slice(0, 50);

    // Upsert
    for (let i = 0; i < scored.length; i++) {
      const s = scored[i];
      await db.query(`
        INSERT INTO trending_stocks
          (stock_id, date, trending_score, volume_surge_pct, price_change_pct, rank_position)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (stock_id, date) DO UPDATE SET
          trending_score   = EXCLUDED.trending_score,
          volume_surge_pct = EXCLUDED.volume_surge_pct,
          price_change_pct = EXCLUDED.price_change_pct,
          rank_position    = EXCLUDED.rank_position
      `, [s.stock_id, today, s.trendingScore, s.volumeSurgePct, s.priceChangePct, i + 1]);
    }

    await cache.del("trending:today");
    res.json({ success: true, computed: scored.length, date: today });
  } catch (err) {
    console.error("[refreshTrendingHandler]", err);
    res.status(500).json({ error: "Failed to refresh trending" });
  }
};
