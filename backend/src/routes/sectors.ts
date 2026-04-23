// backend/src/routes/sectors.ts
// REWRITTEN: removed import of sectorsController (missing file → TS compile error)
// Now handles all sector routes inline using DB + cache directly

import { Router, Request, Response } from "express";
import { db }    from "../db/connection";
import { cache } from "../services/cacheService";

const router = Router();

// ── GET /api/sectors — all sectors with stock count ───────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const cacheKey = "sectors:all";
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await db.query(`
      SELECT sector, COUNT(*) AS count
      FROM stocks
      WHERE is_active = true AND sector IS NOT NULL AND sector != ''
      GROUP BY sector
      ORDER BY sector
    `);
    const data = { sectors: result.rows.map(r => ({ sector: r.sector, count: parseInt(r.count) })) };
    await cache.set(cacheKey, data, 3600);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/sectors/:sectorName — stocks in a sector ────────────────────────
router.get("/:sectorName", async (req: Request, res: Response) => {
  const sector   = req.params.sectorName;
  const cacheKey = `sectors:${sector}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await db.query(`
      SELECT s.ticker, s.name, s.exchange, s.industry,
             f.cmp, f.pe_ratio, f.net_profit_cr,
             pr.rank_position AS rank, pr.total_peers, pr.composite_score
      FROM stocks s
      LEFT JOIN LATERAL (
        SELECT * FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
      ) f ON true
      LEFT JOIN LATERAL (
        SELECT * FROM peer_ranks WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
      ) pr ON true
      WHERE s.sector = $1 AND s.is_active = true
      ORDER BY pr.rank_position ASC NULLS LAST
      LIMIT 100
    `, [sector]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `No stocks found for sector: ${sector}` });
    }

    const data = {
      sector,
      count:  result.rows.length,
      stocks: result.rows.map(r => ({
        ticker:    r.ticker,
        name:      r.name,
        exchange:  r.exchange || "NSE",
        industry:  r.industry,
        cmp:       parseFloat(r.cmp)           || null,
        pe:        parseFloat(r.pe_ratio)       || null,
        netProfit: parseFloat(r.net_profit_cr)  || null,
        rank:      r.rank                       || null,
        totalPeers:r.total_peers                || null,
        score:     parseFloat(r.composite_score)|| null,
      })),
    };
    await cache.set(cacheKey, data, 3600);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
