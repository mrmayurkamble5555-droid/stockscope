require('dotenv').config();
const { Pool } = require('pg');
const { execSync } = require('child_process');
const path = require('path');

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Find all stocks that have NO ohlc data
  const missing = await db.query(`
    SELECT s.id, s.ticker FROM stocks s
    WHERE s.is_active = true
    AND NOT EXISTS (SELECT 1 FROM ohlc o WHERE o.stock_id = s.id)
    ORDER BY s.ticker
  `);

  console.log(`Found ${missing.rows.length} stocks with no OHLC data`);
  console.log('Sample:', missing.rows.slice(0, 10).map(r => r.ticker));

  const scriptPath = path.join(__dirname, 'fetch_ohlc.py');
  const today = new Date().toISOString().slice(0, 10);

  let success = 0, failed = 0;

  for (const stock of missing.rows) {
    try {
      const result = execSync(`py "${scriptPath}" ${stock.ticker}`, { timeout: 60000, encoding: 'utf8' });
      const trimmed = result.trim();
      if (!trimmed || trimmed === '[]') { failed++; continue; }
      
      const rows = JSON.parse(trimmed);
      if (rows.length === 0) { failed++; continue; }

      for (const row of rows) {
        if (!row.date || !row.close) continue;
        await db.query(`
          INSERT INTO ohlc (stock_id, date, open, high, low, close, volume, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'YFINANCE')
          ON CONFLICT (stock_id, date) DO NOTHING
        `, [stock.id, row.date, row.open, row.high, row.low, row.close, row.volume]);
      }

      // Calculate pivot from latest OHLC
      const latest = rows[0]; // most recent first? check order
      const sorted = rows.sort((a, b) => b.date.localeCompare(a.date));
      const prev = sorted[1] || sorted[0];
      
      if (prev) {
        const pivot = (prev.high + prev.low + prev.close) / 3;
        const r1 = 2 * pivot - prev.low;
        const r2 = pivot + (prev.high - prev.low);
        const s1 = 2 * pivot - prev.high;
        const s2 = pivot - (prev.high - prev.low);
        
        // Simple EMA20 from last 20 closes
        const closes = sorted.map(r => r.close).slice(0, 100).reverse();
        const ema = (arr, period) => {
          if (arr.length < period) return arr[arr.length-1] || 0;
          const k = 2/(period+1);
          let e = arr.slice(0,period).reduce((a,b)=>a+b,0)/period;
          for (let i = period; i < arr.length; i++) e = arr[i]*k + e*(1-k);
          return Math.round(e*100)/100;
        };

        await db.query(`
          INSERT INTO technicals (stock_id, date, pivot, r1, r2, s1, s2, ema20, ema50, ema100)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (stock_id, date) DO NOTHING
        `, [stock.id, today,
          Math.round(pivot*100)/100, Math.round(r1*100)/100, Math.round(r2*100)/100,
          Math.round(s1*100)/100, Math.round(s2*100)/100,
          ema(closes,20), ema(closes,50), ema(closes,100)
        ]);

        // Update fundamentals CMP
        const cmp = sorted[0].close;
        await db.query(`
          INSERT INTO fundamentals (stock_id, date, cmp, source)
          VALUES ($1,$2,$3,'YFINANCE')
          ON CONFLICT (stock_id, date) DO UPDATE SET cmp = EXCLUDED.cmp
        `, [stock.id, today, cmp]);
      }

      success++;
      if ((success + failed) % 10 === 0) console.log(`  ✅ ${success} filled, ${failed} failed`);
    } catch (err) {
      failed++;
    }
  }

  console.log(`\n✅ Done! Filled: ${success}, Failed: ${failed}`);
  await db.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
