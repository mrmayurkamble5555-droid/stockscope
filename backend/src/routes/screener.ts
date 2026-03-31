// backend/src/routes/screener.ts
// Sector screener — fetches live from NSE, sorts & ranks on the fly
// Matches the exact pattern of fundamentals.ts (pure fetch, no DB)

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

// ─── NSE Sector Index Map ─────────────────────────────────────────────────────
// Maps display sector name → NSE index symbol
const SECTOR_INDEX_MAP: Record<string, string> = {
    "Automobile": "NIFTY AUTO",
    "Bank": "NIFTY BANK",
    "Financial Services": "NIFTY FIN SERVICE",
    "FMCG": "NIFTY FMCG",
    "IT": "NIFTY IT",
    "Media": "NIFTY MEDIA",
    "Metal": "NIFTY METAL",
    "Pharma": "NIFTY PHARMA",
    "PSU Bank": "NIFTY PSU BANK",
    "Private Bank": "NIFTY PRIVATE BANK",
    "Realty": "NIFTY REALTY",
    "Energy": "NIFTY ENERGY",
    "Infrastructure": "NIFTY INFRA",
    "Consumption": "NIFTY INDIA CONSUMPTION",
    "Capital Goods": "NIFTY CPSE",
    "Healthcare": "NIFTY HEALTHCARE INDEX",
    "Oil & Gas": "NIFTY OIL AND GAS",
    "Chemicals": "NIFTY INDIA MFG",
};

const ALL_SECTORS = Object.keys(SECTOR_INDEX_MAP);

