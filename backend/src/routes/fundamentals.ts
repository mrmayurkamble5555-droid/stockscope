// src/routes/fundamentals.ts
// Fetches all fundamental data for fair value calculation
// Uses crumb-free v7 endpoint which works without cookies

import { Router, Request, Response } from "express";

const router = Router();

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Origin": "https://finance.yahoo.com",
  "Referer": "https://finance.yahoo.com/",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

async function fetchYahoo(ticker: string): Promise<any> {
  const modules = [
    "defaultKeyStatistics",
    "financialData",
    "summaryDetail",
    "cashflowStatementHistory",
    "earningsTrend",
    "incomeStatementHistory",
  ].join(",");

  // Try multiple endpoint combinations
  const urls = [
    // v10 query2 (primary)
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&corsDomain=finance.yahoo.com&formatted=false`,
    // v10 query1
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&corsDomain=finance.yahoo.com&formatted=false`,
    // v11 (newer endpoint)
    `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=${modules}`,
    // v8 chart fallback (limited but usually works)
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`,
  ];

  let lastError = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        console.warn(`[Fundamentals] ${url.split("?")[0]} → ${res.status}`);
        continue;
      }

      const json: any = await res.json();

      if (json?.quoteSummary?.result?.[0]) {
        console.log(`[Fundamentals] ✅ ${ticker} via v10/v11`);
        return { type: "v10", data: json.quoteSummary.result[0] };
      }
      if (json?.chart?.result?.[0]) {
        console.log(`[Fundamentals] ⚠️  ${ticker} via v8 (partial)`);
        return { type: "v8", data: json.chart.result[0] };
      }
    } catch (e: any) {
      lastError = e.message;
      console.warn(`[Fundamentals] fetch error: ${e.message}`);
    }
  }
  throw new Error(`All Yahoo Finance endpoints failed: ${lastError}`);
}

function extractV10(result: any) {
  const ks  = result.defaultKeyStatistics  || {};
  const fd  = result.financialData         || {};
  const sd  = result.summaryDetail         || {};
  const cfh = result.cashflowStatementHistory?.cashflowStatements?.[0] || {};
  const is0 = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
  const et  = result.earningsTrend?.trend  || [];

  // EPS — try multiple fields
  const eps =
    ks.trailingEps?.raw ||
    (is0.netIncome?.raw && ks.sharesOutstanding?.raw
      ? is0.netIncome.raw / ks.sharesOutstanding.raw
      : 0) ||
    0;

  const bookValue = ks.bookValue?.raw || 0;

  // FCF per share
  const fcfRaw =
    cfh.freeCashflow?.raw ||
    ((cfh.totalCashFromOperatingActivities?.raw || 0) +
      (cfh.capitalExpenditures?.raw || 0));
  const sharesOut   = ks.sharesOutstanding?.raw || 1e9;
  const fcfPerShare = Math.max(0, fcfRaw / sharesOut);

  const pe        = sd.trailingPE?.raw  || ks.trailingPE?.raw  || fd.currentPrice?.raw / Math.max(eps, 1) || 0;
  const forwardPE = sd.forwardPE?.raw   || ks.forwardPE?.raw   || 0;
  const industryPE = forwardPE > 0
    ? Math.min(forwardPE * 1.15, 60)
    : pe > 0 ? Math.min(pe * 0.85, 55) : 30;

  const roe          = fd.returnOnEquity?.raw ? fd.returnOnEquity.raw * 100 : 0;
  const debtToEquity = fd.debtToEquity?.raw   || ks.debtToEquity?.raw       || 0;

  let growthRate = 12;
  const fiveYr = et.find((t: any) => t.period === "+5y");
  if (fiveYr?.growth?.raw)         growthRate = Math.min(Math.abs(fiveYr.growth.raw * 100), 35);
  else if (fd.revenueGrowth?.raw)  growthRate = Math.min(Math.abs(fd.revenueGrowth.raw * 100), 30);
  else if (fd.earningsGrowth?.raw) growthRate = Math.min(Math.abs(fd.earningsGrowth.raw * 100), 30);

  const cmp = fd.currentPrice?.raw || sd.regularMarketPrice?.raw || 0;

  return { cmp, eps, bookValue, fcfPerShare, pe, industryPE, roe, debtToEquity, growthRate, partial: false };
}

function extractV8(result: any) {
  const meta = result.meta || {};
  const cmp  = meta.regularMarketPrice || 0;
  const pe   = meta.trailingPE || 0;
  return {
    cmp, eps: 0, bookValue: 0, fcfPerShare: 0, pe,
    industryPE: pe > 0 ? Math.min(pe * 0.85, 55) : 30,
    roe: 0, debtToEquity: 0, growthRate: 12, partial: true,
  };
}

router.get("/:symbol", async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const ticker = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;

  try {
    const { type, data } = await fetchYahoo(ticker);
    const raw = type === "v10" ? extractV10(data) : extractV8(data);

    const safe = (v: number) => isNaN(v) ? 0 : parseFloat(v.toFixed(2));

    const payload = {
      ticker:       symbol.toUpperCase(),
      source:       type,
      partial:      raw.partial,
      cmp:          safe(raw.cmp),
      eps:          safe(raw.eps),
      bookValue:    safe(raw.bookValue),
      fcfPerShare:  safe(raw.fcfPerShare),
      pe:           safe(raw.pe),
      industryPE:   safe(raw.industryPE),
      roe:          safe(raw.roe),
      debtToEquity: safe(raw.debtToEquity),
      growthRate:   safe(raw.growthRate),
    };

    console.log(`[Fundamentals] ${ticker} → EPS:${payload.eps} PE:${payload.pe} BV:${payload.bookValue} partial:${payload.partial}`);
    return res.json(payload);

  } catch (err: any) {
    console.error(`[Fundamentals] ❌ ${ticker}:`, err.message);
    return res.status(502).json({
      error: "Could not fetch fundamentals from Yahoo Finance",
      ticker,
    });
  }
});

export default router;
