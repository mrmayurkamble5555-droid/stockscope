import { db } from '../db/connection';
import { fetchNseQuote } from '../services/nseService';
import { fetchScreenerRatios } from '../services/screenerService';
import { upsertFundamentals } from '../services/stockDbService';

export async function runFundamentalsIngestion() {
  console.log('📥 [fundamentals-ingestion] Starting...');
  const today = new Date().toISOString().slice(0, 10);

  const stocks = await db.query(
    'SELECT id, ticker FROM stocks WHERE is_active = true ORDER BY ticker LIMIT 500'
  );

  let success = 0, failed = 0;

  for (const stock of stocks.rows) {
    try {
      // Fetch from NSE (primary)
      const nse = await fetchNseQuote(stock.ticker);

      // Fetch from Screener (ratios + growth)
      const scr = await fetchScreenerRatios(stock.ticker);

      await upsertFundamentals(stock.id, today, {
        peRatio:        nse.peRatio       ?? scr.pe             ?? null,
        industryPe:     nse.industryPe                          ?? null,
        roce:           scr.roce                                ?? null,
        debtToEquity:   scr.debtToEquity                        ?? null,
        netProfit:      scr.netProfit                           ?? null,
        freeCashFlow:   scr.freeCashFlow                        ?? null,
        profitGrowth5Y: scr.profitGrowth5Y                      ?? null,
        pledgedPct:     nse.pledgedPct    ?? scr.pledgedPct     ?? null,
        marketCap:      nse.marketCap                           ?? null,
        cmp:            nse.cmp                                 ?? null,
        source:         'MIXED',
      });

      success++;
      if (success % 50 === 0) console.log(`  ✅ ${success}/${stocks.rows.length} processed`);
    } catch (err: any) {
      failed++;
      console.error(`  ❌ ${stock.ticker}: ${err.message}`);
    }
  }

  console.log(`📥 [fundamentals-ingestion] Done. Success: ${success}, Failed: ${failed}`);
}
