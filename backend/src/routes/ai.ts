// backend/src/routes/ai.ts
// Anthropic AI analysis proxy — MainApp.js calls POST /api/v1/ai/analyse
// Keeps ANTHROPIC_API_KEY server-side (never exposed to browser)

import { Router, Request, Response } from "express";
import { cache } from "../services/cacheService";

const router = Router();

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-sonnet-4-20250514";

// ── POST /api/v1/ai/analyse ───────────────────────────────────────────────────
router.post("/analyse", async (req: Request, res: Response) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI analysis not configured — ANTHROPIC_API_KEY missing" });
  }

  const { ticker, systemPrompt, userMessage } = req.body;

  // Basic validation
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }
  if (userMessage.length > 8000) {
    return res.status(400).json({ error: "userMessage too long (max 8000 chars)" });
  }

  // Cache key based on ticker (AI analysis valid for 30min — market data changes)
  const cacheKey = ticker ? `ai:analyse:${ticker.toUpperCase()}` : null;
  if (cacheKey) {
    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      console.log(`[AI] ✅ ${ticker} from cache`);
      return res.json(cached);
    }
  }

  try {
    const body: any = {
      model:      MODEL,
      max_tokens: 1500,
      messages:   [{ role: "user", content: userMessage }],
    };
    if (systemPrompt && typeof systemPrompt === "string") {
      body.system = systemPrompt;
    }

    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000), // 30s timeout for AI
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI] Anthropic API error ${response.status}:`, errText);
      return res.status(502).json({ error: "AI service unavailable", status: response.status });
    }

    const data: any = await response.json();
    const text = data.content?.[0]?.text || "";

    const result = { text, model: MODEL, ticker: ticker?.toUpperCase() || null };

    // Cache successful responses
    if (cacheKey && text) await cache.set(cacheKey, result, 1800); // 30min

    console.log(`[AI] ✅ ${ticker || "unknown"} analysis complete`);
    return res.json(result);

  } catch (err: any) {
    console.error("[AI] ❌ Error:", err.message);
    return res.status(502).json({ error: "AI analysis failed", message: err.message });
  }
});

export default router;
