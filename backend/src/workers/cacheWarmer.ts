import { db } from '../db/connection';
import { cache } from '../services/cacheService';
import { getFullStockData, getSectorPeers } from '../services/stockDbService';
import { assembleStockDetail } from '../services/assemblerService';

export async function runCacheWarmer() {
  console.log('🔥 [cache-warmer] Starting...');

  // Top 500 by market cap
  const stocks = await db.query(`
    SELECT s.ticker FROM stocks s
    LEFT JOIN LATERAL (
      SELECT market_cap_cr FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
    ) f ON true
    WHERE s.is_active = true
    ORDER BY f.market_cap_cr DESC NULLS LAST
    LIMIT 500
  `);

  let warmed = 0, failed = 0;

  for (const { ticker } of stocks.rows) {
    try {
      const row   = await getFullStockData(ticker);
      if (!row) continue;

      const peers = await getSectorPeers(row.sector, ticker);
      const data  = assembleStockDetail(row, peers);

      await cache.set(`stock:${ticker}`, data, 90000);  // 25hr TTL
      warmed++;

      if (warmed % 100 === 0) console.log(`  🔥 Warmed ${warmed}/${stocks.rows.length}`);
    } catch (err: any) {
      failed++;
      console.error(`  ❌ ${ticker}: ${err.message}`);
    }
  }

  console.log(`🔥 [cache-warmer] Done. Warmed: ${warmed}, Failed: ${failed}`);
}
