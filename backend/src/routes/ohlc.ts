// src/routes/ohlc.ts
// Proxies Yahoo Finance — uses built-in fetch (Node 18+), no node-fetch needed

import { Router, Request, Response } from "express";

const router = Router();

router.get("/:symbol", async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const ticker = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=15d`;

  try {
    const yRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
      },
    });

    if (!yRes.ok) {
      return res.status(502).json({ error: `Yahoo Finance returned ${yRes.status}` });
    }

    const json: any = await yRes.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: "No data found for symbol" });
    }

    const q = result.indicators.quote[0];
    const timestamps: number[] = result.timestamp;

    const candles = timestamps
      .map((t: number, i: number) => ({
        date: new Date(t * 1000).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
        open:  parseFloat(q.open[i]?.toFixed(2)),
        high:  parseFloat(q.high[i]?.toFixed(2)),
        low:   parseFloat(q.low[i]?.toFixed(2)),
        close: parseFloat(q.close[i]?.toFixed(2)),
      }))
      .filter((c) => c.open && c.high && c.low && c.close)
      .slice(-12);

    const prev = candles[candles.length - 2];
    const p = (prev.high + prev.low + prev.close) / 3;
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
    console.error(`[OHLC] Error fetching ${ticker}:`, err.message);
    return res.status(500).json({ error: "Failed to fetch OHLC data" });
  }
});

export default router;
