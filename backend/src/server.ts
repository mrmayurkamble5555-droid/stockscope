import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { testDbConnection } from "./db/connection";
import { cache } from "./services/cacheService";
import { startWorkers } from "./workers/scheduler";

const PORT = parseInt(process.env.PORT || "3001", 10);

async function start() {
    console.log("\n🚀 StockScope API starting...\n");

    const dbOk = await testDbConnection();
    if (!dbOk) {
        console.error("❌ Cannot start without database. Check DATABASE_URL in .env");
        process.exit(1);
    }

    const redisOk = await cache.ping();
    if (!redisOk) {
        console.warn("⚠️  Redis not connected — will serve from DB only (slower)");
    } else {
        console.log("✅ Redis connected");
    }

    if (process.env.NODE_ENV === "production") {
        startWorkers();
        console.log("✅ EOD workers scheduled");
    } else {
        console.log("ℹ️  Workers not started in dev mode. Run: npm run worker:run");
    }

    app.listen(PORT, () => {
        console.log(`\n✅ Server running on http://localhost:${PORT}`);
    });
}

start();
