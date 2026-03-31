import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createClient as createRedisClient } from 'redis';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const redis = createRedisClient({ url: process.env.REDIS_URL! });
redis.connect().catch(console.error);

const CACHE_TTL = 86400; // 24 hours

// ─── GET /api/sectors ────────────────────────────────────────────────────────
export const getAllSectorsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const cacheKey = 'sectors:all';
        const cached = await redis.get(cacheKey);
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }

        // Get all sectors with stock counts
        const { data: sectorCounts, error: countError } = await supabase
            .from('stocks')
            .select('sector')
            .neq('sector', 'Others')
            .neq('sector', '')
            .not('sector', 'is', null)
            .eq('is_active', true);

        if (countError) throw countError;

        // Aggregate counts in JS
        const countMap: Record<string, number> = {};
        for (const row of sectorCounts ?? []) {
            const s = row.sector as string;
            countMap[s] = (countMap[s] || 0) + 1;
        }

        // Get top 10 ranked stocks per sector
        const { data: rankedStocks, error: rankError } = await supabase
            .from('peer_ranks')
            .select(`
                rank_position,
                composite_score,
                total_peers,
                sector,
                stocks (
                    ticker,
                    name,
                    exchange
                ),
                fundamentals (
                    pe_ratio,
                    roce_pct,
                    debt_to_equity,
                    net_profit_cr,
                    free_cashflow_cr,
                    profit_growth_5y,
                    pledged_pct,
                    market_cap_cr,
                    cmp
                )
            `)
            .eq('date', new Date().toISOString().split('T')[0])
            .lte('rank_position', 10)
            .order('sector')
            .order('rank_position');

        if (rankError) throw rankError;

        // Group by sector
        const sectorMap: Record<string, any[]> = {};
        for (const row of rankedStocks ?? []) {
            const sector = row.sector as string;
            if (!sectorMap[sector]) sectorMap[sector] = [];
            sectorMap[sector].push({
                ticker: (row.stocks as any)?.ticker,
                name: (row.stocks as any)?.name,
                exchange: (row.stocks as any)?.exchange,
                rank: row.rank_position,
                totalPeers: row.total_peers,
                compositeScore: Number(row.composite_score),
                fundamentals: row.fundamentals,
            });
        }

        const payload = {
            sectors: Object.entries(sectorMap)
                .map(([sector, stocks]) => ({
                    sector,
                    stockCount: countMap[sector] ?? stocks.length,
                    topStocks: stocks,
                }))
                .sort((a, b) => a.sector.localeCompare(b.sector)),
            updatedAt: new Date().toISOString(),
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(payload));
        res.json(payload);
    } catch (err) {
        console.error('[getAllSectorsHandler]', err);
        res.status(500).json({ error: 'Failed to fetch sectors' });
    }
};

// ─── GET /api/sectors/:sectorName ────────────────────────────────────────────
export const getSectorDetailHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const sector = decodeURIComponent(req.params.sectorName);

    try {
        const cacheKey = `sector:${sector}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            res.json(JSON.parse(cached));
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('peer_ranks')
            .select(`
                rank_position,
                composite_score,
                total_peers,
                stocks (
                    ticker,
                    name,
                    exchange
                ),
                fundamentals (
                    pe_ratio,
                    industry_pe,
                    roce_pct,
                    debt_to_equity,
                    net_profit_cr,
                    free_cashflow_cr,
                    profit_growth_5y,
                    pledged_pct,
                    market_cap_cr,
                    cmp
                )
            `)
            .eq('sector', sector)
            .eq('date', today)
            .order('rank_position', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            res.status(404).json({ error: `No data found for sector: ${sector}` });
            return;
        }

        const payload = {
            sector,
            total: data.length,
            stocks: data.map(row => ({
                ticker: (row.stocks as any)?.ticker,
                name: (row.stocks as any)?.name,
                exchange: (row.stocks as any)?.exchange,
                rank: row.rank_position,
                totalPeers: row.total_peers,
                compositeScore: Number(row.composite_score),
                ...(row.fundamentals as any),
            })),
        };

        await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(payload));
        res.json(payload);
    } catch (err) {
        console.error('[getSectorDetailHandler]', err);
        res.status(500).json({ error: 'Failed to fetch sector detail' });
    }
};

// ─── POST /api/sectors/reclassify ────────────────────────────────────────────
export const reclassifyOthersHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        // Fetch all stocks stuck in "Others" or null sector
        const { data: othersStocks, error } = await supabase
            .from('stocks')
            .select('id, ticker, name')
            .or('sector.eq.Others,sector.is.null,sector.eq.')
            .eq('is_active', true);

        if (error) throw error;

        res.json({
            message: 'Reclassification queued',
            stocksToProcess: othersStocks?.length ?? 0,
            note: 'Run the sectorReclassifier worker to process these stocks',
        });

        // Trigger the actual reclassification async
        // (import and call your reclassifier worker here)
        // reclassifyOthersStocks() — call from your worker file
    } catch (err) {
        console.error('[reclassifyOthersHandler]', err);
        res.status(500).json({ error: 'Failed to trigger reclassification' });
    }
};