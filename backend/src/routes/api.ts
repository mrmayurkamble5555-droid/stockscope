import { Router } from "express";
import axios from "axios";

const router = Router();

// ---------- CONFIG ----------
// Base URL of your free Indian stock API.
// For now we keep it in an env variable so you can change later.
const INDIAN_API_BASE =
  process.env.INDIAN_API_BASE || "https://your-indian-api.example.com";

// ---------- TEST ROUTE (kept for fallback / demo) ----------
router.get("/api/v1/test/stock/:symbol", (req, res) => {
  const { symbol } = req.params;

  res.json({
    header: {
      ticker: symbol,
      name: "Test Company",
      exchange: "NSE",
      sector: "FMCG",
      industry: "Personal Care",
    },
    cmp: 2500,
    technicals: {
      pivot: 2480,
      r1: 2520,
      r2: 2550,
      s1: 2450,
      s2: 2420,
      ema20: 2490,
      ema50: 2450,
      ema100: 2400,
    },
  });
});

// ---------- REAL PROXY ROUTES USING FREE API ----------

// Search companies
// GET /api/v1/search?q=ITC
router.get("/api/v1/search", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    if (!q) {
      return res.status(400).json({ error: "Missing query parameter q" });
    }

    const apiResp = await axios.get(`${INDIAN_API_BASE}/search`, {
      params: { q },
      timeout: 5000,
    });

    res.json(apiResp.data);
  } catch (err: any) {
    console.error("Search proxy error", err?.message);
    res.status(502).json({ error: "Upstream search failed" });
  }
});

// Single stock details
// GET /api/v1/stock/ITC
router.get("/api/v1/stock/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;

    const apiResp = await axios.get(`${INDIAN_API_BASE}/stock`, {
      params: { symbol },
      timeout: 5000,
    });

    res.json(apiResp.data);
  } catch (err: any) {
    console.error("Stock proxy error", err?.message);
    res.status(502).json({ error: "Upstream stock fetch failed" });
  }
});

export default router;
