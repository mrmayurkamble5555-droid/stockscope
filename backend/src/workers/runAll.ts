import dotenv from 'dotenv';
dotenv.config();

import { runFundamentalsIngestion } from './fundamentalsIngestion';
import { runOhlcIngestion }         from './ohlcIngestion';
import { runPivotAndEmaCalculator } from './pivotEmaCalculator';
import { runPeerRanker }            from './peerRanker';
import { runCacheWarmer }           from './cacheWarmer';
import { db }                       from '../db/connection';

// ─── Run full pipeline for testing ───────────────────────────────────────────
async function main() {
  console.log('🔧 Running full worker pipeline (dev mode)...\n');

  await runFundamentalsIngestion();
  await runOhlcIngestion();
  await runPivotAndEmaCalculator();
  await runPeerRanker();
  await runCacheWarmer();

  console.log('\n✅ Full pipeline complete!');
  await db.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
