// src/routes/ohlc.ts
// Proxies Yahoo Finance OHLC data for PivotChart
// Uses full browser headers + fallback chain to avoid blocks

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

async function fetchOHLC(ticker: string): Promise<any> {
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=30d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=30d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=15d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=15d`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: YF_HEADERS,
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[OHLC] ${url.includes("query2") ? "query2" : "query1"} → ${res.status}`);
        continue;
      }

      const json: any = await res.json();
      const result = json?.chart?.result?.[0];
      if (result?.timestamp?.length > 0) {
        console.log(`[OHLC] ✅ ${ticker} via ${url.includes("query2") ? "query2" : "query1"}`);
        return result;
      }
    } catch (e: any) {
      console.warn(`[OHLC] fetch error: ${e.message}`);
    }
  }
  throw new Error("All Yahoo Finance OHLC endpoints failed");
}

router.get("/:symbol", async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const ticker = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;

  try {
    const result = await fetchOHLC(ticker);
    const q          = result.indicators.quote[0];
    const timestamps: number[] = result.timestamp;

    const candles = timestamps
      .map((t: number, i: number) => ({
        date:  new Date(t * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        open:  parseFloat((q.open[i]  ?? 0).toFixed(2)),
        high:  parseFloat((q.high[i]  ?? 0).toFixed(2)),
        low:   parseFloat((q.low[i]   ?? 0).toFixed(2)),
        close: parseFloat((q.close[i] ?? 0).toFixed(2)),
      }))
      .filter(c => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
      .slice(-15);

    if (candles.length < 3) {
      return res.status(404).json({ error: "Not enough OHLC data for " + symbol });
    }

    // Pivot levels from previous session
    const prev = candles[candles.length - 2];
    const p    = (prev.high + prev.low + prev.close) / 3;
    const levels = {
      pivot: +p.toFixed(2),
      r1:    +(2 * p - prev.low).toFixed(2),
      r2:    +(p + (prev.high - prev.low)).toFixed(2),
      s1:    +(2 * p - prev.high).toFixed(2),
      s2:    +(p - (prev.high - prev.low)).toFixed(2),
    };

    const cmp = candles[candles.length - 1].close;

    return res.json({ symbol: symbol.toUpperCase(), cmp, candles, levels });

  } catch (err: any) {
    console.error(`[OHLC] ❌ ${ticker}:`, err.message);
    return res.status(502).json({ error: "Failed to fetch OHLC data", symbol });
  }
});

export default router;
