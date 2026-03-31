// backend/src/routes/screener.ts
// Sector screener — fetches live from NSE equity index endpoints
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

// ─── NSE index name → display sector name ─────────────────────────────────────
const SECTORS: { name: string; index: string }[] = [
  { name: "IT",               index: "NIFTY IT" },
  { name: "Bank",             index: "NIFTY BANK" },
  { name: "Pharma",           index: "NIFTY PHARMA" },
  { name: "FMCG",             index: "NIFTY FMCG" },
  { name: "Automobile",       index: "NIFTY AUTO" },
  { name: "Financial Services", index: "NIFTY FIN SERVICE" },
  { name: "Metal",            index: "NIFTY METAL" },
  { name: "Realty",           index: "NIFTY REALTY" },
  { name: "Energy",           index: "NIFTY ENERGY" },
  { name: "Media",            index: "NIFTY MEDIA" },
  { name: "PSU Bank",         index: "NIFTY PSU BANK" },
  { name: "Private Bank",     index: "NIFTY PRIVATE BANK" },
  { name: "Healthcare",       index: "NIFTY HEALTHCARE INDEX" },
  { name: "Infrastructure",   index: "NIFTY INFRA" },
  { name: "Capital Goods",    index: "NIFTY CPSE" },
  { name: "Oil & Gas",        index: "NIFTY OIL AND GAS" },
  { name: "Consumption",      index: "NIFTY INDIA CONSUMPTION" },
];

