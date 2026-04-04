// backend/src/server.ts
// Entry point — DB check, Redis check, then listen
// ONLY this file calls app.listen() — app.ts never does

import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { testDbConnection } from "./db/connection";
import { cache } from "./services/cacheService";

const PORT = parseInt(process.env.PORT || "3001");

async function start() {
  console.log("\n🚀 StockScope API starting...\n");

  // ── 1. DB connection check ─────────────────────────────────────────────────
  const dbOk = await testDbConnection();
  if (!dbOk) {
    console.error("❌ Cannot start without database. Check DATABASE_URL in .env");
    process.exit(1);
  }

  // ── 2. Redis connection check ──────────────────────────────────────────────
  const redisOk = await cache.ping();
  if (!redisOk) {
    console.warn("⚠️  Redis not connected — will serve from DB only (slower)");
  } else {
    console.log("✅ Redis connected");
  }

  // NOTE: All routes are registered in app.ts — no route registration here.
  // ohlc + fundamentals were moved to app.ts to fix route ordering issue.

  console.log("ℹ️  Workers not started in dev mode.");

  // ── 3. Start listening ─────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n✅ StockScope backend running on port ${PORT}`);
    console.log(`   CORS allowed: localhost:3000, stockscope.in`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   Health:       http://localhost:${PORT}/health`);
    console.log(`   Search:       http://localhost:${PORT}/api/v1/search?q=VBL`);
    console.log(`   Stock:        http://localhost:${PORT}/api/v1/stock/VBL`);
    console.log(`   OHLC:         http://localhost:${PORT}/api/v1/ohlc/RELIANCE`);
    console.log(`   Fundamentals: http://localhost:${PORT}/api/v1/fundamentals/RELIANCE`);
    console.log(`   Screener:     http://localhost:${PORT}/api/v1/screener`);
    console.log(`   Trending:     http://localhost:${PORT}/api/v1/trending?type=gainers`);
    console.log(`   Mood:         http://localhost:${PORT}/api/v1/mood\n`);
  });
}

start();
