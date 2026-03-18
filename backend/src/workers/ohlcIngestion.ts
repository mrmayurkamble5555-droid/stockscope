import { db } from '../db/connection';
import { upsertOhlc } from '../services/stockDbService';
import { execSync } from 'child_process';
import path from 'path';

function fetchYfinanceOhlc(ticker: string): any[] {
  try {
    const scriptPath = path.join(process.cwd(), 'fetch_ohlc.py');
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    // Wrap ticker in quotes to handle special chars like M&M
    const safeTicker = ticker.replace(/&/g, '%26');
    const result = execSync(
      pyCmd + ' "' + scriptPath + '" "' + safeTicker + '"',
      { timeout: 60000, encoding: 'utf8' }
    );
    const trimmed = result.trim();
    if (!trimmed || trimmed === '[]') return [];
    return JSON.parse(trimmed);
  } catch (err) {
    return [];
  }
}

export async function runOhlcIngestion() {
  console.log('📈 [ohlc-ingestion] Starting (yfinance mode)...');

  const stocks = await db.query(
    'SELECT id, ticker FROM stocks WHERE is_active = true ORDER BY ticker LIMIT 500'
  );

  let success = 0;
  let failed = 0;

  for (const stock of stocks.rows) {
    try {
      const rows = fetchYfinanceOhlc(stock.ticker);

      for (const row of rows) {
        if (!row.date || !row.close) continue;
        await upsertOhlc(stock.id, row.date, {
          open:   row.open,
          high:   row.high,
          low:    row.low,
          close:  row.close,
          volume: row.volume,
          source: 'YFINANCE',
        });
      }

      if (rows.length > 0) {
        success++;
      } else {
        failed++;
      }

      if ((success + failed) % 50 === 0) {
        console.log('  processed ' + (success + failed) + '/' + stocks.rows.length + ' — success: ' + success + ', failed: ' + failed);
      }
    } catch (err) {
      failed++;
    }
  }

  console.log('📈 [ohlc-ingestion] Done. Success: ' + success + ', Failed: ' + failed);
}
