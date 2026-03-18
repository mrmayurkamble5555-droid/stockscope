import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// ─── NSE HTTP client ──────────────────────────────────────────────────────────
// NSE blocks requests without browser-like headers.
const nseClient = axios.create({
  baseURL: 'https://www.nseindia.com/api',
  timeout: 10000,
  headers: {
    'User-Agent':      process.env.NSE_USER_AGENT!,
    'Referer':         process.env.NSE_REFERER!,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection':      'keep-alive',
  },
});

// ─── Rate-limit delay (max 1 req/sec + jitter) ────────────────────────────────
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const rateLimitDelay = () => delay(1000 + Math.random() * 500);

// ─── Retry with exponential backoff ──────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 5000): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const wait = baseMs * attempt;
      console.warn(`NSE attempt ${attempt} failed. Retrying in ${wait}ms...`);
      await delay(wait);
    }
  }
  throw new Error('All retries exhausted');
}

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface NseQuote {
  ticker:       string;
  name:         string;
  sector:       string;
  industry:     string;
  cmp:          number;
  open:         number;
  high:         number;
  low:          number;
  close:        number;
  previousClose:number;
  change:       number;
  changePct:    number;
  marketCap:    number | null;
  peRatio:      number | null;
  industryPe:   number | null;
  pledgedPct:   number | null;
}

export interface NseOhlc {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ─── Fetch quote (fundamentals + CMP) ────────────────────────────────────────
export async function fetchNseQuote(ticker: string): Promise<NseQuote> {
  await rateLimitDelay();
  return withRetry(async () => {
    const res = await nseClient.get(`/quote-equity?symbol=${encodeURIComponent(ticker)}`);
    const d   = res.data;
    const info = d.info        || {};
    const pd   = d.priceInfo   || {};
    const meta = d.metadata    || {};

    return {
      ticker:        ticker,
      name:          info.companyName  || meta.companyName || ticker,
      sector:        info.sector       || '',
      industry:      info.industry     || '',
      cmp:           pd.lastPrice      || 0,
      open:          pd.open           || 0,
      high:          pd.intraDayHighLow?.max || 0,
      low:           pd.intraDayHighLow?.min || 0,
      close:         pd.previousClose  || 0,
      previousClose: pd.previousClose  || 0,
      change:        pd.change         || 0,
      changePct:     pd.pChange        || 0,
      marketCap:     meta.marketCap    || null,
      peRatio:       pd.pe             || null,
      industryPe:    pd.industryPE     || null,
      pledgedPct:    null,  // Fetched separately from shareholding endpoint
    };
  });
}

// ─── Fetch OHLC history ───────────────────────────────────────────────────────
export async function fetchNseOhlc(ticker: string, days = 365): Promise<NseOhlc[]> {
  await rateLimitDelay();
  const toDate   = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  return withRetry(async () => {
    const url =
      `/historical/securityArchives` +
      `?from=${fmt(fromDate)}&to=${fmt(toDate)}` +
      `&symbol=${encodeURIComponent(ticker)}&dataType=priceVolumeDeliverable&series=EQ`;

    const res  = await nseClient.get(url);
    const rows = res.data?.data || [];

    return rows.map((r: any): NseOhlc => ({
      date:   r.CH_TIMESTAMP || r.mTIMESTAMP || '',
      open:   parseFloat(r.CH_OPENING_PRICE)  || 0,
      high:   parseFloat(r.CH_TRADE_HIGH_PRICE) || 0,
      low:    parseFloat(r.CH_TRADE_LOW_PRICE)  || 0,
      close:  parseFloat(r.CH_CLOSING_PRICE)   || 0,
      volume: parseInt(r.CH_TOT_TRADED_QTY)    || 0,
    })).filter((r: NseOhlc) => r.close > 0);
  });
}

// ─── Fetch all NSE equity tickers (for seeding) ───────────────────────────────
export async function fetchAllNseTickers(): Promise<{ ticker: string; name: string; sector: string }[]> {
  await rateLimitDelay();
  return withRetry(async () => {
    const res = await nseClient.get('/equity-stockIndices?index=SECURITIES%20IN%20F%26O');
    const data = res.data?.data || [];
    return data.map((d: any) => ({
      ticker: d.symbol,
      name:   d.meta?.companyName || d.symbol,
      sector: d.meta?.industry    || '',
    }));
  });
}
