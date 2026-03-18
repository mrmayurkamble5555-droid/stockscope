import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max:             10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ─── Test connection ──────────────────────────────────────────────────────────
export async function testDbConnection(): Promise<boolean> {
  try {
    const res = await db.query('SELECT NOW()');
    console.log('✅ DB connected:', res.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ DB connection failed:', err);
    return false;
  }
}
