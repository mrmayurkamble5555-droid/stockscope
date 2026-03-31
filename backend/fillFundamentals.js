require('dotenv').config();
const { Pool } = require('pg');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Write a Python script to fetch fundamentals from yfinance
const pyScript = path.join(__dirname, 'fetch_fundamentals.py');
fs.writeFileSync(pyScript, `
import yfinance as yf
import json, sys

ticker = sys.argv[1]
try:
    t = yf.Ticker(ticker + '.NS')
    info = t.info
    result = {
        'pe':        info.get('trailingPE') or info.get('forwardPE'),
        'roce':      None,
        'debt_eq':   info.get('debtToEquity'),
        'net_profit':info.get('netIncomeToCommon'),
        'fcf':       info.get('freeCashflow'),
        'growth':    info.get('earningsGrowth'),
        'pledged':   None,
        'mktcap':    info.get('marketCap'),
        'cmp':       info.get('currentPrice') or info.get('regularMarketPrice'),
        'industry_pe': None,
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({}))
`);

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // Get stocks with no fundamentals data (cmp=0 or null)
  const stocks = await db.query(`
    SELECT s.id, s.ticker FROM stocks s
    WHERE s.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM fundamentals f 
      WHERE f.stock_id = s.id AND f.pe_ratio IS NOT NULL
    )
    ORDER BY s.ticker
    LIMIT 2000
  `);

  console.log(`Found ${stocks.rows.length} stocks needing fundamentals`);

  let success = 0, failed = 0;

  for (const stock of stocks.rows) {
    try {
      const result = execSync(`py "${pyScript}" ${stock.ticker}`, { timeout: 30000, encoding: 'utf8' });
      const data = JSON.parse(result.trim() || '{}');

      if (!data || Object.keys(data).length === 0) { failed++; continue; }

      const cmp = data.cmp || 0;
      const pe = data.pe || null;
      const debtEq = data.debt_eq ? data.debt_eq / 100 : null; // yfinance returns as percentage
      const netProfit = data.net_profit ? data.net_profit / 10000000 : null; // convert to Cr
      const fcf = data.fcf ? data.fcf / 10000000 : null;
      const growth = data.growth ? data.growth * 100 : null; // convert to %
      const mktcap = data.mktcap ? data.mktcap / 10000000 : null;

      await db.query(`
        INSERT INTO fundamentals 
          (stock_id, date, pe_ratio, debt_to_equity, net_profit_cr, 
           free_cashflow_cr, profit_growth_5y, market_cap_cr, cmp, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'YFINANCE')
        ON CONFLICT (stock_id, date) DO UPDATE SET
          pe_ratio        = COALESCE(EXCLUDED.pe_ratio, fundamentals.pe_ratio),
          debt_to_equity  = COALESCE(EXCLUDED.debt_to_equity, fundamentals.debt_to_equity),
          net_profit_cr   = COALESCE(EXCLUDED.net_profit_cr, fundamentals.net_profit_cr),
          free_cashflow_cr= COALESCE(EXCLUDED.free_cashflow_cr, fundamentals.free_cashflow_cr),
          profit_growth_5y= COALESCE(EXCLUDED.profit_growth_5y, fundamentals.profit_growth_5y),
          market_cap_cr   = COALESCE(EXCLUDED.market_cap_cr, fundamentals.market_cap_cr),
          cmp             = COALESCE(NULLIF(EXCLUDED.cmp, 0), fundamentals.cmp)
      `, [stock.id, today, pe, debtEq, netProfit, fcf, growth, mktcap, cmp]);

      success++;
      if ((success + failed) % 50 === 0) {
        console.log(`  ✅ ${success} done, ${failed} failed`);
      }
    } catch (err) {
      failed++;
    }
  }

  console.log(`\n✅ Done! Success: ${success}, Failed: ${failed}`);
  await db.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