// ─── Fetch one NSE sector index ───────────────────────────────────────────────
async function fetchSectorStocks(nseIndex: string): Promise<any[]> {
  const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(nseIndex)}`;
  try {
    const res = await fetch(url, { headers: NSE_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    // NSE returns the index itself as first row — skip it (no symbol field or symbol === index name)
    return (json?.data || []).filter((r: any) => r.symbol && !r.symbol.includes("NIFTY"));
  } catch (e: any) {
    console.warn(`[Screener] fetch failed for ${nseIndex}: ${e.message}`);
    return [];
  }
}

// ─── Shape raw NSE row into format Screener table expects ─────────────────────
// MainApp Screener reads: ticker, name, sector, cmp, pe, debtToEquity,
//   netProfit, growth5Y, week52High, week52Low, rank
function shapeStock(raw: any, sector: string) {
  const pe  = parseFloat(raw.pe || raw.peTtm || 0) || null;
  const cmp = parseFloat(raw.lastPrice || raw.ltp || 0);
  return {
    ticker:       raw.symbol,
    name:         raw.meta?.companyName || raw.symbol,
    sector,
    exchange:     "NSE",
    cmp:          cmp,
    pe:           pe,
    debtToEquity: null,   // not in NSE index data
    netProfit:    null,   // not in NSE index data
    growth5Y:     parseFloat(raw.pChange || 0),   // use 1D change as proxy
    week52High:   parseFloat(raw.yearHigh || 0) || null,
    week52Low:    parseFloat(raw.yearLow  || 0) || null,
    volume:       parseInt(raw.totalTradedVolume || 0),
    marketCap:    parseFloat(raw.ffmc || 0) || null,
    change1D:     parseFloat(raw.pChange || 0),
    rank:         null,   // assigned after ranking
  };
}

// ─── Rank stocks by composite score within their sector ───────────────────────
// Uses P/E (lower=better) + marketCap (higher=better) + 52W position
function rankStocks(stocks: any[]): any[] {
  if (stocks.length === 0) return [];

  const peVals  = stocks.map(s => s.pe).filter((v): v is number => v !== null && v > 0);
  const capVals = stocks.map(s => s.marketCap).filter((v): v is number => v !== null && v > 0);

  function percentile(val: number | null, arr: number[], higherIsBetter: boolean): number {
    if (val === null || arr.length === 0) return 50;
    const beaten = arr.filter(v => higherIsBetter ? val > v : val < v).length;
    return (beaten / arr.length) * 100;
  }

  const scored = stocks.map(s => {
    let score = 0;
    let count = 0;

    if (s.pe !== null && peVals.length > 0) {
      score += percentile(s.pe, peVals, false); // lower PE = better
      count++;
    }
    if (s.marketCap !== null && capVals.length > 0) {
      score += percentile(s.marketCap, capVals, true); // higher cap = better
      count++;
    }

    return { ...s, compositeScore: count > 0 ? score / count : 50 };
  });

  return scored
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ─── Sort stocks by chosen sort key ──────────────────────────────────────────
function sortStocks(stocks: any[], sortBy: string): any[] {
  const arr = [...stocks];
  switch (sortBy) {
    case "pe":
      return arr.sort((a, b) => {
        if (!a.pe && !b.pe) return 0;
        if (!a.pe) return 1;
        if (!b.pe) return -1;
        return a.pe - b.pe;
      });
    case "pe_desc":
      return arr.sort((a, b) => {
        if (!a.pe && !b.pe) return 0;
        if (!a.pe) return 1;
        if (!b.pe) return -1;
        return b.pe - a.pe;
      });
    case "profit":
      return arr.sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0));
    case "growth":
      return arr.sort((a, b) => (b.change1D || 0) - (a.change1D || 0));
    case "debt":
      return arr.sort((a, b) => (a.debtToEquity || 999) - (b.debtToEquity || 999));
    case "marketcap":
      return arr.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    case "rank":
    default:
      return arr.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  }
}

// ─── GET /api/v1/screener ─────────────────────────────────────────────────────
// No query params  → returns sector list with counts
// ?sector=X        → returns ranked + sorted stocks for that sector
// ?sector=X&sort=Y → same with custom sort
router.get("/", async (req: Request, res: Response) => {
  const { sector, sort = "rank", limit = "200" } = req.query as Record<string, string>;

  // ── Sector list ──────────────────────────────────────────────────────────
  if (!sector) {
    try {
      // Fetch all sectors in parallel — just need counts
      const results = await Promise.allSettled(
        SECTORS.map(async ({ name, index }) => {
          const stocks = await fetchSectorStocks(index);
          return { sector: name, count: stocks.length };
        })
      );

      const sectors = results
        .filter((r): r is PromiseFulfilledResult<{ sector: string; count: number }> =>
          r.status === "fulfilled" && r.value.count > 0
        )
        .map(r => r.value)
        .sort((a, b) => b.count - a.count);

      console.log(`[Screener] ✅ sector list: ${sectors.length} sectors`);
      return res.json({ sectors });

    } catch (err: any) {
      console.error("[Screener] sector list failed:", err.message);
      return res.status(502).json({ error: "Failed to fetch sector list", sectors: [] });
    }
  }

  // ── Single sector stocks ─────────────────────────────────────────────────
  const sectorConfig = SECTORS.find(s => s.name === sector);
  if (!sectorConfig) {
    return res.status(404).json({ error: `Unknown sector: ${sector}`, stocks: [] });
  }

  try {
    const rawStocks = await fetchSectorStocks(sectorConfig.index);

    if (rawStocks.length === 0) {
      return res.json({ sector, stocks: [], total: 0 });
    }

    const shaped  = rawStocks.map(s => shapeStock(s, sector));
    const ranked  = rankStocks(shaped);
    const sorted  = sortStocks(ranked, sort);
    const limited = sorted.slice(0, parseInt(limit));

    console.log(`[Screener] ✅ ${sector}: ${limited.length} stocks, sort=${sort}`);
    return res.json({ sector, total: rawStocks.length, stocks: limited });

  } catch (err: any) {
    console.error(`[Screener] ❌ ${sector}:`, err.message);
    return res.status(502).json({ error: `Failed to fetch ${sector} stocks`, stocks: [] });
  }
});

export default router;
