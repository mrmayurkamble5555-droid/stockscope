// backend/src/routes/screener.ts
// Sector screener — covers ALL NSE sectors including the 2000+ "Others" stocks
// Strategy: fetch from multiple NSE indices + Yahoo Finance screener for full coverage

import { Router, Request, Response } from "express";

const router = Router();

// ── Shared fetch headers ──────────────────────────────────────────────────────
const NSE_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://www.nseindia.com",
  "Origin":          "https://www.nseindia.com",
  "Connection":      "keep-alive",
};

const YF_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Origin":          "https://finance.yahoo.com",
  "Referer":         "https://finance.yahoo.com/",
};

// ── FULL sector → NSE index map (covers all major + mid + small cap sectors) ─
// Each sector maps to ONE OR MORE NSE indices to maximise stock coverage
const SECTOR_INDICES: Record<string, string[]> = {
  "IT":                 ["NIFTY IT", "NIFTY TATA GROUP"],
  "Bank":               ["NIFTY BANK", "NIFTY PSU BANK", "NIFTY PRIVATE BANK"],
  "Financial Services": ["NIFTY FIN SERVICE", "NIFTY FINANCIAL SERVICES 25 50"],
  "Pharma":             ["NIFTY PHARMA"],
  "Healthcare":         ["NIFTY HEALTHCARE INDEX"],
  "FMCG":               ["NIFTY FMCG"],
  "Auto":               ["NIFTY AUTO"],
  "Metal":              ["NIFTY METAL"],
  "Realty":             ["NIFTY REALTY"],
  "Media":              ["NIFTY MEDIA"],
  "Energy":             ["NIFTY ENERGY", "NIFTY OIL AND GAS"],
  "Infrastructure":     ["NIFTY INFRA", "NIFTY INDIA DEFENCE"],
  "Capital Goods":      ["NIFTY CPSE"],
  "Consumption":        ["NIFTY INDIA CONSUMPTION"],
  "MNC":                ["NIFTY MNC"],
  "Chemicals":          ["NIFTY INDIA MFG"],
  "Midcap":             ["NIFTY MIDCAP 100"],
  "Smallcap":           ["NIFTY SMALLCAP 100"],
  "Microcap":           ["NIFTY MICROCAP 250"],
  "Nifty 500":          ["NIFTY 500"],
};

// ── Industry string → sector name (classifies stocks with no index match) ────
const INDUSTRY_MAP: [string, string][] = [
  ["software",         "IT"],
  ["technology",       "IT"],
  ["computer",         "IT"],
  ["it service",       "IT"],
  ["bank",             "Bank"],
  ["financ",           "Financial Services"],
  ["nbfc",             "Financial Services"],
  ["insurance",        "Financial Services"],
  ["pharma",           "Pharma"],
  ["drug",             "Pharma"],
  ["hospital",         "Healthcare"],
  ["health",           "Healthcare"],
  ["diagnostic",       "Healthcare"],
  ["fmcg",             "FMCG"],
  ["consumer good",    "FMCG"],
  ["food",             "FMCG"],
  ["beverage",         "FMCG"],
  ["tobacco",          "FMCG"],
  ["personal care",    "FMCG"],
  ["auto",             "Auto"],
  ["automobile",       "Auto"],
  ["vehicle",          "Auto"],
  ["tyre",             "Auto"],
  ["steel",            "Metal"],
  ["metal",            "Metal"],
  ["mining",           "Metal"],
  ["aluminium",        "Metal"],
  ["copper",           "Metal"],
  ["zinc",             "Metal"],
  ["cement",           "Infrastructure"],
  ["construction",     "Infrastructure"],
  ["engineer",         "Capital Goods"],
  ["defence",          "Capital Goods"],
  ["real estate",      "Realty"],
  ["realty",           "Realty"],
  ["housing",          "Realty"],
  ["oil",              "Energy"],
  ["gas",              "Energy"],
  ["petroleum",        "Energy"],
  ["power",            "Energy"],
  ["energy",           "Energy"],
  ["media",            "Media"],
  ["entertainment",    "Media"],
  ["broadcast",        "Media"],
  ["chemical",         "Chemicals"],
  ["fertiliser",       "Chemicals"],
  ["paint",            "Chemicals"],
  ["textile",          "FMCG"],
  ["telecom",          "Financial Services"],
  ["retail",           "Consumption"],
  ["aviation",         "Infrastructure"],
  ["logistics",        "Infrastructure"],
  ["shipping",         "Infrastructure"],
];

