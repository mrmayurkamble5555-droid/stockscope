require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('Redis connected, flushing...');
  redis.flushall().then((result) => {
    console.log('✅ Cache cleared:', result);
    redis.disconnect();
    process.exit(0);
  });
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
  process.exit(1);
});
