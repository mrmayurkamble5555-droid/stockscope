import cron from 'node-cron';
import { runFundamentalsIngestion } from './fundamentalsIngestion';
import { runOhlcIngestion }         from './ohlcIngestion';
import { runPivotAndEmaCalculator } from './pivotEmaCalculator';
import { runPeerRanker }            from './peerRanker';
import { runCacheWarmer }           from './cacheWarmer';

// ─── IST cron times (Railway server should be UTC; adjust accordingly) ─────────
// IST = UTC + 5:30
// 6:00 PM IST = 12:30 UTC
// 6:15 PM IST = 12:45 UTC
// 6:30 PM IST = 13:00 UTC
// 7:00 PM IST = 13:30 UTC
// 7:30 PM IST = 14:00 UTC

export function startWorkers() {
  // Fundamentals — 6:00 PM IST (12:30 UTC)
  cron.schedule('30 12 * * 1-5', async () => {
    console.log('\n⏰ Cron: fundamentals-ingestion triggered');
    await runFundamentalsIngestion();
  });

  // OHLC — 6:15 PM IST (12:45 UTC)
  cron.schedule('45 12 * * 1-5', async () => {
    console.log('\n⏰ Cron: ohlc-ingestion triggered');
    await runOhlcIngestion();
  });

  // Pivot + EMA — 6:30 PM IST (13:00 UTC)
  cron.schedule('0 13 * * 1-5', async () => {
    console.log('\n⏰ Cron: pivot-ema-calculator triggered');
    await runPivotAndEmaCalculator();
  });

  // Peer ranker — 7:00 PM IST (13:30 UTC)
  cron.schedule('30 13 * * 1-5', async () => {
    console.log('\n⏰ Cron: peer-ranker triggered');
    await runPeerRanker();
  });

  // Cache warmer — 7:30 PM IST (14:00 UTC)
  cron.schedule('0 14 * * 1-5', async () => {
    console.log('\n⏰ Cron: cache-warmer triggered');
    await runCacheWarmer();
  });

  console.log('✅ All 5 cron workers scheduled (Mon–Fri only)');
}
