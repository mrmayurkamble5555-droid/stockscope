import axios from 'axios';

const screenerClient = axios.create({
  baseURL: 'https://www.screener.in',
  timeout: 12000,
  headers: {
    'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept':           'application/json',
  },
});

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface ScreenerPeer {
  ticker:         string;
  name:           string;
  // Original 7 ranking metrics
  pe:             number | null;
  roce:           number | null;
  debtToEquity:   number | null;
  netProfit:      number | null;
  freeCashFlow:   number | null;
  profitGrowth5Y: number | null;
  pledgedPct:     number | null;
  // New 3 ranking metrics (migration 006)
  priceToBook:    number | null;
  currentRatio:   number | null;
  return5YrPct:   number | null;
}

// ─── Get company ID from Screener ────────────────────────────────────────────
export async function getScreenerId(ticker: string): Promise<number | null> {
  await delay(1000 + Math.random() * 500);
  try {
    const res = await screenerClient.get(`/api/company/search/?q=${ticker}`);
    const results = res.data?.results || res.data || [];
    const match = results.find((r: any) =>
      r.symbol?.toUpperCase() === ticker.toUpperCase() ||
      r.ticker?.toUpperCase() === ticker.toUpperCase()
    );
    return match?.id || null;
  } catch (err) {
    console.error(`Screener ID fetch failed for ${ticker}:`, err);
    return null;
  }
}

// ─── Get peer comparison data ─────────────────────────────────────────────────
export async function fetchScreenerPeers(ticker: string): Promise<ScreenerPeer[]> {
  await delay(1000 + Math.random() * 500);
  try {
    const id = await getScreenerId(ticker);
    if (!id) return [];

    const res = await screenerClient.get(`/api/company/${id}/peers/`);
    const peers = res.data?.peers || res.data || [];

    return peers.map((p: any): ScreenerPeer => ({
      ticker:         p.symbol            || p.ticker || '',
      name:           p.name              || '',
      // Original 7
      pe:             parseNum(p.pe)                || null,
      roce:           parseNum(p.roce)              || null,
      debtToEquity:   parseNum(p.debt_to_equity)    || null,
      netProfit:      parseNum(p.net_profit)        || null,
      freeCashFlow:   parseNum(p.free_cashflow)     || null,
      profitGrowth5Y: parseNum(p.profit_growth_5y)  || null,
      pledgedPct:     parseNum(p.pledged_pct)       || null,
      // New 3 — Screener.in peer table column names observed via browser dev tools:
      //   CMP / BV        → p.price_to_book  or  p.cmp_to_bv
      //   Current ratio   → p.current_ratio
      //   5Yrs return %   → p.return_5yr     or  p.five_year_return
      priceToBook:    parseNum(p.price_to_book ?? p.cmp_to_bv)     || null,
      currentRatio:   parseNum(p.current_ratio)                    || null,
      return5YrPct:   parseNum(p.return_5yr    ?? p.five_year_return) || null,
    })).filter((p: ScreenerPeer) => p.ticker);
  } catch (err) {
    console.error(`Screener peers fetch failed for ${ticker}:`, err);
    return [];
  }
}

// ─── Get fundamental ratios for a single stock ────────────────────────────────
export async function fetchScreenerRatios(ticker: string): Promise<Partial<ScreenerPeer>> {
  await delay(1000 + Math.random() * 500);
  try {
    const id = await getScreenerId(ticker);
    if (!id) return {};

    const res = await screenerClient.get(`/api/company/${id}/`);
    const d   = res.data || {};

    return {
      ticker,
      // Original 7
      pe:             parseNum(d.pe)              || null,
      roce:           parseNum(d.roce)            || null,
      debtToEquity:   parseNum(d.debt_to_equity)  || null,
      netProfit:      parseNum(d.net_profit)      || null,
      freeCashFlow:   parseNum(d.free_cashflow)   || null,
      profitGrowth5Y: parseNum(d.profit_growth_5y)|| null,
      pledgedPct:     parseNum(d.pledged_pct)     || null,
      // New 3 — Screener.in single company API response field names:
      //   CMP / BV        → d.price_to_book  or  d.cmp_to_bv
      //   Current ratio   → d.current_ratio
      //   5Yrs return %   → d.return_5yr     or  d.five_year_return
      priceToBook:    parseNum(d.price_to_book ?? d.cmp_to_bv)     || null,
      currentRatio:   parseNum(d.current_ratio)                    || null,
      return5YrPct:   parseNum(d.return_5yr    ?? d.five_year_return) || null,
    };
  } catch (err) {
    console.error(`Screener ratios fetch failed for ${ticker}:`, err);
    return {};
  }
}

function parseNum(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
