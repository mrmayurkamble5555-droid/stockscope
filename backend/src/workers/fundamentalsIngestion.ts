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
      // screenerService must return the 3 new fields:
      //   scr.priceToBook    → CMP / Book Value
      //   scr.currentRatio   → Current Assets / Current Liabilities
      //   scr.return5YrPct   → Stock return over 5 years %
      const scr = await fetchScreenerRatios(stock.ticker);

      await upsertFundamentals(stock.id, today, {
        // ── Original 7 ranking metrics ────────────────────────────────────────
        peRatio:        nse.peRatio       ?? scr.pe             ?? null,
        industryPe:     nse.industryPe                          ?? null,
        roce:           scr.roce                                ?? null,
        debtToEquity:   scr.debtToEquity                        ?? null,
        netProfit:      scr.netProfit                           ?? null,
        freeCashFlow:   scr.freeCashFlow                        ?? null,
        profitGrowth5Y: scr.profitGrowth5Y                      ?? null,
        pledgedPct:     nse.pledgedPct    ?? scr.pledgedPct     ?? null,

        // ── 3 new ranking metrics (migration 006) ─────────────────────────────
        priceToBook:    scr.priceToBook   ?? nse.priceToBook    ?? null,
        currentRatio:   scr.currentRatio                        ?? null,
        return5YrPct:   scr.return5YrPct                        ?? null,

        // ── Display-only fields (not used in ranking score) ───────────────────
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
