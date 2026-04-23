// backend/src/workers/pivotEmaCalculator.ts
// FIXED: calculatorService now exists at ../services/calculatorService

import { db }                           from "../db/connection";
import { getOhlcHistory, upsertTechnicals } from "../services/stockDbService";
import { calcPivots, calcEma }          from "../services/calculatorService";

export async function runPivotAndEmaCalculator() {
  console.log("📐 [pivot-ema-calculator] Starting...");
  const today = new Date().toISOString().slice(0, 10);

  const stocks = await db.query(
    "SELECT id, ticker FROM stocks WHERE is_active = true ORDER BY ticker LIMIT 500"
  );

  let success = 0, failed = 0;

  for (const stock of stocks.rows) {
    try {
      // Need 365 days for EMA-100
      const ohlc = await getOhlcHistory(stock.id, 365);
      if (ohlc.length < 2) {
        console.warn(`  ⚠️  ${stock.ticker}: insufficient OHLC data (${ohlc.length} rows)`);
        continue;
      }

      // ohlc[0] = most recent, ohlc[1] = previous session
      const prev   = ohlc[1];
      const pivots = calcPivots(
        parseFloat(prev.high),
        parseFloat(prev.low),
        parseFloat(prev.close)
      );

      // EMA needs closes oldest → newest (reverse of DB order)
      const closes = ohlc.map((r: any) => parseFloat(r.close)).reverse();

      const ema20  = calcEma(closes, 20);
      const ema50  = calcEma(closes, 50);
      const ema100 = calcEma(closes, 100);

      await upsertTechnicals(stock.id, today, {
        ...pivots,
        ema20,
        ema50,
        ema100,
      });

      success++;
    } catch (err: any) {
      failed++;
      console.error(`  ❌ ${stock.ticker}: ${err.message}`);
    }
  }

  console.log(`📐 [pivot-ema-calculator] Done. Success: ${success}, Failed: ${failed}`);
}
