// backend/src/routes/screener.ts
// Sector screener — exact NSE industry sectors with strict industry-field filtering
// Each sector fetches from relevant NSE index(es) then filters by stock's industry field
// so banks never appear in Textiles, paint never appears in Banks, etc.

import { Router, Request, Response } from "express";

const router = Router();

// ── Shared fetch headers ──────────────────────────────────────────────────────
const NSE_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://www.nseindia.com",
  "Origin":          "https://www.nseindia.com",
  "Connection":      "keep-alive",
};

// ── Sector config ─────────────────────────────────────────────────────────────
// indices:  which NSE index(es) to fetch stocks from
// keywords: industry substrings that MUST match the stock's meta.industry field
//           if keywords is empty → accept ALL stocks from that index (dedicated index)
// ─────────────────────────────────────────────────────────────────────────────
interface SectorConfig {
  indices: string[];
  keywords: string[];
}

const SECTOR_CONFIG: Record<string, SectorConfig> = {
  "Aerospace & Defense": {
    indices:  ["NIFTY INDIA DEFENCE", "NIFTY 500"],
    keywords: ["aerospace", "defence", "defense", "military", "naval", "armament"],
  },
  "Agricultural Food & other Products": {
    indices:  ["NIFTY 500"],
    keywords: ["agricultural food", "agri food", "agro food", "agri product"],
  },
  "Agricultural, Commercial & Construction Vehicles": {
    indices:  ["NIFTY AUTO", "NIFTY 500"],
    keywords: ["tractor", "commercial vehicle", "construction vehicle", "agri vehicle", "farm equipment"],
  },
  "Auto Components": {
    indices:  ["NIFTY AUTO", "NIFTY 500"],
    keywords: ["auto component", "auto ancillar", "tyre", "brake", "auto part", "bearing"],
  },
  "Automobiles": {
    indices:  ["NIFTY AUTO"],
    keywords: ["automobile", "passenger vehicle", "two wheeler", "four wheeler", "electric vehicle", "car manufacturer"],
  },
  "Banks": {
    indices:  ["NIFTY BANK", "NIFTY PSU BANK", "NIFTY PRIVATE BANK"],
    keywords: [], // dedicated bank indices — all stocks here are banks
  },
  "Beverages": {
    indices:  ["NIFTY FMCG", "NIFTY 500"],
    keywords: ["beverage", "soft drink", "juice", "mineral water", "brewery", "spirits", "alcohol"],
  },
  "Capital Markets": {
    indices:  ["NIFTY FIN SERVICE", "NIFTY FINANCIAL SERVICES 25 50"],
    keywords: ["capital market", "stock broker", "brokerage", "asset management", "wealth management", "stock exchange", "depository"],
  },
  "Cement & Cement Products": {
    indices:  ["NIFTY INFRA", "NIFTY 500"],
    keywords: ["cement", "ready mix", "concrete"],
  },
  "Chemicals & Petrochemicals": {
    indices:  ["NIFTY INDIA MFG", "NIFTY 500"],
    keywords: ["chemical", "petrochemical", "speciality chemical", "specialty chemical", "dye", "pigment", "resin", "polymer", "paint", "coating", "adhesive", "ink"],
  },
  "Cigarettes & Tobacco Products": {
    indices:  ["NIFTY FMCG", "NIFTY 500"],
    keywords: ["cigarette", "tobacco", "bidi"],
  },
  "Commercial Services & Supplies": {
    indices:  ["NIFTY 500"],
    keywords: ["commercial service", "facility management", "cleaning service", "security service", "staffing", "manpower"],
  },
  "Construction": {
    indices:  ["NIFTY INFRA", "NIFTY REALTY", "NIFTY 500"],
    keywords: ["construction", "epc", "infrastructure developer", "road", "highway", "bridge", "tunneling"],
  },
  "Consumable Fuels": {
    indices:  ["NIFTY ENERGY", "NIFTY OIL AND GAS"],
    keywords: ["coal", "consumable fuel", "lignite", "coke"],
  },
  "Consumer Durables": {
    indices:  ["NIFTY INDIA CONSUMPTION", "NIFTY 500"],
    keywords: ["consumer durable", "home appliance", "white goods", "television", "refrigerator", "washing machine", "air conditioner"],
  },
  "Diversified": {
    indices:  ["NIFTY 500"],
    keywords: ["diversified"],
  },
  "Diversified FMCG": {
    indices:  ["NIFTY FMCG", "NIFTY 500"],
    keywords: ["diversified fmcg", "fmcg", "consumer good"],
  },
  "Diversified Metals": {
    indices:  ["NIFTY METAL", "NIFTY 500"],
    keywords: ["diversified metal"],
  },
  "Electrical Equipment": {
    indices:  ["NIFTY INDIA MFG", "NIFTY 500"],
    keywords: ["electrical equipment", "switchgear", "transformer", "cable", "wire", "motor", "generator", "inverter"],
  },
  "Engineering Services": {
    indices:  ["NIFTY INFRA", "NIFTY 500"],
    keywords: ["engineering service", "technical service", "design service", "inspection service"],
  },
  "Entertainment": {
    indices:  ["NIFTY MEDIA", "NIFTY 500"],
    keywords: ["entertainment", "film", "movie", "ott", "gaming", "theme park", "event management"],
  },
  "Ferrous Metals": {
    indices:  ["NIFTY METAL", "NIFTY 500"],
    keywords: ["ferrous", "steel", "iron", "pig iron", "sponge iron", "alloy steel", "stainless steel"],
  },
  "Fertilizers & Agrochemicals": {
    indices:  ["NIFTY INDIA MFG", "NIFTY 500"],
    keywords: ["fertilizer", "fertiliser", "agrochemical", "agro chemical", "pesticide", "herbicide", "insecticide", "fungicide"],
  },
  "Finance": {
    indices:  ["NIFTY FIN SERVICE", "NIFTY FINANCIAL SERVICES 25 50", "NIFTY 500"],
    keywords: ["nbfc", "housing finance", "microfinance", "gold loan", "vehicle finance", "small finance"],
  },
  "Financial Technology (Fintech)": {
    indices:  ["NIFTY FIN SERVICE", "NIFTY 500"],
    keywords: ["fintech", "financial technology", "payment", "digital payment", "wallet"],
  },
  "Food Products": {
    indices:  ["NIFTY FMCG", "NIFTY INDIA CONSUMPTION", "NIFTY 500"],
    keywords: ["food product", "packaged food", "snack", "biscuit", "dairy", "edible oil", "spice", "sugar", "confectionery", "bakery", "noodle", "pasta"],
  },
  "Gas": {
    indices:  ["NIFTY OIL AND GAS", "NIFTY ENERGY"],
    keywords: ["gas distribution", "city gas", "natural gas", "gas transmission", "lng", "cng", "lpg"],
  },
  "Healthcare Equipment & Supplies": {
    indices:  ["NIFTY HEALTHCARE INDEX", "NIFTY 500"],
    keywords: ["healthcare equipment", "medical device", "medical equipment", "surgical", "diagnostic equipment", "medical supply"],
  },
  "Healthcare Services": {
    indices:  ["NIFTY HEALTHCARE INDEX", "NIFTY 500"],
    keywords: ["hospital", "healthcare service", "diagnostic service", "diagnostic centre", "pathology", "radiology", "clinic", "medical service"],
  },
  "Household Products": {
    indices:  ["NIFTY FMCG", "NIFTY 500"],
    keywords: ["household product", "home care", "detergent", "soap", "sanitizer", "hygiene"],
  },
  "Industrial Manufacturing": {
    indices:  ["NIFTY INDIA MFG", "NIFTY 500"],
    keywords: ["industrial manufacturing", "heavy engineering", "industrial equipment", "machine tool"],
  },
  "Industrial Products": {
    indices:  ["NIFTY INDIA MFG", "NIFTY 500"],
    keywords: ["industrial product", "industrial component", "industrial valve", "pump", "compressor", "gear", "fastener"],
  },
  "Insurance": {
    indices:  ["NIFTY FIN SERVICE", "NIFTY FINANCIAL SERVICES 25 50"],
    keywords: ["insurance", "life insurance", "general insurance", "reinsurance", "health insurance"],
  },
  "IT - Hardware": {
    indices:  ["NIFTY IT", "NIFTY 500"],
    keywords: ["it - hardware", "it hardware", "computer hardware", "server", "storage", "semiconductor"],
  },
  "IT - Services": {
    indices:  ["NIFTY IT", "NIFTY 500"],
    keywords: ["it - services", "it service", "information technology service", "bpo", "kpo", "outsourcing", "it consulting"],
  },
  "IT - Software": {
    indices:  ["NIFTY IT", "NIFTY 500"],
    keywords: ["it - software", "software", "saas", "erp", "crm", "technology product"],
  },
  "Leisure Services": {
    indices:  ["NIFTY INDIA CONSUMPTION", "NIFTY 500"],
    keywords: ["leisure", "hotel", "hospitality", "tourism", "travel", "resort", "restaurant", "cafe", "quick service restaurant"],
  },
  "Media": {
    indices:  ["NIFTY MEDIA", "NIFTY 500"],
    keywords: ["media", "television", "radio", "news", "broadcast", "digital media"],
  },
  "Metals & Minerals Trading": {
    indices:  ["NIFTY METAL", "NIFTY 500"],
    keywords: ["metal.*trading", "mineral trading", "metals & minerals", "scrap trading"],
  },
  "Minerals & Mining": {
    indices:  ["NIFTY METAL", "NIFTY 500"],
    keywords: ["mining", "mineral", "quarry", "ore", "bauxite", "manganese"],
  },
  "Non - Ferrous Metals": {
    indices:  ["NIFTY METAL", "NIFTY 500"],
    keywords: ["non.*ferrous", "non-ferrous", "aluminium", "copper", "zinc", "lead", "nickel", "tin"],
  },
  "Oil": {
    indices:  ["NIFTY OIL AND GAS", "NIFTY ENERGY"],
    keywords: ["crude oil", "upstream", "oil exploration", "oilfield service", "drilling"],
  },
  "Other Construction Materials": {
    indices:  ["NIFTY INFRA", "NIFTY 500"],
    keywords: ["other construction", "plywood", "glass", "tile", "sanitary", "ceramic", "wood panel"],
  },
  "Other Consumer Services": {
    indices:  ["NIFTY INDIA CONSUMPTION", "NIFTY 500"],
    keywords: ["other consumer service", "personal service", "laundry", "salon"],
  },
  "Other Utilities": {
    indices:  ["NIFTY ENERGY", "NIFTY 500"],
    keywords: ["other utilit", "water supply", "waste management", "sewage"],
  },
  "Paper, Forest & Jute Products": {
    indices:  ["NIFTY 500"],
    keywords: ["paper", "pulp", "jute", "forest product", "timber", "packaging paper"],
  },
  "Personal Products": {
    indices:  ["NIFTY FMCG", "NIFTY 500"],
    keywords: ["personal product", "personal care", "cosmetic", "beauty", "skincare", "haircare", "oral care"],
  },
  "Petroleum Products": {
    indices:  ["NIFTY OIL AND GAS", "NIFTY ENERGY"],
    keywords: ["petroleum product", "refinery", "refining", "downstream", "lubricant"],
  },
  "Pharmaceuticals & Biotechnology": {
    indices:  ["NIFTY PHARMA"],
    keywords: [], // dedicated pharma index — all stocks are pharma/biotech
  },
  "Power": {
    indices:  ["NIFTY ENERGY", "NIFTY INFRA"],
    keywords: ["power generation", "power transmission", "power distribution", "thermal power", "renewable energy", "solar", "wind energy", "hydro", "nuclear power"],
  },
  "Printing & Publication": {
    indices:  ["NIFTY MEDIA", "NIFTY 500"],
    keywords: ["print", "publishing", "newspaper", "magazine", "book publisher"],
  },
  "Realty": {
    indices:  ["NIFTY REALTY"],
    keywords: [], // dedicated realty index — all stocks are realty
  },
  "Retailing": {
    indices:  ["NIFTY INDIA CONSUMPTION", "NIFTY 500"],
    keywords: ["retail", "retailing", "supermarket", "hypermarket", "department store", "online retail"],
  },
  "Telecom - Equipment & Accessories": {
    indices:  ["NIFTY 500"],
    keywords: ["telecom equipment", "telecom accessory", "networking equipment", "optical fibre", "telecom infrastructure"],
  },
  "Telecom - Services": {
    indices:  ["NIFTY 500"],
    keywords: ["telecom service", "telecommunication", "mobile service", "broadband", "dth", "internet service provider"],
  },
  "Textiles & Apparels": {
    indices:  ["NIFTY INDIA MFG", "NIFTY 500"],
    keywords: ["textile", "apparel", "garment", "fabric", "yarn", "spinning", "weaving", "knitting", "readymade", "fashion"],
  },
  "Transport Infrastructure": {
    indices:  ["NIFTY INFRA", "NIFTY 500"],
    keywords: ["transport infrastructure", "port", "airport", "metro", "railway infrastructure", "toll", "container terminal"],
  },
  "Transport Services": {
    indices:  ["NIFTY INFRA", "NIFTY 500"],
    keywords: ["transport service", "logistics", "shipping", "freight", "courier", "aviation", "airline", "cargo"],
  },
};

