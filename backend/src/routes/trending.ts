// backend/src/routes/trending.ts
// Trending stocks — gainers + most active
// 3 fallback layers so it ALWAYS returns data

import { Router, Request, Response } from "express";

const router = Router();

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

// ── Safe fetch helper ─────────────────────────────────────────────────────────
async function safeFetch(url: string, headers: Record<string, string>): Promise<any> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Shape NSE row into our stock format ───────────────────────────────────────
function shapeNse(raw: any): any {
  const chg = parseFloat(raw.pChange || raw.perChange || 0);
  return {
    ticker:     raw.symbol,
    name:       raw.meta?.companyName || raw.companyName || raw.symbol,
    sector:     raw.meta?.industry    || raw.industry    || null,
    cmp:        parseFloat(raw.lastPrice || raw.ltp || 0) || null,
    growth5Y:   parseFloat(chg.toFixed(2)),  // frontend uses growth5Y for % badge
    change1D:   chg,
    volume:     parseInt(raw.totalTradedVolume || raw.tradedQuantity || 0) || 0,
    week52High: parseFloat(raw.yearHigh || 0) || null,
    week52Low:  parseFloat(raw.yearLow  || 0) || null,
  };
}

// ── Layer 1: NSE live variation endpoints ─────────────────────────────────────
async function fromNse(type: "gainers" | "active"): Promise<any[]> {
  const endpoints =
    type === "gainers"
      ? ["live-analysis-variations?index=gainers", "live-analysis-variations?index=fno_gainers"]
      : ["live-analysis-variations?index=most_active_securities", "live-analysis-variations?index=fno_most_active"];

  const results = await Promise.all(
    endpoints.map(path => safeFetch(`https://www.nseindia.com/api/${path}`, NSE_HEADERS))
  );

  const seen = new Set<string>();
  const out: any[] = [];
  for (const json of results) {
    for (const row of json?.data || []) {
      if (row.symbol && !seen.has(row.symbol)) {
        seen.add(row.symbol);
        out.push(shapeNse(row));
      }
    }
  }

  if (type === "gainers") {
    return out.filter(s => s.cmp > 0 && s.change1D > 0).sort((a, b) => b.change1D - a.change1D).slice(0, 10);
  }
  return out.filter(s => s.cmp > 0).sort((a, b) => b.volume - a.volume).slice(0, 10);
}

// ── Layer 2: Yahoo Finance India screener ─────────────────────────────────────
async function fromYahoo(type: "gainers" | "active"): Promise<any[]> {
  const scrId = type === "gainers" ? "day_gainers" : "most_actives";
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&lang=en-US&region=IN&scrIds=${scrId}&count=10`;

  const json = await safeFetch(url, YF_HEADERS);
  const quotes: any[] = json?.finance?.result?.[0]?.quotes || [];

  return quotes
    .filter(q => q.symbol?.endsWith(".NS"))
    .map(q => ({
      ticker:    q.symbol.replace(".NS", ""),
      name:      q.shortName || q.longName || q.symbol,
      sector:    q.sector    || null,
      cmp:       q.regularMarketPrice?.raw  || q.regularMarketPrice  || 0,
      growth5Y:  parseFloat((q.regularMarketChangePercent?.raw || q.regularMarketChangePercent || 0).toFixed(2)),
      change1D:  q.regularMarketChangePercent?.raw || 0,
      volume:    q.regularMarketVolume?.raw || q.regularMarketVolume || 0,
      week52High: q.fiftyTwoWeekHigh?.raw  || null,
      week52Low:  q.fiftyTwoWeekLow?.raw   || null,
    }))
    .slice(0, 10);
}

// ── Layer 3: Nifty 50 sorted by change/volume (always available) ──────────────
async function fromNifty50(type: "gainers" | "active"): Promise<any[]> {
  const json = await safeFetch(
    "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050",
    NSE_HEADERS
  );

  const rows = (json?.data || [])
    .filter((r: any) => r.symbol && !r.symbol.startsWith("NIFTY") && r.symbol !== "INDIA VIX")
    .map(shapeNse)
    .filter((s: any) => s.cmp > 0);

  if (type === "gainers") {
    return rows.sort((a: any, b: any) => b.change1D - a.change1D).slice(0, 10);
  }
  return rows.sort((a: any, b: any) => b.volume - a.volume).slice(0, 10);
}

// ── Layer 4: Static fallback (market closed / all APIs down) ─────────────────
function staticFallback(): any[] {
  return [
    { ticker:"RELIANCE",  name:"Reliance Industries",    sector:"Energy",  cmp:null, growth5Y:null },
    { ticker:"TCS",       name:"Tata Consultancy",        sector:"IT",      cmp:null, growth5Y:null },
    { ticker:"HDFCBANK",  name:"HDFC Bank",              sector:"Bank",    cmp:null, growth5Y:null },
    { ticker:"INFY",      name:"Infosys",                sector:"IT",      cmp:null, growth5Y:null },
    { ticker:"ICICIBANK", name:"ICICI Bank",             sector:"Bank",    cmp:null, growth5Y:null },
    { ticker:"SBIN",      name:"State Bank of India",    sector:"Bank",    cmp:null, growth5Y:null },
    { ticker:"BAJFINANCE",name:"Bajaj Finance",          sector:"Finance", cmp:null, growth5Y:null },
    { ticker:"HINDUNILVR",name:"Hindustan Unilever",     sector:"FMCG",   cmp:null, growth5Y:null },
  ];
}

// ── GET /api/v1/trending?type=gainers|active ──────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const type = ((req.query.type as string) || "gainers").toLowerCase() as "gainers" | "active";

  if (type !== "gainers" && type !== "active") {
    return res.status(400).json({ error: "type must be gainers or active" });
  }

  let stocks: any[] = [];
  let source = "";

  // Layer 1 — NSE live
  try {
    stocks = await fromNse(type);
    if (stocks.length > 0) source = "NSE";
  } catch {}

  // Layer 2 — Yahoo Finance India
  if (stocks.length === 0) {
    try {
      stocks = await fromYahoo(type);
      if (stocks.length > 0) source = "Yahoo";
    } catch {}
  }

  // Layer 3 — Nifty 50 constituents
  if (stocks.length === 0) {
    try {
      stocks = await fromNifty50(type);
      if (stocks.length > 0) source = "Nifty50";
    } catch {}
  }

  // Layer 4 — Static list (never fails)
  if (stocks.length === 0) {
    stocks = staticFallback();
    source = "static";
  }

  console.log(`[Trending] ✅ type=${type}, stocks=${stocks.length}, source=${source}`);
  return res.json({ type, stocks, source });
});

export default router;
