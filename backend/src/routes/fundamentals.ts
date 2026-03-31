// src/routes/fundamentals.ts
// Fetches all fundamental data for fair value calculation
// Uses query2 + full browser headers to avoid Yahoo 401 blocks

import { Router, Request, Response } from "express";

const router = Router();

// Yahoo Finance requires browser-like headers to avoid 401
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
};

// Try multiple Yahoo endpoints in order — fallback if one is blocked
async function fetchYahoo(ticker: string): Promise<any> {
  const modules = [
    "defaultKeyStatistics",
    "financialData",
    "summaryDetail",
    "cashflowStatementHistory",
    "earningsTrend",
  ].join(",");

  // Try query2 first (less rate-limited), then query1
  const urls = [
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`,
    // v8 fallback — fewer modules but more permissive
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y&includePrePost=false`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YF_HEADERS });
      if (res.ok) {
        const json: any = await res.json();
        // v10 response
        if (json?.quoteSummary?.result?.[0]) return { type: "v10", data: json.quoteSummary.result[0] };
        // v8 response
        if (json?.chart?.result?.[0]) return { type: "v8", data: json.chart.result[0] };
      }
      console.warn(`[Fundamentals] ${url.includes('query2')?'query2':'query1'} returned ${res.status}, trying next...`);
    } catch (e: any) {
      console.warn(`[Fundamentals] Fetch failed: ${e.message}`);
    }
  }
  throw new Error("All Yahoo Finance endpoints failed");
}

// Extract fundamentals from v10 quoteSummary response
function extractV10(result: any) {
  const ks  = result.defaultKeyStatistics || {};
  const fd  = result.financialData        || {};
  const sd  = result.summaryDetail        || {};
  const cfh = result.cashflowStatementHistory?.cashflowStatements?.[0] || {};
  const et  = result.earningsTrend?.trend || [];

  const eps       = ks.trailingEps?.raw || 0;
  const bookValue = ks.bookValue?.raw   || 0;

  const fcfRaw      = cfh.freeCashflow?.raw
    || ((cfh.totalCashFromOperatingActivities?.raw || 0) + (cfh.capitalExpenditures?.raw || 0));
  const sharesOut   = ks.sharesOutstanding?.raw || 1;
  const fcfPerShare = Math.max(0, fcfRaw / sharesOut);

  const pe        = sd.trailingPE?.raw || ks.trailingPE?.raw || 0;
  const forwardPE = sd.forwardPE?.raw  || ks.forwardPE?.raw  || 0;
  const industryPE = forwardPE > 0
    ? Math.min(forwardPE * 1.15, 60)
    : (pe > 0 ? Math.min(pe * 0.85, 55) : 30);

  const roe          = fd.returnOnEquity?.raw ? fd.returnOnEquity.raw * 100 : 0;
  const debtToEquity = fd.debtToEquity?.raw   || ks.debtToEquity?.raw || 0;

  let growthRate = 12;
  const fiveYr = et.find((t: any) => t.period === "+5y");
  if (fiveYr?.growth?.raw)          growthRate = Math.min(Math.abs(fiveYr.growth.raw * 100), 35);
  else if (fd.revenueGrowth?.raw)   growthRate = Math.min(Math.abs(fd.revenueGrowth.raw * 100), 30);
  else if (fd.earningsGrowth?.raw)  growthRate = Math.min(Math.abs(fd.earningsGrowth.raw * 100), 30);

  const cmp = fd.currentPrice?.raw || sd.regularMarketPrice?.raw || 0;

  return { cmp, eps, bookValue, fcfPerShare, pe, industryPE, roe, debtToEquity, growthRate };
}

// Extract what we can from v8 chart response (limited fallback)
function extractV8(result: any) {
  const meta = result.meta || {};
  const cmp  = meta.regularMarketPrice || 0;
  const pe   = meta.trailingPE || 0;

  return {
    cmp,
    eps:          0,
    bookValue:    0,
    fcfPerShare:  0,
    pe,
    industryPE:   pe > 0 ? Math.min(pe * 0.85, 55) : 30,
    roe:          0,
    debtToEquity: 0,
    growthRate:   12,
    partial:      true, // flag that data is incomplete
  };
}

// GET /api/v1/fundamentals/:symbol
router.get("/:symbol", async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const ticker = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;

  try {
    const { type, data } = await fetchYahoo(ticker);

    const raw = type === "v10" ? extractV10(data) : extractV8(data);

    const payload = {
      ticker:       symbol.toUpperCase(),
      source:       type,
      partial:      (raw as any).partial || false,
      cmp:          parseFloat(raw.cmp.toFixed(2)),
      eps:          parseFloat(raw.eps.toFixed(2)),
      bookValue:    parseFloat(raw.bookValue.toFixed(2)),
      fcfPerShare:  parseFloat(raw.fcfPerShare.toFixed(2)),
      pe:           parseFloat(raw.pe.toFixed(2)),
      industryPE:   parseFloat(raw.industryPE.toFixed(2)),
      roe:          parseFloat(raw.roe.toFixed(2)),
      debtToEquity: parseFloat(raw.debtToEquity.toFixed(2)),
      growthRate:   parseFloat(raw.growthRate.toFixed(2)),
    };

    console.log(`[Fundamentals] ✅ ${ticker} via ${type} — EPS:${payload.eps} PE:${payload.pe}`);
    return res.json(payload);

  } catch (err: any) {
    console.error(`[Fundamentals] ❌ ${ticker}:`, err.message);
    return res.status(502).json({ error: "Could not fetch fundamentals from Yahoo Finance", ticker });
  }
});

export default router;