// ── Fetch from a single NSE index ─────────────────────────────────────────────
async function fetchNseIndex(index: string): Promise<any[]> {
  try {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(index)}`;
    const res = await fetch(url, { headers: NSE_HEADERS });
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json?.data || []).filter(
      (r: any) =>
        r.symbol &&
        !r.symbol.startsWith("NIFTY") &&
        !r.symbol.includes("SENSEX") &&
        r.symbol !== "INDIA VIX"
    );
  } catch {
    return [];
  }
}

// ── Check if a stock's industry matches this sector's keywords ────────────────
function industryMatchesSector(industry: string | null | undefined, config: SectorConfig): boolean {
  // Empty keywords = dedicated index, accept all stocks
  if (config.keywords.length === 0) return true;
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return config.keywords.some(kw => new RegExp(kw).test(lower));
}

// ── Fetch & filter stocks for one sector ─────────────────────────────────────
async function fetchSectorStocks(sectorName: string): Promise<any[]> {
  const config = SECTOR_CONFIG[sectorName];
  if (!config) return [];

  const results = await Promise.all(config.indices.map(fetchNseIndex));
  const flat = results.flat();

  const seen = new Set<string>();
  const matched: any[] = [];

  for (const raw of flat) {
    if (seen.has(raw.symbol)) continue;
    seen.add(raw.symbol);

    const industry = raw.meta?.industry || raw.industry || null;

    // ✅ CORE FIX: only include stocks whose industry field matches this sector
    if (!industryMatchesSector(industry, config)) continue;

    matched.push(shapeStock(raw, sectorName, industry));
  }

  return matched;
}

// ── Shape a raw NSE row ───────────────────────────────────────────────────────
function shapeStock(raw: any, sector: string, industry: string | null): any {
  return {
    ticker:       raw.symbol,
    name:         raw.meta?.companyName || raw.companyName || raw.symbol,
    sector,
    industry,
    cmp:          parseFloat(raw.lastPrice || raw.ltp || 0) || null,
    pe:           parseFloat(raw.pe || raw.peTtm || 0) || null,
    debtToEquity: null,
    netProfit:    null,
    growth5Y:     parseFloat(raw.pChange || raw.perChange || 0),
    week52High:   parseFloat(raw.yearHigh || 0) || null,
    week52Low:    parseFloat(raw.yearLow  || 0) || null,
    change1D:     parseFloat(raw.pChange  || 0),
    volume:       parseInt(raw.totalTradedVolume || 0) || 0,
    marketCap:    parseFloat(raw.ffmc || 0) || null,
    rank:         null,
  };
}

// ── Rank stocks by composite score ───────────────────────────────────────────
function rankStocks(stocks: any[]): any[] {
  if (stocks.length === 0) return [];

  const peVals  = stocks.map(s => s.pe).filter((v): v is number => !!v && v > 0 && v < 500);
  const capVals = stocks.map(s => s.marketCap).filter((v): v is number => !!v && v > 0);
  const chgVals = stocks.map(s => s.change1D).filter((v): v is number => v !== null);

  const pct = (val: number, arr: number[], higherBetter: boolean): number => {
    if (!val || arr.length === 0) return 50;
    const beaten = arr.filter(v => higherBetter ? val > v : val < v).length;
    return (beaten / arr.length) * 100;
  };

  return stocks
    .map(s => {
      let score = 0, count = 0;
      if (s.pe        && peVals.length)  { score += pct(s.pe,        peVals,  false); count++; }
      if (s.marketCap && capVals.length) { score += pct(s.marketCap, capVals, true);  count++; }
      if (s.change1D !== null && chgVals.length) { score += pct(s.change1D, chgVals, true); count++; }
      return { ...s, compositeScore: count > 0 ? score / count : 50 };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ── Sort by user-selected key ─────────────────────────────────────────────────
function sortStocks(stocks: any[], sortBy: string): any[] {
  const arr = [...stocks];
  switch (sortBy) {
    case "pe":      return arr.sort((a, b) => (!a.pe ? 1 : !b.pe ? -1 : a.pe - b.pe));
    case "pe_desc": return arr.sort((a, b) => (!a.pe ? 1 : !b.pe ? -1 : b.pe - a.pe));
    case "profit":  return arr.sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0));
    case "growth":  return arr.sort((a, b) => (b.change1D  || 0) - (a.change1D  || 0));
    case "volume":  return arr.sort((a, b) => (b.volume    || 0) - (a.volume    || 0));
    case "debt":    return arr.sort((a, b) => (!a.debtToEquity ? 1 : !b.debtToEquity ? -1 : a.debtToEquity - b.debtToEquity));
    case "rank":
    default:        return arr.sort((a, b) => (a.rank || 999) - (b.rank || 999));
  }
}

// ── GET /api/v1/screener ──────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const { sector, sort = "rank", limit = "500" } = req.query as Record<string, string>;

  // Sector list — instant, no NSE calls
  if (!sector) {
    const sectors = Object.keys(SECTOR_CONFIG)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ sector: name, count: 1 }));

    console.log(`[Screener] Sector list: ${sectors.length} sectors`);
    return res.json({ sectors });
  }

  // Single sector stocks
  if (!Object.prototype.hasOwnProperty.call(SECTOR_CONFIG, sector)) {
    return res.status(404).json({ error: `Unknown sector: ${sector}` });
  }

  try {
    const raw = await fetchSectorStocks(sector);

    if (raw.length === 0) {
      console.log(`[Screener] ⚠️  ${sector}: 0 stocks after industry filter`);
      return res.json({ sector, stocks: [], total: 0 });
    }

    const ranked  = rankStocks(raw);
    const sorted  = sortStocks(ranked, sort);
    const limited = sorted.slice(0, parseInt(limit));

    console.log(`[Screener] ✅ ${sector}: ${limited.length} stocks, sort=${sort}`);
    return res.json({ sector, total: raw.length, stocks: limited });

  } catch (err: any) {
    console.error(`[Screener] ❌ ${sector}:`, err.message);
    return res.status(502).json({ error: `Failed to load sector: ${sector}` });
  }
});

export default router;
