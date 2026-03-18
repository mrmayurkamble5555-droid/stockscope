import { Request, Response } from 'express';
import { cache }             from '../services/cacheService';
import { getFullStockData, getSectorPeers } from '../services/stockDbService';
import { assembleStockDetail } from '../services/assemblerService';

// ─── GET /api/v1/stock/:ticker ────────────────────────────────────────────────
export async function getStockDetail(req: Request, res: Response) {
  const ticker = req.params.ticker.toUpperCase();
  const cacheKey = `stock:${ticker}`;

  // 1. Check Redis first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json({ ...cached as object, _cache: 'HIT' });
  }

  // 2. Query Postgres
  const row = await getFullStockData(ticker);
  if (!row) {
    return res.status(404).json({ error: 'Stock not found', ticker });
  }

  // 3. Get sector peers
  const peers = await getSectorPeers(row.sector, ticker);

  // 4. Assemble response
  const data = assembleStockDetail(row, peers);

  // 5. Store in Redis (25hr TTL — slightly longer than 24hr to avoid stale window)
  await cache.set(cacheKey, data, 90000);

  return res.json({ ...data, _cache: 'MISS' });
}

// ─── GET /api/v1/stock/:ticker/fundamentals ───────────────────────────────────
export async function getFundamentals(req: Request, res: Response) {
  const ticker   = req.params.ticker.toUpperCase();
  const cacheKey = `fund:${ticker}`;

  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const row = await getFullStockData(ticker);
  if (!row) return res.status(404).json({ error: 'Stock not found' });

  const data = assembleStockDetail(row, []);
  await cache.set(cacheKey, data.fundamentals, 90000);
  return res.json(data.fundamentals);
}

// ─── GET /api/v1/stock/:ticker/peers ──────────────────────────────────────────
export async function getPeers(req: Request, res: Response) {
  const ticker   = req.params.ticker.toUpperCase();
  const cacheKey = `peers:${ticker}`;

  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const row   = await getFullStockData(ticker);
  if (!row) return res.status(404).json({ error: 'Stock not found' });

  const peers = await getSectorPeers(row.sector, ticker);
  const data  = assembleStockDetail(row, peers);
  await cache.set(cacheKey, data.peers, 90000);
  return res.json(data.peers);
}

// ─── GET /api/v1/stock/:ticker/technicals ─────────────────────────────────────
export async function getTechnicals(req: Request, res: Response) {
  const ticker   = req.params.ticker.toUpperCase();
  const cacheKey = `tech:${ticker}`;

  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const row = await getFullStockData(ticker);
  if (!row) return res.status(404).json({ error: 'Stock not found' });

  const data = assembleStockDetail(row, []);
  await cache.set(cacheKey, data.technicals, 90000);
  return res.json(data.technicals);
}