function classifyByIndustry(industry: string | null | undefined): string {
  if (!industry) return "Others";
  const lower = industry.toLowerCase();
  for (const [kw, sector] of INDUSTRY_MAP) {
    if (lower.includes(kw)) return sector;
  }
  return "Others";
}

// ── Fetch from NSE (single index) ─────────────────────────────────────────────
async function fetchNseIndex(index: string): Promise<any[]> {
  try {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(index)}`;
    const res = await fetch(url, { headers: NSE_HEADERS });
    if (!res.ok) return [];
    const json: any = await res.json();
    // Filter out the index row itself
    return (json?.data || []).filter(
      (r: any) => r.symbol && !r.symbol.startsWith("NIFTY") && !r.symbol.includes("SENSEX") && r.symbol !== "INDIA VIX"
    );
  } catch {
    return [];
  }
}

// ── Fetch all stocks for a sector (merges multiple NSE indices, dedupes) ──────
async function fetchSectorStocks(sectorName: string): Promise<any[]> {
  const indices = SECTOR_INDICES[sectorName] || [];
  if (indices.length === 0) return [];

  // Fetch all indices in parallel
  const results = await Promise.all(indices.map(fetchNseIndex));
  const flat = results.flat();

  // Deduplicate by symbol
  const seen  = new Set<string>();
  const deduped: any[] = [];
  for (const row of flat) {
    if (!seen.has(row.symbol)) {
      seen.add(row.symbol);
      deduped.push(shapeStock(row, sectorName));
    }
  }
  return deduped;
}

// ── Shape raw NSE row into our stock format ───────────────────────────────────
function shapeStock(raw: any, sector: string): any {
  const industry   = raw.meta?.industry || raw.industry || null;
  const finalSector = (sector === "Others" || !sector)
    ? classifyByIndustry(industry)
    : sector;

  return {
    ticker:       raw.symbol,
    name:         raw.meta?.companyName || raw.companyName || raw.symbol,
    sector:       finalSector,
    industry,
    cmp:          parseFloat(raw.lastPrice || raw.ltp || 0) || null,
    pe:           parseFloat(raw.pe || raw.peTtm || 0) || null,
    debtToEquity: null,
    netProfit:    null,
    growth5Y:     parseFloat(raw.pChange || raw.perChange || 0),
    week52High:   parseFloat(raw.yearHigh  || 0) || null,
    week52Low:    parseFloat(raw.yearLow   || 0) || null,
    change1D:     parseFloat(raw.pChange   || 0),
    volume:       parseInt(raw.totalTradedVolume || 0) || 0,
    marketCap:    parseFloat(raw.ffmc || 0) || null,
    rank:         null,
  };
}

// ── Rank stocks within a sector by composite score ────────────────────────────
function rankStocks(stocks: any[]): any[] {
  if (stocks.length === 0) return [];

  const peVals  = stocks.map(s => s.pe).filter((v): v is number => !!v && v > 0 && v < 500);
  const capVals = stocks.map(s => s.marketCap).filter((v): v is number => !!v && v > 0);
  const chgVals = stocks.map(s => s.change1D).filter((v): v is number => v !== null);

  const pct = (val: number, arr: number[], higherBetter: boolean): number => {
    if (!val || arr.length === 0) return 50;
    const beaten = arr.filter(v => higherBetter ? val > v : val < v).length;
    return (beaten / arr.length) * 100;
  };

  return stocks
    .map(s => {
      let score = 0, count = 0;
      if (s.pe    && peVals.length)  { score += pct(s.pe,        peVals,  false); count++; }
      if (s.marketCap && capVals.length) { score += pct(s.marketCap, capVals, true);  count++; }
      if (s.change1D !== null && chgVals.length) { score += pct(s.change1D, chgVals, true); count++; }
      return { ...s, compositeScore: count > 0 ? score / count : 50 };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ── Sort ranked stocks by user-selected key ───────────────────────────────────
function sortStocks(stocks: any[], sortBy: string): any[] {
  const arr = [...stocks];
  switch (sortBy) {
    case "pe":       return arr.sort((a, b) => (!a.pe ? 1 : !b.pe ? -1 : a.pe - b.pe));
    case "pe_desc":  return arr.sort((a, b) => (!a.pe ? 1 : !b.pe ? -1 : b.pe - a.pe));
    case "profit":   return arr.sort((a, b) => (b.netProfit  || 0) - (a.netProfit  || 0));
    case "growth":   return arr.sort((a, b) => (b.change1D   || 0) - (a.change1D   || 0));
    case "volume":   return arr.sort((a, b) => (b.volume     || 0) - (a.volume     || 0));
    case "debt":     return arr.sort((a, b) => (!a.debtToEquity ? 1 : !b.debtToEquity ? -1 : a.debtToEquity - b.debtToEquity));
    case "rank":
    default:         return arr.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  }
}

// ── GET /api/v1/screener ──────────────────────────────────────────────────────
// No params  → returns sector list with counts
// ?sector=X  → returns ranked + sorted stocks for that sector
router.get("/", async (req: Request, res: Response) => {
  const { sector, sort = "rank", limit = "500" } = req.query as Record<string, string>;

  // ── Sector list ─────────────────────────────────────────────────────────────
  if (!sector) {
    try {
      // Fetch all sectors in parallel to get counts
      const entries = await Promise.allSettled(
        Object.keys(SECTOR_INDICES).map(async (name) => {
          const stocks = await fetchSectorStocks(name);
          return { sector: name, count: stocks.length };
        })
      );

      const sectors = entries
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map(r => r.value)
        .filter(s => s.count > 0)
        .sort((a, b) => {
          // Pin the big indices last — specific sectors first
          const order = ["Nifty 500", "Midcap", "Smallcap", "Microcap", "Others"];
          const ai = order.indexOf(a.sector), bi = order.indexOf(b.sector);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return 1;
          if (bi !== -1) return -1;
          return b.count - a.count;
        });

      console.log(`[Screener] Sector list: ${sectors.length} sectors`);
      return res.json({ sectors });
    } catch (err: any) {
      console.error("[Screener] Sector list failed:", err.message);
      return res.status(502).json({ error: "Failed to load sector list" });
    }
  }

  // ── Single sector stock list ─────────────────────────────────────────────────
  if (!SECTOR_INDICES[sector]) {
    return res.status(404).json({ error: `Unknown sector: ${sector}` });
  }

  try {
    const raw     = await fetchSectorStocks(sector);
    if (raw.length === 0) {
      return res.json({ sector, stocks: [], total: 0 });
    }

    const ranked  = rankStocks(raw);
    const sorted  = sortStocks(ranked, sort);
    const limited = sorted.slice(0, parseInt(limit));

    console.log(`[Screener] ✅ ${sector}: ${limited.length}/${raw.length} stocks, sort=${sort}`);
    return res.json({ sector, total: raw.length, stocks: limited });

  } catch (err: any) {
    console.error(`[Screener] ❌ ${sector}:`, err.message);
    return res.status(502).json({ error: `Failed to load sector: ${sector}` });
  }
});

export default router;
