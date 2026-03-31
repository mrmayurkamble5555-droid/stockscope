import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { testDbConnection } from './db/connection';
import { cache } from './services/cacheService';
import ohlcRouter from './routes/ohlc';
import fundamentalsRouter from './routes/fundamentals';  // ← ADD THIS

const PORT = parseInt(process.env.PORT || '3001');

async function start() {
    console.log('\n🚀 StockScope API starting...\n');

    const dbOk = await testDbConnection();
    if (!dbOk) {
        console.error('❌ Cannot start without database. Check DATABASE_URL in .env');
        process.exit(1);
    }

    const redisOk = await cache.ping();
    if (!redisOk) {
        console.warn('⚠️  Redis not connected — will serve from DB only (slower)');
    } else {
        console.log('✅ Redis connected');
    }

    app.use('/api/v1/ohlc', ohlcRouter);          // existing
    app.use('/api/v1/fundamentals', fundamentalsRouter);   // ← ADD THIS

    console.log('ℹ️  Workers not started in dev mode.');

    app.listen(PORT, () => {
        console.log(`\n✅ Server running on http://localhost:${PORT}`);
        console.log(`📡 Health:        http://localhost:${PORT}/api/v1/health`);
        console.log(`🔍 Search:        http://localhost:${PORT}/api/v1/search?q=VBL`);
        console.log(`📊 Stock:         http://localhost:${PORT}/api/v1/stock/VBL`);
        console.log(`📈 OHLC:          http://localhost:${PORT}/api/v1/ohlc/RELIANCE`);
        console.log(`💰 Fundamentals:  http://localhost:${PORT}/api/v1/fundamentals/RELIANCE\n`);
    });
}

start();