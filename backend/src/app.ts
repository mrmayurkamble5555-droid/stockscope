// backend/src/app.ts
// Express app — security middleware + all routes
// IMPORTANT: No app.listen() here — server.ts handles that exclusively

import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";

// ── Route imports ─────────────────────────────────────────────────────────────
import apiRoutes          from "./routes/api";           // search, stock, pricerange
import screenerRoutes     from "./routes/screener";      // live NSE screener
import trendingRoutes     from "./routes/trending";
import ohlcRouter         from "./routes/ohlc";          // ✅ Yahoo Finance OHLC proxy
import fundamentalsRouter from "./routes/fundamentals";  // ✅ Yahoo Finance fundamentals proxy

const app = express();

// ── 1. Helmet ─────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

// ── 2. CORS ───────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "https://stockscope.in",
  "https://www.stockscope.in",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
}));

// ── 3. Rate limiters ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});

export const dataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Data request limit reached. Please wait a moment." },
});

app.use(globalLimiter);

// ── 4. Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// ── 5. Security headers ───────────────────────────────────────────────────────
app.disable("x-powered-by");
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ── 6. Health check ───────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── 7. Market Mood proxy ──────────────────────────────────────────────────────
const YF_MOOD_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
};

app.get("/api/v1/mood", dataLimiter, async (_req: Request, res: Response) => {
  let change: number | null = null;
  let source = "";

  const urls = [
    "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=5d",
    "https://query2.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=5d",
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: YF_MOOD_HEADERS,
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const j: any = await r.json();

      const meta = j?.chart?.result?.[0]?.meta;
      if (meta) {
        const curr = meta.regularMarketPrice || 0;
        const prev = meta.chartPreviousClose || meta.previousClose || curr;
        if (prev > 0 && curr > 0) {
          change = ((curr - prev) / prev) * 100;
          source = url.includes("query1") ? "yf-q1" : "yf-q2";
          break;
        }
      }

      const closes: number[] = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const valid = closes.filter((c: number) => c != null && c > 0);
      if (valid.length >= 2) {
        const prev = valid[valid.length - 2];
        const curr = valid[valid.length - 1];
        change = ((curr - prev) / prev) * 100;
        source = "yf-closes";
        break;
      }
    } catch {
      continue;
    }
  }

  const chgNum  = change ?? 0;
  const moodVal = Math.min(95, Math.max(5, 50 + chgNum * 10));

  return res.json({
    change:  parseFloat(chgNum.toFixed(2)),
    value:   parseFloat(moodVal.toFixed(1)),
    hasData: change !== null,
    source,
    ts: new Date().toISOString(),
  });
});

// ── 8. Specific routes — registered BEFORE apiRoutes to avoid 404 swallowing ──
// Order matters: Express matches routes in registration order.
// apiRoutes (mounted at /api/v1) has its own 404 at the bottom of api.ts
// which would catch /ohlc, /fundamentals, /screener if registered after.

// ✅ OHLC — Yahoo Finance proxy (used by PivotChart)
app.use("/api/v1/ohlc",         dataLimiter, ohlcRouter);

// ✅ Fundamentals — Yahoo Finance proxy (used by FairValuePanel)
app.use("/api/v1/fundamentals", dataLimiter, fundamentalsRouter);

// ✅ Screener — live NSE index data (replaces DB screener in api.ts)
app.use("/api/v1/screener",     dataLimiter, screenerRoutes);

// ✅ Trending
app.use("/api/v1/trending",     dataLimiter, trendingRoutes);

// ── 9. General API routes (search, stock/:ticker, pricerange) ─────────────────
app.use("/api/v1", dataLimiter, apiRoutes);

// ── 10. 404 handler ───────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ── 11. Global error handler ──────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status  = err.status || 500;
  const message = status < 500 ? err.message : "Internal server error";
  console.error(`[Error] ${status}:`, err.message);
  res.status(status).json({ error: message });
});

export default app;
