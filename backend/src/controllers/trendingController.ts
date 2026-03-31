import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const redis = createRedisClient({ url: process.env.REDIS_URL! });
redis.connect().catch(console.error);

const CACHE_TTL = 3600; // 1 hour for trending

// ─── GET /api/trending ───────────────────────────────────────────────────────
export const getTrendingStocksHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const cacheKey = 'trending:today';
        const cached = await redis.get(cacheKey);
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('trending_stocks')
            .select(`
                rank_position,
                trending_score,
                volume_surge_pct,
                price_change_pct,
                stocks (
                    ticker,
                    name,
                    sector,
                    exchange
                ),
                fundamentals (
                    cmp,
                    market_cap_cr
                )
            `)
            .eq('date', today)
            .order('rank_position', { ascending: true })
            .limit(20);

        if (error) throw error;

        // If no data for today yet, fall back to most recent date
        if (!data || data.length === 0) {
            const { data: fallback, error: fallbackError } = await supabase
                .from('trending_stocks')
                .select(`
                    rank_position,
                    trending_score,
                    volume_surge_pct,
                    price_change_pct,
                    date,
                    stocks (
                        ticker,
                        name,
                        sector,
                        exchange
                    ),
                    fundamentals (
                        cmp,
                        market_cap_cr
                    )
                `)
                .order('date', { ascending: false })
                .order('rank_position', { ascending: true })
                .limit(20);

            if (fallbackError) throw fallbackError;

            const payload = {
                trending: formatTrendingRows(fallback ?? []),
                asOf: fallback?.[0]?.date ?? today,
                isFallback: true,
            };

            await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(payload));
            res.json(payload);
            return;
        }

        const payload = {
            trending: formatTrendingRows(data),
            asOf: today,
            isFallback: false,
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(payload));
        res.json(payload);
    } catch (err) {
        console.error('[getTrendingStocksHandler]', err);
        res.status(500).json({ error: 'Failed to fetch trending stocks' });
    }
};

// ─── POST /api/trending/refresh ──────────────────────────────────────────────
export const refreshTrendingHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Pull OHLC for today + 20-day avg volume from Supabase
        const { data: ohlcToday, error: ohlcError } = await supabase
            .from('ohlc')
            .select('stock_id, close, volume')
            .eq('date', today);

        if (ohlcError) throw ohlcError;
        if (!ohlcToday || ohlcToday.length === 0) {
            res.status(400).json({
                error: 'No OHLC data for today yet. Run after market close.',
            });
            return;
        }

        // Get 20-day average volume per stock
        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
        const fromDate = twentyDaysAgo.toISOString().split('T')[0];

        const { data: avgVolData, error: avgError } = await supabase
            .from('ohlc')
            .select('stock_id, volume')
            .gte('date', fromDate)
            .lt('date', today);

        if (avgError) throw avgError;

        // Build avg volume map
        const volMap: Record<number, { total: number; count: number }> = {};
        for (const row of avgVolData ?? []) {
            if (!volMap[row.stock_id]) volMap[row.stock_id] = { total: 0, count: 0 };
            volMap[row.stock_id].total += row.volume;
            volMap[row.stock_id].count += 1;
        }

        // Get yesterday's close for price change calc
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const { data: ohlcYesterday } = await supabase
            .from('ohlc')
            .select('stock_id, close')
            .eq('date', yesterdayStr);

        const yesterdayCloseMap: Record<number, number> = {};
        for (const row of ohlcYesterday ?? []) {
            yesterdayCloseMap[row.stock_id] = row.close;
        }

        // Score each stock
        const scored = ohlcToday
            .map(row => {
                const avgVol = volMap[row.stock_id]
                    ? volMap[row.stock_id].total / volMap[row.stock_id].count
                    : 0;
                const volumeSurgePct =
                    avgVol > 0
                        ? ((row.volume - avgVol) / avgVol) * 100
                        : 0;
                const prevClose = yesterdayCloseMap[row.stock_id] ?? null;
                const priceChangePct =
                    prevClose && prevClose > 0
                        ? ((row.close - prevClose) / prevClose) * 100
                        : 0;

                // 60% volume surge weight + 40% absolute price move
                const trendingScore =
                    Math.max(volumeSurgePct, 0) * 0.6 +
                    Math.abs(priceChangePct) * 0.4;

                return {
                    stock_id: row.stock_id,
                    trending_score: trendingScore,
                    volume_surge_pct: volumeSurgePct,
                    price_change_pct: priceChangePct,
                };
            })
            .filter(s => s.trending_score > 0)
            .sort((a, b) => b.trending_score - a.trending_score)
            .slice(0, 50);

        // Upsert trending_stocks table
        const upsertRows = scored.map((s, i) => ({
            stock_id: s.stock_id,
            date: today,
            trending_score: s.trending_score,
            volume_surge_pct: s.volume_surge_pct,
            price_change_pct: s.price_change_pct,
            rank_position: i + 1,
        }));

        const { error: upsertError } = await supabase
            .from('trending_stocks')
            .upsert(upsertRows, { onConflict: 'stock_id,date' });

        if (upsertError) throw upsertError;

        // Bust Redis cache
        await redis.del('trending:today');

        res.json({
            success: true,
            computed: scored.length,
            date: today,
        });
    } catch (err) {
        console.error('[refreshTrendingHandler]', err);
        res.status(500).json({ error: 'Failed to refresh trending' });
    }
};

// ─── Helper ──────────────────────────────────────────────────────────────────
function formatTrendingRows(rows: any[]) {
    return rows.map(row => ({
        ticker: row.stocks?.ticker,
        name: row.stocks?.name,
        sector: row.stocks?.sector,
        exchange: row.stocks?.exchange,
        cmp: row.fundamentals?.cmp,
        marketCap: row.fundamentals?.market_cap_cr,
        priceChangePct: Number(row.price_change_pct ?? 0),
        volumeSurgePct: Number(row.volume_surge_pct ?? 0),
        trendingScore: Number(row.trending_score ?? 0),
        rank: row.rank_position,
    }));
}