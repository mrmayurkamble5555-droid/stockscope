require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  // Find VBL stock_id
  const vbl = await db.query(`SELECT id, ticker, name FROM stocks WHERE ticker = 'VBL'`);
  console.log('\n=== VBL in stocks table ===');
  console.log(vbl.rows);

  // Check if any ohlc rows exist for stock_id matching VBL
  if (vbl.rows.length > 0) {
    const id = vbl.rows[0].id;
    const ohlc = await db.query(`SELECT date, close FROM ohlc WHERE stock_id = $1 ORDER BY date DESC LIMIT 3`, [id]);
    console.log(`\n=== OHLC for stock_id=${id} ===`);
    console.log(ohlc.rows.length > 0 ? ohlc.rows : 'EMPTY');

    const fund = await db.query(`SELECT date, cmp, pe_ratio FROM fundamentals WHERE stock_id = $1 ORDER BY date DESC LIMIT 2`, [id]);
    console.log(`\n=== FUNDAMENTALS for stock_id=${id} ===`);
    console.log(fund.rows.length > 0 ? fund.rows : 'EMPTY');
  }

  // Sample some ohlc stock_ids to see what's there
  const sample = await db.query(`
    SELECT s.ticker, o.stock_id, COUNT(*) as rows 
    FROM ohlc o 
    JOIN stocks s ON s.id = o.stock_id 
    GROUP BY s.ticker, o.stock_id 
    ORDER BY s.ticker 
    LIMIT 10
  `);
  console.log('\n=== SAMPLE ohlc tickers ===');
  console.log(sample.rows);

  await db.end();
}
check().catch(err => { console.error(err.message); process.exit(1); });
