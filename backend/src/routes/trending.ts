// backend/src/routes/trending.ts
// Trending stocks — top gainers and most active from NSE live data
// Pure fetch pattern — no DB, matches fundamentals.ts style

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

// ─── Fetch helper ─────────────────────────────────────────────────────────────
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

// ─── Shape one NSE row into the format MainApp.js expects ─────────────────────
// MainApp reads: ticker, name, sector, cmp, growth5Y (used as % change badge)
function shapeRow(raw: any) {
  const changeVal = parseFloat(raw.pChange || raw.change || 0);
  return {
    ticker:     raw.symbol,
    name:       raw.meta?.companyName || raw.symbol,
    sector:     raw.meta?.industry || null,
    exchange:   "NSE",
    cmp:        parseFloat(raw.lastPrice || raw.ltp || 0),
    change1D:   changeVal,
    changeAbs:  parseFloat(raw.change || 0),
    volume:     parseInt(raw.totalTradedVolume || raw.tradedQuantity || 0),
    week52High: parseFloat(raw.yearHigh || 0) || null,
    week52Low:  parseFloat(raw.yearLow  || 0) || null,
    // growth5Y is what TrendingStocks component uses for the green/red % badge
    growth5Y:   parseFloat((changeVal).toFixed(2)),
  };
}

// ─── GET /api/v1/trending?type=gainers|active ─────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const type = (req.query.type as string) || "gainers";

  try {
    if (type === "gainers") {
      // Fetch top gainers from NSE
      const data = await fetchNse("live-analysis-variations?index=gainers");
      const rows = data?.data || data?.NIFTY?.data || [];

      if (rows.length === 0) {
        // Fallback: use equity market data and sort by % change
        const fallback = await fetchNse("equity-stockIndices?index=NIFTY%20500");
        const fallbackRows = (fallback?.data || [])
          .map(shapeRow)
          .filter((s: any) => s.cmp > 0 && s.change1D > 0)
          .sort((a: any, b: any) => b.change1D - a.change1D)
          .slice(0, 10);
        return res.json({ type, stocks: fallbackRows });
      }

      const stocks = rows
        .map(shapeRow)
        .filter((s: any) => s.cmp > 0 && s.change1D > 0)
        .sort((a: any, b: any) => b.change1D - a.change1D)
        .slice(0, 10);

      console.log(`[Trending] ✅ gainers: ${stocks.length} stocks`);
      return res.json({ type, stocks });

    } else if (type === "active") {
      // Fetch most active by volume
      const data = await fetchNse("live-analysis-variations?index=most_active_securities");
      const rows = data?.data || data?.NIFTY?.data || [];

      if (rows.length === 0) {
        // Fallback: sort Nifty 500 by volume
        const fallback = await fetchNse("equity-stockIndices?index=NIFTY%20500");
        const fallbackRows = (fallback?.data || [])
          .map(shapeRow)
          .filter((s: any) => s.cmp > 0 && s.volume > 0)
          .sort((a: any, b: any) => b.volume - a.volume)
          .slice(0, 10);
        return res.json({ type, stocks: fallbackRows });
      }

      const stocks = rows
        .map(shapeRow)
        .filter((s: any) => s.cmp > 0)
        .sort((a: any, b: any) => b.volume - a.volume)
        .slice(0, 10);

      console.log(`[Trending] ✅ active: ${stocks.length} stocks`);
      return res.json({ type, stocks });

    } else {
      return res.status(400).json({ error: `Unknown type: ${type}. Use gainers or active.` });
    }

  } catch (err: any) {
    console.error(`[Trending] ❌`, err.message);
    return res.status(502).json({ error: "Failed to fetch trending stocks from NSE", stocks: [] });
  }
});

export default router;
