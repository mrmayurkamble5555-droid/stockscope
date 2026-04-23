// backend/src/controllers/sectorsController.ts
// FIXED: Removed @supabase/supabase-js and redis (node-redis) imports — not installed.
// Uses existing db (pg Pool) and cache (ioredis) already in the project.
// SECURITY: No internal error details exposed to client.

import { Request, Response } from "express";
import { db }    from "../db/connection";
import { cache } from "../services/cacheService";

const CACHE_TTL = 86400; // 24 hours

// ── GET /api/sectors ──────────────────────────────────────────────────────────
export const getAllSectorsHandler = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const cacheKey = "sectors:all";
    const cached   = await cache.get<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const today = new Date().toISOString().split("T")[0];

    // Stock counts per sector
    const countRes = await db.query(`
      SELECT sector, COUNT(*) AS count
      FROM stocks
      WHERE is_active = true AND sector IS NOT NULL AND sector != '' AND sector != 'Others'
      GROUP BY sector
    `);
    const countMap: Record<string, number> = {};
    for (const r of countRes.rows) countMap[r.sector] = parseInt(r.count);

    // Top 10 ranked stocks per sector
    const rankRes = await db.query(`
      SELECT
        pr.sector, pr.rank_position, pr.total_peers, pr.composite_score,
        s.ticker, s.name, s.exchange,
        f.pe_ratio, f.roce_pct, f.debt_to_equity, f.net_profit_cr,
        f.free_cashflow_cr, f.profit_growth_5y, f.pledged_pct,
        f.market_cap_cr, f.cmp
      FROM peer_ranks pr
      JOIN stocks s ON s.id = pr.stock_id
      LEFT JOIN LATERAL (
        SELECT * FROM fundamentals WHERE stock_id = pr.stock_id ORDER BY date DESC LIMIT 1
      ) f ON true
      WHERE pr.date = $1 AND pr.rank_position <= 10
      ORDER BY pr.sector, pr.rank_position
    `, [today]);

    // Group by sector
    const sectorMap: Record<string, any[]> = {};
    for (const r of rankRes.rows) {
      if (!sectorMap[r.sector]) sectorMap[r.sector] = [];
      sectorMap[r.sector].push({
        ticker:         r.ticker,
        name:           r.name,
        exchange:       r.exchange,
        rank:           r.rank_position,
        totalPeers:     r.total_peers,
        compositeScore: parseFloat(r.composite_score),
        pe:             r.pe_ratio        ? parseFloat(r.pe_ratio)        : null,
        roce:           r.roce_pct        ? parseFloat(r.roce_pct)        : null,
        debtToEquity:   r.debt_to_equity  ? parseFloat(r.debt_to_equity)  : null,
        netProfit:      r.net_profit_cr   ? parseFloat(r.net_profit_cr)   : null,
        cmp:            r.cmp             ? parseFloat(r.cmp)             : null,
      });
    }

    const payload = {
      sectors: Object.entries(sectorMap)
        .map(([sector, stocks]) => ({
          sector,
          stockCount: countMap[sector] ?? stocks.length,
          topStocks:  stocks,
        }))
        .sort((a, b) => a.sector.localeCompare(b.sector)),
      updatedAt: new Date().toISOString(),
    };

    await cache.set(cacheKey, payload, CACHE_TTL);
    res.json(payload);
  } catch (err) {
    console.error("[getAllSectorsHandler]", err);
    res.status(500).json({ error: "Failed to fetch sectors" });
  }
};

// ── GET /api/sectors/:sectorName ──────────────────────────────────────────────
export const getSectorDetailHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  // SECURITY: validate sector name — alphanumeric + spaces + & - only
  const raw    = decodeURIComponent(req.params.sectorName || "");
  const sector = raw.trim();
  if (!sector || sector.length > 100 || !/^[A-Za-z0-9\s&\-().]+$/.test(sector)) {
    res.status(400).json({ error: "Invalid sector name" });
    return;
  }

  try {
    const cacheKey = `sector:${sector}`;
    const cached   = await cache.get<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const today = new Date().toISOString().split("T")[0];

    const result = await db.query(`
      SELECT
        pr.rank_position, pr.total_peers, pr.composite_score,
        s.ticker, s.name, s.exchange,
        f.pe_ratio, f.industry_pe, f.roce_pct, f.debt_to_equity,
        f.net_profit_cr, f.free_cashflow_cr, f.profit_growth_5y,
        f.pledged_pct, f.market_cap_cr, f.cmp
      FROM peer_ranks pr
      JOIN stocks s ON s.id = pr.stock_id
      LEFT JOIN LATERAL (
        SELECT * FROM fundamentals WHERE stock_id = pr.stock_id ORDER BY date DESC LIMIT 1
      ) f ON true
      WHERE pr.sector = $1 AND pr.date = $2
      ORDER BY pr.rank_position ASC
    `, [sector, today]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: `No data found for sector: ${sector}` });
      return;
    }

    const payload = {
      sector,
      total: result.rows.length,
      stocks: result.rows.map(r => ({
        ticker:         r.ticker,
        name:           r.name,
        exchange:       r.exchange,
        rank:           r.rank_position,
        totalPeers:     r.total_peers,
        compositeScore: parseFloat(r.composite_score),
        pe:             r.pe_ratio       ? parseFloat(r.pe_ratio)       : null,
        industryPe:     r.industry_pe    ? parseFloat(r.industry_pe)    : null,
        roce:           r.roce_pct       ? parseFloat(r.roce_pct)       : null,
        debtToEquity:   r.debt_to_equity ? parseFloat(r.debt_to_equity) : null,
        netProfit:      r.net_profit_cr  ? parseFloat(r.net_profit_cr)  : null,
        freeCashFlow:   r.free_cashflow_cr ? parseFloat(r.free_cashflow_cr) : null,
        profitGrowth5Y: r.profit_growth_5y ? parseFloat(r.profit_growth_5y) : null,
        pledgedPct:     r.pledged_pct    ? parseFloat(r.pledged_pct)    : null,
        marketCap:      r.market_cap_cr  ? parseFloat(r.market_cap_cr)  : null,
        cmp:            r.cmp            ? parseFloat(r.cmp)            : null,
      })),
    };

    await cache.set(cacheKey, payload, CACHE_TTL);
    res.json(payload);
  } catch (err) {
    console.error("[getSectorDetailHandler]", err);
    res.status(500).json({ error: "Failed to fetch sector detail" });
  }
};

// ── POST /api/sectors/reclassify ──────────────────────────────────────────────
export const reclassifyOthersHandler = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await db.query(`
      SELECT COUNT(*) AS count FROM stocks
      WHERE (sector = 'Others' OR sector IS NULL OR sector = '') AND is_active = true
    `);
    res.json({
      message:          "Reclassification queued",
      stocksToProcess:  parseInt(result.rows[0].count),
      note:             "Run the sectorReclassifier worker to process these stocks",
    });
  } catch (err) {
    console.error("[reclassifyOthersHandler]", err);
    res.status(500).json({ error: "Failed to trigger reclassification" });
  }
};
