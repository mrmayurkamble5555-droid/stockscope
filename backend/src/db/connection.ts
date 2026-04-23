// backend/src/db/connection.ts
// dotenv loaded by -r dotenv/config in package.json — no dotenv import needed here

import { Pool } from "pg";

export const db = new Pool({
  connectionString:        process.env.DATABASE_URL,
  ssl:                     { rejectUnauthorized: false }, // Supabase requires SSL always
  max:                     10,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 5000,
});

export async function testDbConnection(): Promise<boolean> {
  try {
    const res = await db.query("SELECT NOW()");
    console.log("✅ DB connected:", res.rows[0].now);
    return true;
  } catch (err: any) {
    console.error("❌ DB connection failed:", err.message);
    return false;
  }
}
