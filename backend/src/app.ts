// backend/src/app.ts
// Express app — security middleware + all routes
// IMPORTANT: No app.listen() here — server.ts is the ONLY entry point

import express, { Request, Response, NextFunction } from "express";
import helmet    from "helmet";
import rateLimit from "express-rate-limit";
import cors      from "cors";

// ── Route imports ─────────────────────────────────────────────────────────────
import apiRoutes          from "./routes/api";
import screenerRoutes     from "./routes/screener";
import trendingRoutes     from "./routes/trending";
import ohlcRouter         from "./routes/ohlc";
import fundamentalsRouter from "./routes/fundamentals";
import aiRouter           from "./routes/ai";

const app = express();

// ── 1. Helmet security headers ────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "https://s3.tradingview.com"],
      frameSrc:   ["'self'", "https://www.tradingview.com"],
      connectSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
      objectSrc:  ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// ── 2. CORS — frontend origins only ──────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3002",
  "https://stockscope.in",
  "https://www.stockscope.in",
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
}));

// ── 3. Rate limiters ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1",
});
export const dataLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Data request limit reached. Please wait." },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10, // AI calls are expensive
  standardHeaders: true, legacyHeaders: false,
  message: { error: "AI request limit reached. Please wait 1 minute." },
});
app.use(globalLimiter);

// ── 4. Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// ── 5. Extra security headers ─────────────────────────────────────────────────
app.disable("x-powered-by");
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options",        "DENY");
  res.setHeader("Referrer-Policy",        "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy",     "camera=(), microphone=(), geolocation=()");
  next();
});

// ── 6. Query param sanitisation ───────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.query.q && typeof req.query.q === "string") {
    req.query.q = req.query.q.trim().slice(0, 50);
  }
  next();
});

// ── 7. Health check ───────────────────────────────────────────────────────────
import { testDbConnection } from "./db/connection";
import { cache }            from "./services/cacheService";

app.get("/health", async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    testDbConnection().catch(() => false),
    cache.ping().catch(()          => false),
  ]);
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    db:     dbOk    ? "connected" : "disconnected",
    redis:  redisOk ? "connected" : "disconnected",
    ts:     new Date().toISOString(),
    env:    process.env.NODE_ENV || "development",
  });
});

// ── 8. Market Mood ────────────────────────────────────────────────────────────
const YF_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://finance.yahoo.com/",
  "Origin":          "https://finance.yahoo.com",
};
app.get("/api/v1/mood", dataLimiter, async (_req: Request, res: Response) => {
  let change: number | null = null, source = "";
  for (const url of [
    "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=5d",
    "https://query2.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=5d",
  ]) {
    try {
      const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const j: any = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (meta) {
        const curr = meta.regularMarketPrice || 0;
        const prev = meta.chartPreviousClose || meta.previousClose || curr;
        if (prev > 0 && curr > 0) { change = ((curr - prev) / prev) * 100; source = "yf"; break; }
      }
    } catch { continue; }
  }
  const chg = change ?? 0;
  return res.json({
    change: parseFloat(chg.toFixed(2)),
    value:  parseFloat(Math.min(95, Math.max(5, 50 + chg * 10)).toFixed(1)),
    hasData: change !== null, source, ts: new Date().toISOString(),
  });
});

// ── 9. Routes — specific first, general last ─────────────────────────────────
app.use("/api/v1/ohlc",         dataLimiter, ohlcRouter);
app.use("/api/v1/fundamentals", dataLimiter, fundamentalsRouter);
app.use("/api/v1/screener",     dataLimiter, screenerRoutes);
app.use("/api/v1/trending",     dataLimiter, trendingRoutes);
app.use("/api/v1/ai",           aiLimiter,   aiRouter);        // ← NEW: AI route
app.use("/api/v1",              dataLimiter, apiRoutes);

// ── 10. 404 ───────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ── 11. Global error handler ──────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status  = err.status || 500;
  const message = process.env.NODE_ENV === "production" && status >= 500
    ? "Internal server error" : err.message;
  if (status >= 500) console.error(`[Error] ${status}:`, err.message);
  res.status(status).json({ error: message });
});

export default app;
