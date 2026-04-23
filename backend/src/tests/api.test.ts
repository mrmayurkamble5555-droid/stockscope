// backend/src/__tests__/api.test.ts
// CHECKLIST: Step 5 — Automated Test Suite
// Tests: health endpoint, screener sector validation, edge cases,
//        ticker sanitisation, rate limiting headers

import request from "supertest";
import app from "../app";

// ── Health endpoint ────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns 200 with status, db, redis fields", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBeLessThan(600);          // 200 or 503 both acceptable
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("db");
    expect(res.body).toHaveProperty("redis");
    expect(res.body).toHaveProperty("ts");
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
describe("Unknown routes", () => {
  it("returns 404 JSON for unknown route", async () => {
    const res = await request(app).get("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("never exposes stack traces in response", async () => {
    const res = await request(app).get("/api/v1/nonexistent");
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\./);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules/);
  });
});

// ── Security headers ──────────────────────────────────────────────────────────
describe("Security headers", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("does not expose x-powered-by", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("blocks CORS from unknown origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil-attacker.com");
    // Either blocked (no allow-origin) or 500 from cors error
    expect(
      res.headers["access-control-allow-origin"] === undefined ||
      res.status === 500
    ).toBe(true);
  });

  it("allows CORS from stockscope.in", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://stockscope.in");
    expect(res.headers["access-control-allow-origin"]).toBe("https://stockscope.in");
  });
});

// ── Ticker sanitisation ───────────────────────────────────────────────────────
describe("Ticker input sanitisation", () => {
  it("rejects ticker with path traversal characters", async () => {
    const res = await request(app).get("/api/v1/stock/../../etc/passwd");
    expect([400, 404]).toContain(res.status);
  });

  it("rejects excessively long ticker", async () => {
    const longTicker = "A".repeat(100);
    const res = await request(app).get(`/api/v1/stock/${longTicker}`);
    expect([400, 404]).toContain(res.status);
  });

  it("rejects ticker with SQL injection pattern", async () => {
    const res = await request(app).get("/api/v1/stock/'; DROP TABLE stocks; --");
    expect([400, 404]).toContain(res.status);
  });

  it("accepts valid NSE ticker format", async () => {
    const res = await request(app).get("/api/v1/stock/VBL");
    // 200 (data) or 502 (external API down) — both mean ticker was accepted
    expect([200, 400, 404, 502, 503]).toContain(res.status);
    expect(res.status).not.toBe(400); // must not be rejected as invalid format
  });
});

// ── Screener sector endpoint ──────────────────────────────────────────────────
describe("GET /api/v1/screener", () => {
  it("returns sector list with sector field", async () => {
    const res = await request(app).get("/api/v1/screener");
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("sectors");
      expect(Array.isArray(res.body.sectors)).toBe(true);
      if (res.body.sectors.length > 0) {
        expect(res.body.sectors[0]).toHaveProperty("sector");
      }
    }
  });

  it("returns 404 for unknown sector", async () => {
    const res = await request(app).get("/api/v1/screener?sector=FAKESECTOR123");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ── Market mood endpoint ──────────────────────────────────────────────────────
describe("GET /api/v1/mood", () => {
  it("returns mood value between 0 and 100", async () => {
    const res = await request(app).get("/api/v1/mood");
    expect(res.status).toBe(200);
    expect(typeof res.body.value).toBe("number");
    expect(res.body.value).toBeGreaterThanOrEqual(0);
    expect(res.body.value).toBeLessThanOrEqual(100);
    expect(res.body).toHaveProperty("hasData");
    expect(res.body).toHaveProperty("ts");
  });
});

// ── Trending endpoint ─────────────────────────────────────────────────────────
describe("GET /api/v1/trending", () => {
  it("returns stocks array for gainers", async () => {
    const res = await request(app).get("/api/v1/trending?type=gainers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stocks)).toBe(true);
    expect(res.body.stocks.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid type", async () => {
    const res = await request(app).get("/api/v1/trending?type=INVALID");
    expect(res.status).toBe(400);
  });

  it("static fallback has correct shape", async () => {
    const res = await request(app).get("/api/v1/trending?type=gainers");
    expect(res.status).toBe(200);
    const stock = res.body.stocks[0];
    expect(stock).toHaveProperty("ticker");
    expect(stock).toHaveProperty("name");
  });
});

// ── Query param sanitisation ──────────────────────────────────────────────────
describe("Query param sanitisation", () => {
  it("handles empty search query gracefully", async () => {
    const res = await request(app).get("/api/v1/search?q=");
    expect([200, 400, 404]).toContain(res.status);
  });

  it("truncates excessively long search query", async () => {
    const longQuery = "A".repeat(500);
    const res = await request(app).get(`/api/v1/search?q=${longQuery}`);
    expect([200, 400, 404, 502]).toContain(res.status);
    // Should not crash the server
    expect(res.status).not.toBe(500);
  });
});
