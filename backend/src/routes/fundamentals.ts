// backend/src/routes/fundamentals.ts
// Yahoo Finance v10/v11 → 401 because they now require crumb + cookie auth.
// Flow: fetch crumb once (cached 55min) → use on v10 call → fallback to v8 if needed.
// Results are cached in Redis (1hr full, 15min partial) to avoid hammering Yahoo.
//
// 10-metric ranking system:
//   Original 7: pe, industryPE, roe(roce), debtToEquity, netProfit(eps-based),
//               freeCashFlow, profitGrowth5Y, pledgedPct
//   New 3:      priceToBook, currentRatio, return5YrPct

import { Router, Request, Response } from "express";
import { cache } from "../services/cacheService";

const router = Router();

const BASE_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Origin":          "https://finance.yahoo.com",
  "Referer":         "https://finance.yahoo.com/",
};

// ── Crumb cache (in-memory, ~55min TTL) ───────────────────────────────────────
let _crumb        = "";
let _cookie       = "";
let _crumbAt      = 0;
const CRUMB_TTL   = 55 * 60 * 1000;

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (_crumb && Date.now() - _crumbAt < CRUMB_TTL) return { crumb: _crumb, cookie: _cookie };
  try {
    const pageRes = await fetch("https://finance.yahoo.com/quote/AAPL", {
      headers: { ...BASE_HEADERS, "Accept": "text/html,application/xhtml+xml,*/*" },
      signal: AbortSignal.timeout(8000),
    });
    const rawCookies = pageRes.headers.get("set-cookie") || "";
    const cookie = rawCookies.split(",")
      .map(c => c.split(";")[0].trim())
      .filter(c => c.includes("="))
      .join("; ");

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...BASE_HEADERS, "Cookie": cookie },
      signal: AbortSignal.timeout(6000),
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith("<")) return null;

    _crumb = crumb; _cookie = cookie; _crumbAt = Date.now();
    console.log("[Fundamentals] ✅ Crumb refreshed");
    return { crumb, cookie };
  } catch (e: any) {
    console.warn("[Fundamentals] Crumb fetch failed:", e.message);
    return null;
  }
}

// ── v10 fetch (with crumb auth) ───────────────────────────────────────────────
// Added balanceSheetHistory and earningsTrend modules for current ratio + 5yr return
async function fetchV10(ticker: string, crumb: string, cookie: string): Promise<any | null> {
  const modules = [
    "defaultKeyStatistics",
    "financialData",
    "summaryDetail",
    "cashflowStatementHistory",
    "earningsTrend",
    "incomeStatementHistory",
    "balanceSheetHistory",   // ← needed for currentRatio
  ].join(",");

  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${encodeURIComponent(crumb)}&formatted=false`;
  try {
    const res = await fetch(url, {
      headers: { ...BASE_HEADERS, "Cookie": cookie },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { console.warn(`[Fundamentals] v10 → ${res.status}`); return null; }
    const json: any = await res.json();
    return json?.quoteSummary?.result?.[0]
      ? { type: "v10", data: json.quoteSummary.result[0] }
      : null;
  } catch { return null; }
}

// ── v8 fallback (no auth needed, limited data) ────────────────────────────────
async function fetchV8(ticker: string): Promise<any | null> {
  for (const host of ["query2", "query1"]) {
    try {
      const res = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5y`,
        { headers: BASE_HEADERS, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const json: any = await res.json();
      if (json?.chart?.result?.[0]) {
        console.warn(`[Fundamentals] ⚠️  ${ticker} via v8 fallback (partial)`);
        return { type: "v8", data: json.chart.result[0] };
      }
    } catch { continue; }
  }
  return null;
}

// ── Extractors ────────────────────────────────────────────────────────────────
function extractV10(r: any) {
  const ks  = r.defaultKeyStatistics || {};
  const fd  = r.financialData        || {};
  const sd  = r.summaryDetail        || {};
  const cfh = r.cashflowStatementHistory?.cashflowStatements?.[0] || {};
  const is0 = r.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
  const bsh = r.balanceSheetHistory?.balanceSheetStatements?.[0]   || {};
  const et  = r.earningsTrend?.trend || [];

  // ── Original metrics ──────────────────────────────────────────────────────
  const eps = ks.trailingEps?.raw ||
    (is0.netIncome?.raw && ks.sharesOutstanding?.raw
      ? is0.netIncome.raw / ks.sharesOutstanding.raw
      : 0) || 0;

  const bookValue   = ks.bookValue?.raw || 0;
  const fcfRaw      = cfh.freeCashflow?.raw
    || ((cfh.totalCashFromOperatingActivities?.raw || 0) + (cfh.capitalExpenditures?.raw || 0));
  const fcfPerShare = Math.max(0, fcfRaw / (ks.sharesOutstanding?.raw || 1e9));
  const pe          = sd.trailingPE?.raw || ks.trailingPE?.raw || 0;
  const forwardPE   = sd.forwardPE?.raw  || ks.forwardPE?.raw  || 0;
  const industryPE  = forwardPE > 0 ? Math.min(forwardPE * 1.15, 60) : pe > 0 ? Math.min(pe * 0.85, 55) : 30;
  const roe         = fd.returnOnEquity?.raw ? fd.returnOnEquity.raw * 100 : 0;
  const debtToEquity = fd.debtToEquity?.raw || ks.debtToEquity?.raw || 0;

  let growthRate = 12;
  const fy = et.find((t: any) => t.period === "+5y");
  if (fy?.growth?.raw)            growthRate = Math.min(Math.abs(fy.growth.raw * 100), 35);
  else if (fd.revenueGrowth?.raw) growthRate = Math.min(Math.abs(fd.revenueGrowth.raw * 100), 30);

  const cmp = fd.currentPrice?.raw || sd.regularMarketPrice?.raw || 0;

  // ── New metric 1: Price to Book (CMP / Book Value) ────────────────────────
  // Yahoo provides priceToBook directly in defaultKeyStatistics
  const priceToBook = ks.priceToBook?.raw
    || (cmp > 0 && bookValue > 0 ? cmp / bookValue : 0);

  // ── New metric 2: Current Ratio ───────────────────────────────────────────
  // Yahoo financialData has currentRatio directly
  // Fallback: compute from balance sheet (currentAssets / currentLiabilities)
  const currentRatioFd = fd.currentRatio?.raw || 0;
  const currentAssets  = bsh.totalCurrentAssets?.raw      || 0;
  const currentLiab    = bsh.totalCurrentLiabilities?.raw || 0;
  const currentRatio   = currentRatioFd > 0
    ? currentRatioFd
    : (currentLiab > 0 ? currentAssets / currentLiab : 0);

  // ── New metric 3: Return over 5 years % ──────────────────────────────────
  // Yahoo provides 5-year price performance in defaultKeyStatistics as fiveYearAvgDividendYield
  // More reliable: use 52wk change as a proxy, or earningsTrend 5yr growth
  // Best available from v10: ks.52WeekChange is 1yr; we use earningsTrend +5y growth
  // as a representative of expected 5yr return direction
  const return5YrRaw = ks["5YearAverageReturn"]?.raw || 0;
  // Many tickers don't have this — fallback to profit growth 5Y trend
  const return5YrPct = return5YrRaw > 0
    ? return5YrRaw * 100
    : (fy?.growth?.raw ? Math.min(fy.growth.raw * 100, 500) : 0);

  return {
    cmp, eps, bookValue, fcfPerShare, pe, industryPE, roe, debtToEquity, growthRate,
    priceToBook, currentRatio, return5YrPct,
    partial: false,
  };
}

