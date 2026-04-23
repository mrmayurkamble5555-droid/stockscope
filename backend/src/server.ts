// backend/src/server.ts
// dotenv is loaded by -r dotenv/config in package.json dev/start scripts
// This means .env is loaded BEFORE any TypeScript module runs — no import order issues.
// Do NOT add dotenv.config() here — it's already done by the CLI flag.

import app                  from "./app";
import { testDbConnection } from "./db/connection";
import { cache }            from "./services/cacheService";

const PORT = parseInt(process.env.PORT || "3001");
const ENV  = process.env.NODE_ENV || "development";

// Validate critical env vars — safe here because -r dotenv/config already ran
const REQUIRED = ["DATABASE_URL", "REDIS_URL"] as const;
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables: ${missing.join(", ")}`);
  console.error(`   Check your backend/.env file — copy from .env.example if needed.\n`);
  process.exit(1);
}

async function start() {
  console.log(`\n🚀 StockScope API starting... [${ENV}]\n`);

  const dbOk = await testDbConnection();
  if (!dbOk) {
    if (ENV === "production") { console.error("❌ DB required in production."); process.exit(1); }
    console.warn("⚠️  DB not connected — stock endpoints will error");
  }

  const redisOk = await cache.ping();
  if (!redisOk) {
    console.warn("⚠️  Redis not connected — no caching, serving from DB");
  } else {
    console.log("✅ Redis connected");
  }

  const server = app.listen(PORT, () => {
    console.log(`\n✅ StockScope backend running on http://localhost:${PORT} [${ENV}]`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   Health:       GET  /health`);
    console.log(`   Search:       GET  /api/v1/search?q=VBL`);
    console.log(`   Stock:        GET  /api/v1/stock/VBL`);
    console.log(`   OHLC:         GET  /api/v1/ohlc/RELIANCE`);
    console.log(`   Fundamentals: GET  /api/v1/fundamentals/RELIANCE`);
    console.log(`   Screener:     GET  /api/v1/screener`);
    console.log(`   Trending:     GET  /api/v1/trending?type=gainers`);
    console.log(`   Mood:         GET  /api/v1/mood`);
    console.log(`   AI:           POST /api/v1/ai/analyse\n`);
  });

  const shutdown = (sig: string) => {
    console.log(`\n⏳ ${sig} received — graceful shutdown...`);
    server.close(() => { console.log("✅ HTTP server closed"); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

start();
