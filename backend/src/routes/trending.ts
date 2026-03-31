// backend/src/routes/trending.ts
// Trending stocks — gainers and most active from NSE live data
// Matches fundamentals.ts pattern: pure fetch, no DB

import { Router, Request, Response } from "express";

const router = Router();

const NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com",
    "Origin": "https://www.nseindia.com",
    "Connection": "keep-alive",
};

// ─── Fetch from NSE ───────────────────────────────────────────────────────────
async function fetchNse(path: string): Promise<any> {
    const url = `https://www.nseindia.com/api/${path}`;
    try {
        const res = await fetch(url, { headers: NSE_HEADERS });
        if (!res.ok) throw new Error(`NSE ${res.status}`);
        return await res.json();
    } catch (e: any) {
        console.warn(`[Trending] NSE fetch failed (${path}): ${e.message}`);
        return null;
    }
}

// ─── Shape raw NSE row ────────────────────────────────────────────────────────
function shapeRow(raw: any) {
    return {
        ticker: raw.symbol || raw.symbol,
        name: raw.meta?.companyName || raw.symbol,
        sector: raw.meta?.industry || null,
        cmp: parseFloat(raw.lastPrice || raw.ltp || 0),
        change1D: parseFloat(raw.pChange || 0),
        changeAbs: parseFloat(raw.change || 0),
        volume: parseInt(raw.totalTradedVolume || raw.tradedQuantity || 0),
        week52High: parseFloat(raw.yearHigh || 0) || null,
        week52Low: parseFloat(raw.yearLow || 0) || null,
        // growth5Y used by your TrendingStocks component for the % badge
        growth5Y: parseFloat(raw.pChange || 0),
    };
}

// ─── GET /api/v1/trending?type=gainers|active ─────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
    const type = (req.query.type as string) || "gainers";

    try {
        let stocks: any[] = [];

        if (type === "gainers") {
            // NSE top gainers endpoint
            const [gainers, fnoGainers] = await Promise.all([
                fetchNse("live-analysis-variations?index=gainers"),
                fetchNse("live-analysis-variations?index=fno_gainers"),
            ]);

            const gainerList = gainers?.data || [];
            const fnoList = fnoGainers?.data || [];

            // Merge + dedupe by symbol, keep highest % change
            const seen = new Set<string>();
            const merged: any[] = [];

            for (const row of [...gainerList, ...fnoList]) {
                if (!seen.has(row.symbol)) {
                    seen.add(row.symbol);
                    merged.push(row);
                }
            }

            stocks = merged
                .map(shapeRow)
                .filter(s => s.cmp > 0 && s.change1D > 0)
                .sort((a, b) => b.change1D - a.change1D)
                .slice(0, 10);

        } else if (type === "active") {
            // NSE most active by volume
            const [active, fnoActive] = await Promise.all([
                fetchNse("live-analysis-variations?index=most_active_securities"),
                fetchNse("live-analysis-variations?index=fno_most_active"),
            ]);

            const activeList = active?.data || [];
            const fnoActiveList = fnoActive?.data || [];

            const seen = new Set<string>();
            const merged: any[] = [];

            for (const row of [...activeList, ...fnoActiveList]) {
                if (!seen.has(row.symbol)) {
                    seen.add(row.symbol);
                    merged.push(row);
                }
            }

            stocks = merged
                .map(shapeRow)
                .filter(s => s.cmp > 0)
                .sort((a, b) => b.volume - a.volume)
                .slice(0, 10);

        } else {
            return res.status(400).json({ error: `Unknown type: ${type}. Use gainers or active.` });
        }

        console.log(`[Trending] ✅ type=${type}, returned ${stocks.length} stocks`);
        return res.json({ type, stocks });

    } catch (err: any) {
        console.error(`[Trending] ❌`, err.message);
        return res.status(502).json({ error: "Failed to fetch trending stocks from NSE" });
    }
});

export default router;