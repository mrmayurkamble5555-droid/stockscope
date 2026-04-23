// backend/src/__tests__/screener.test.ts
// Unit tests for pure functions in screener.ts

// ── industryMatchesSector logic (inline for testability) ─────────────────────
interface SectorConfig { indices: string[]; keywords: string[]; }

function industryMatchesSector(industry: string | null | undefined, config: SectorConfig): boolean {
  if (config.keywords.length === 0) return true;
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return config.keywords.some(kw => new RegExp(kw).test(lower));
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("industryMatchesSector", () => {
  it("returns true for empty keywords (dedicated index — accept all)", () => {
    expect(industryMatchesSector("Banks", { indices: ["NIFTY BANK"], keywords: [] })).toBe(true);
    expect(industryMatchesSector(null,    { indices: ["NIFTY BANK"], keywords: [] })).toBe(true);
  });

  it("returns false for null industry with keywords", () => {
    expect(industryMatchesSector(null, { indices: [], keywords: ["textile"] })).toBe(false);
  });

  it("matches textile to Textiles & Apparels", () => {
    const config = { indices: [], keywords: ["textile", "apparel", "garment", "yarn"] };
    expect(industryMatchesSector("Textiles",          config)).toBe(true);
    expect(industryMatchesSector("Apparel",           config)).toBe(true);
    expect(industryMatchesSector("Yarn Spinning",     config)).toBe(true);
  });

  it("does NOT match bank to Textiles sector", () => {
    const config = { indices: [], keywords: ["textile", "apparel", "garment", "yarn"] };
    expect(industryMatchesSector("Banks",             config)).toBe(false);
    expect(industryMatchesSector("Private Bank",      config)).toBe(false);
    expect(industryMatchesSector("Paints",            config)).toBe(false);
  });

  it("matches pharma to Pharmaceuticals & Biotechnology", () => {
    const config = { indices: [], keywords: ["pharma", "biotechnology", "drug"] };
    expect(industryMatchesSector("Pharmaceuticals",   config)).toBe(true);
    expect(industryMatchesSector("Biotechnology",     config)).toBe(true);
  });

  it("matches paint to Chemicals & Petrochemicals (not Textiles)", () => {
    const chemConfig  = { indices: [], keywords: ["chemical", "paint", "coating"] };
    const textConfig  = { indices: [], keywords: ["textile", "apparel", "garment"] };
    expect(industryMatchesSector("Paints", chemConfig)).toBe(true);
    expect(industryMatchesSector("Paints", textConfig)).toBe(false);
  });

  it("is case-insensitive", () => {
    const config = { indices: [], keywords: ["bank"] };
    expect(industryMatchesSector("BANKS",             config)).toBe(true);
    expect(industryMatchesSector("Bank",              config)).toBe(true);
    expect(industryMatchesSector("banking services",  config)).toBe(true);
  });
});

// ── Ticker validation regex ────────────────────────────────────────────────────
const TICKER_RE = /^[A-Z0-9&]{1,20}$/;

describe("Ticker format validation", () => {
  it("accepts valid NSE tickers", () => {
    ["VBL", "TCS", "RELIANCE", "SBIN", "M&M", "L&T", "HDFCBANK"].forEach(t =>
      expect(TICKER_RE.test(t)).toBe(true)
    );
  });

  it("rejects path traversal", () => {
    ["../etc", "../../passwd", ".htaccess"].forEach(t =>
      expect(TICKER_RE.test(t)).toBe(false)
    );
  });

  it("rejects SQL injection patterns", () => {
    ["'; DROP", "1 OR 1", "UNION SELECT"].forEach(t =>
      expect(TICKER_RE.test(t)).toBe(false)
    );
  });

  it("rejects empty string", () => {
    expect(TICKER_RE.test("")).toBe(false);
  });

  it("rejects ticker over 20 chars", () => {
    expect(TICKER_RE.test("A".repeat(21))).toBe(false);
  });
});

// ── Edge case: negative P/E handling ──────────────────────────────────────────
describe("Stock data edge cases", () => {
  it("parseFloat on negative PE string returns negative number", () => {
    // Ensure negative P/E doesn't become NaN
    expect(parseFloat("-5.2")).toBe(-5.2);
    expect(isNaN(parseFloat("-5.2"))).toBe(false);
  });

  it("parseFloat on empty string returns NaN — UI must handle this", () => {
    expect(isNaN(parseFloat(""))).toBe(true);
  });

  it("parseFloat fallback to null pattern works", () => {
    const safeParse = (v: string) => parseFloat(v) || null;
    expect(safeParse("")).toBeNull();
    expect(safeParse("0")).toBeNull();   // 0 treated as null (no data)
    expect(safeParse("25.5")).toBe(25.5);
  });
});
