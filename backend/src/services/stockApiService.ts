// backend/src/services/stockApiService.ts
// FIXED: Removed module-level throw statements.
// The old code threw Error() at import time — BEFORE dotenv.config() ran in server.ts
// because TypeScript imports are hoisted. This caused the "Missing env vars" crash
// even when .env had the correct values.
// Now: env vars are read lazily inside each function, only throwing when actually called.

import axios from "axios";

function getClient() {
  const baseURL = process.env.INDIAN_API_BASE_URL;
  const apiKey  = process.env.INDIAN_API_KEY;

  // Only throw when actually used, not at import time
  if (!baseURL || !apiKey || apiKey === "PUT_YOUR_ACTUAL_KEY_HERE") {
    throw new Error("IndianAPI not configured — set INDIAN_API_BASE_URL and INDIAN_API_KEY in .env");
  }

  return axios.create({
    baseURL,
    timeout: 10000,
    headers: { "X-API-Key": apiKey },
  });
}

export async function searchStocksExternal(query: string) {
  if (!query?.trim()) return [];
  try {
    const res = await getClient().get("/stock", { params: { name: query.trim() } });
    return res.data;
  } catch (err: any) {
    console.error("IndianAPI search error:", err?.response?.status, err?.message);
    throw new Error("Failed to search stocks from IndianAPI");
  }
}

export async function getStockExternal(symbol: string) {
  if (!symbol?.trim()) throw new Error("Symbol is required");
  try {
    const res = await getClient().get("/stock", { params: { symbol: symbol.trim() } });
    return res.data;
  } catch (err: any) {
    console.error("IndianAPI stock error:", err?.response?.status, err?.message);
    throw new Error("Failed to fetch stock from IndianAPI");
  }
}
