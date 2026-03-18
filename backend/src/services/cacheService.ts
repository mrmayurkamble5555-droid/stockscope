import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect',  () => console.log('✅ Redis connected'));
redis.on('error',    () => {});

export const cache = {
  // ─── Get ───────────────────────────────────────────────────────────────────
  async get<T>(key: string): Promise<T | null> {
    try {
      const val = await redis.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      return null;
    }
  },

  // ─── Set (default TTL = 24 hours) ─────────────────────────────────────────
  async set(key: string, value: unknown, ttlSeconds = 86400): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      console.error('Redis set error:', err);
    }
  },

  // ─── Delete ────────────────────────────────────────────────────────────────
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      console.error('Redis del error:', err);
    }
  },

  // ─── Health check ──────────────────────────────────────────────────────────
  async ping(): Promise<boolean> {
    try {
      const res = await redis.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  },
};

export { redis };