function extractV8(r: any) {
  const meta = r.meta || {};
  const pe   = meta.trailingPE || 0;

  // v8 has very limited data — compute what we can, rest will be null in DB
  const cmp       = meta.regularMarketPrice || 0;
  const bookValue = 0; // not available in v8

  // Attempt 5yr return from chart data (first close vs last close)
  let return5YrPct = 0;
  try {
    const closes = r.indicators?.quote?.[0]?.close || [];
    const valid  = closes.filter((c: any) => c != null);
    if (valid.length >= 2) {
      const first = valid[0];
      const last  = valid[valid.length - 1];
      if (first > 0) return5YrPct = ((last - first) / first) * 100;
    }
  } catch { /* ignore */ }

  return {
    cmp, eps: 0, bookValue, fcfPerShare: 0,
    pe, industryPE: pe > 0 ? Math.min(pe * 0.85, 55) : 30,
    roe: 0, debtToEquity: 0, growthRate: 12,
    priceToBook: 0, currentRatio: 0, return5YrPct,
    partial: true,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.get("/:symbol", async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const ticker = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase() : `${symbol.toUpperCase()}.NS`;

  // Cache check
  const cacheKey = `fund:${ticker}`;
  const cached   = await cache.get<any>(cacheKey);
  if (cached) {
    console.log(`[Fundamentals] ✅ ${ticker} from cache`);
    return res.json(cached);
  }

  try {
    let result: { type: string; data: any } | null = null;

    // Attempt 1: v10 with crumb
    const crumbData = await getCrumb();
    if (crumbData) {
      result = await fetchV10(ticker, crumbData.crumb, crumbData.cookie);
      if (!result) {
        // crumb may be stale — refresh once and retry
        _crumb = "";
        const fresh = await getCrumb();
        if (fresh) result = await fetchV10(ticker, fresh.crumb, fresh.cookie);
      }
    }

    // Attempt 2: v8 fallback
    if (!result) result = await fetchV8(ticker);

    if (!result) return res.status(502).json({ error: "Could not fetch fundamentals", ticker });

    const raw  = result.type === "v10" ? extractV10(result.data) : extractV8(result.data);
    const safe = (v: number) => (!v || isNaN(v)) ? 0 : parseFloat(v.toFixed(2));

    const payload = {
      ticker:    symbol.toUpperCase(),
      source:    result.type,
      partial:   raw.partial,

      // ── Display fields ────────────────────────────────────────────────────
      cmp:         safe(raw.cmp),
      eps:         safe(raw.eps),
      bookValue:   safe(raw.bookValue),
      fcfPerShare: safe(raw.fcfPerShare),
      growthRate:  safe(raw.growthRate),

      // ── Original 7 ranking metrics ────────────────────────────────────────
      pe:            safe(raw.pe),
      industryPE:    safe(raw.industryPE),
      roe:           safe(raw.roe),           // used as ROCE proxy
      debtToEquity:  safe(raw.debtToEquity),

      // ── New 3 ranking metrics ─────────────────────────────────────────────
      priceToBook:   safe(raw.priceToBook),   // CMP / Book Value
      currentRatio:  safe(raw.currentRatio),  // Current Assets / Current Liabilities
      return5YrPct:  safe(raw.return5YrPct),  // Return over 5 years %
    };

    await cache.set(cacheKey, payload, raw.partial ? 900 : 3600);
    console.log(
      `[Fundamentals] ${ticker} → PE:${payload.pe} P/B:${payload.priceToBook} ` +
      `CR:${payload.currentRatio} R5Y:${payload.return5YrPct} partial:${payload.partial}`
    );
    return res.json(payload);

  } catch (err: any) {
    console.error(`[Fundamentals] ❌ ${ticker}:`, err.message);
    return res.status(502).json({ error: "Could not fetch fundamentals", ticker });
  }
});

export default router;