// ─── Fetch one NSE sector index constituents ──────────────────────────────────
async function fetchNseSectorStocks(nseIndex: string): Promise<any[]> {
    const encoded = encodeURIComponent(nseIndex);
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encoded}`;

    try {
        const res = await fetch(url, { headers: NSE_HEADERS });
        if (!res.ok) throw new Error(`NSE returned ${res.status}`);
        const json: any = await res.json();
        return json?.data || [];
    } catch (e: any) {
        console.warn(`[Screener] NSE fetch failed for ${nseIndex}: ${e.message}`);
        return [];
    }
}

// ─── Shape one NSE stock row into our format ──────────────────────────────────
function shapeStock(raw: any, sector: string, rank?: number) {
    const pe = parseFloat(raw.pe || raw.peTtm || 0);
    const cmp = parseFloat(raw.lastPrice || raw.ltp || 0);

    return {
        ticker: raw.symbol,
        name: raw.meta?.companyName || raw.symbol,
        sector,
        cmp: cmp,
        pe: pe || null,
        debtToEquity: null,          // not in NSE index response — filled by fundamentals
        netProfit: null,
        growth5Y: null,
        week52High: parseFloat(raw.yearHigh || 0) || null,
        week52Low: parseFloat(raw.yearLow || 0) || null,
        change1D: parseFloat(raw.pChange || 0),
        volume: parseInt(raw.totalTradedVolume || 0),
        marketCap: parseFloat(raw.ffmc || 0) || null,
        rank: rank ?? null,
    };
}

// ─── Sort stocks by selected sort key ────────────────────────────────────────
function sortStocks(stocks: any[], sortBy: string): any[] {
    const sorted = [...stocks];

    switch (sortBy) {
        case "pe":
            // P/E ascending — lowest first (cheaper valuation)
            return sorted.sort((a, b) => {
                if (!a.pe && !b.pe) return 0;
                if (!a.pe) return 1;
                if (!b.pe) return -1;
                return a.pe - b.pe;
            });

        case "pe_desc":
            // P/E descending — highest first
            return sorted.sort((a, b) => {
                if (!a.pe && !b.pe) return 0;
                if (!a.pe) return 1;
                if (!b.pe) return -1;
                return b.pe - a.pe;
            });

        case "profit":
            return sorted.sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0));

        case "growth":
            return sorted.sort((a, b) => (b.change1D || 0) - (a.change1D || 0));

        case "debt":
            // Lowest debt first
            return sorted.sort((a, b) => {
                if (!a.debtToEquity && !b.debtToEquity) return 0;
                if (!a.debtToEquity) return 1;
                if (!b.debtToEquity) return -1;
                return a.debtToEquity - b.debtToEquity;
            });

        case "marketcap":
            return sorted.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

        case "volume":
            return sorted.sort((a, b) => (b.volume || 0) - (a.volume || 0));

        case "rank":
        default:
            return sorted.sort((a, b) => (a.rank || 999) - (b.rank || 999));
    }
}

// ─── Rank stocks within a sector using composite scoring ─────────────────────
function rankStocks(stocks: any[]): any[] {
    if (stocks.length === 0) return [];

    // Extract valid numeric values for each metric
    const peVals = stocks.map(s => s.pe).filter(v => v && v > 0) as number[];
    const capVals = stocks.map(s => s.marketCap).filter(v => v && v > 0) as number[];

    const percentile = (val: number, arr: number[], higherIsBetter: boolean): number => {
        if (!val || arr.length === 0) return 50; // neutral if no data
        const beaten = arr.filter(v => higherIsBetter ? val > v : val < v).length;
        return (beaten / arr.length) * 100;
    };

    return stocks.map((s, i) => {
        let score = 0;
        let count = 0;

        // Lower P/E = better value
        if (s.pe && peVals.length > 0) {
            score += percentile(s.pe, peVals, false);
            count++;
        }

        // Higher market cap = more established
        if (s.marketCap && capVals.length > 0) {
            score += percentile(s.marketCap, capVals, true);
            count++;
        }

        return {
            ...s,
            compositeScore: count > 0 ? score / count : 50,
        };
    })
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ─── GET /api/v1/screener ─────────────────────────────────────────────────────
// Without ?sector → returns sector list with counts
// With ?sector=X  → returns ranked stocks for that sector
router.get("/", async (req: Request, res: Response) => {
    const { sector, sort = "rank", limit = "200" } = req.query as Record<string, string>;

    // ── Sector list request ───────────────────────────────────────────────────
    if (!sector) {
        try {
            // Fetch all sectors in parallel — get counts from NSE
            const results = await Promise.allSettled(
                ALL_SECTORS.map(async (sectorName) => {
                    const nseIndex = SECTOR_INDEX_MAP[sectorName];
                    const stocks = await fetchNseSectorStocks(nseIndex);
                    return { sector: sectorName, count: stocks.length };
                })
            );

            const sectors = results
                .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
                .map(r => r.value)
                .filter(s => s.count > 0)          // remove any failed/empty sectors
                .sort((a, b) => b.count - a.count); // most stocks first

            console.log(`[Screener] Sector list: ${sectors.length} sectors`);
            return res.json({ sectors });

        } catch (err: any) {
            console.error("[Screener] Sector list failed:", err.message);
            return res.status(502).json({ error: "Failed to fetch sector list" });
        }
    }

    // ── Single sector stock list ──────────────────────────────────────────────
    const nseIndex = SECTOR_INDEX_MAP[sector as string];
    if (!nseIndex) {
        return res.status(404).json({ error: `Unknown sector: ${sector}` });
    }

    try {
        const rawStocks = await fetchNseSectorStocks(nseIndex);

        if (rawStocks.length === 0) {
            return res.json({ sector, stocks: [], total: 0 });
        }

        // Shape → rank → sort → limit
        const shaped = rawStocks.map(s => shapeStock(s, sector as string));
        const ranked = rankStocks(shaped);
        const sorted = sortStocks(ranked, sort);
        const limited = sorted.slice(0, parseInt(limit));

        console.log(`[Screener] ✅ ${sector}: ${limited.length} stocks, sort=${sort}`);
        return res.json({
            sector,
            total: rawStocks.length,
            stocks: limited,
        });

    } catch (err: any) {
        console.error(`[Screener] ❌ ${sector}:`, err.message);
        return res.status(502).json({ error: `Failed to fetch stocks for sector: ${sector}` });
    }
});

export default router;