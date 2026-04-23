// backend/src/services/cacheService.ts
// dotenv loaded by -r dotenv/config in package.json — no dotenv import needed here

import Redis from "ioredis";

function buildRedisClient(): Redis {
  const url = process.env.REDIS_URL;

  if (!url) {
    console.warn("⚠️  REDIS_URL not set — cache disabled");
    return new Redis({ lazyConnect: true, enableOfflineQueue: false });
  }

  try {
    const parsed   = new URL(url);
    const host     = parsed.hostname;
    const port     = parseInt(parsed.port || "6379");
    const isTLS    = parsed.protocol === "rediss:";

    // Upstash uses password-only auth (no username).
    // rediss://:PASSWORD@host → parsed.password = PASSWORD ✅
    // rediss://PASSWORD@host  → parsed.username = PASSWORD (fallback)
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined;

    return new Redis({
      host,
      port,
      password,
      tls:                  isTLS ? {} : undefined,
      maxRetriesPerRequest: 2,
      lazyConnect:          true,
      enableOfflineQueue:   false,
      connectTimeout:       5000,
      commandTimeout:       3000,
      retryStrategy: (times: number) => {
        if (times >= 3) return null;
        return Math.min(times * 500, 2000);
      },
    });
  } catch (err) {
    console.error("❌ Invalid REDIS_URL:", err);
    return new Redis({ lazyConnect: true, enableOfflineQueue: false });
  }
}

const redis = buildRedisClient();

let _lastErr = "";
redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error",   (err: Error) => {
  if (err.message !== _lastErr) { console.error("Redis error:", err.message); _lastErr = err.message; }
});

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try { const v = await redis.get(key); return v ? JSON.parse(v) as T : null; } catch { return null; }
  },
  async set(key: string, value: unknown, ttlSeconds = 86400): Promise<void> {
    try { await redis.set(key, JSON.stringify(value), "EX", ttlSeconds); }
    catch (e: any) { console.error("Redis set error:", e.message); }
  },
  async del(key: string): Promise<void> {
    try { await redis.del(key); } catch (e: any) { console.error("Redis del error:", e.message); }
  },
  async ping(): Promise<boolean> {
    try { return (await redis.ping()) === "PONG"; } catch { return false; }
  },
};

export { redis };
