// backend/src/workers/peerRanker.ts
// 10-metric composite ranking system (expanded from 7)
// New metrics added: price_to_book, current_ratio, return_5yr_pct

import { db }             from "../db/connection";
import { upsertPeerRank } from "../services/stockDbService";
import { percentileRank, calcCompositeScore } from "../services/calculatorService";

// ── 10-metric ranking set ─────────────────────────────────────────────────────
//
//  Metric             | DB column          | Direction
//  ───────────────────|────────────────────|──────────────────────
//  P/E Ratio          | pe_ratio           | lower = better  ✓
//  ROCE %             | roce_pct           | higher = better
//  Debt / Equity      | debt_to_equity     | lower = better  ✓
//  Net Profit 12M     | net_profit_cr      | higher = better
//  Free Cash Flow     | free_cashflow_cr   | higher = better
//  Profit Growth 5Y   | profit_growth_5y   | higher = better
//  Pledged %          | pledged_pct        | lower = better  ✓
//  Price to Book      | price_to_book      | lower = better  ✓  ← NEW
//  Current Ratio      | current_ratio      | higher = better    ← NEW
//  Return 5Yr %       | return_5yr_pct     | higher = better    ← NEW
//
//  Market Cap (market_cap_cr) is intentionally excluded from ranking —
//  used for display and sorting only.

const METRIC_KEYS = [
  { col: "pe_ratio",         lowerBetter: true  },
  { col: "roce_pct",         lowerBetter: false },
  { col: "debt_to_equity",   lowerBetter: true  },
  { col: "net_profit_cr",    lowerBetter: false },
  { col: "free_cashflow_cr", lowerBetter: false },
  { col: "profit_growth_5y", lowerBetter: false },
  { col: "pledged_pct",      lowerBetter: true  },
  { col: "price_to_book",    lowerBetter: true  },  // ← NEW
  { col: "current_ratio",    lowerBetter: false },  // ← NEW
  { col: "return_5yr_pct",   lowerBetter: false },  // ← NEW
];

export async function runPeerRanker() {
  console.log("🏆 [peer-ranker] Starting (10-metric ranking)...");
  const today = new Date().toISOString().slice(0, 10);

  const sectors = await db.query(
    "SELECT DISTINCT sector FROM stocks WHERE is_active = true AND sector IS NOT NULL AND sector != ''"
  );

  let totalRanked = 0;

  for (const { sector } of sectors.rows) {
    try {
      // Fetch all 10 ranking columns for every active stock in this sector
      const res = await db.query(`
        SELECT s.id, s.ticker,
               f.pe_ratio,
               f.roce_pct,
               f.debt_to_equity,
               f.net_profit_cr,
               f.free_cashflow_cr,
               f.profit_growth_5y,
               f.pledged_pct,
               f.price_to_book,
               f.current_ratio,
               f.return_5yr_pct
        FROM stocks s
        JOIN LATERAL (
          SELECT * FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
        ) f ON true
        WHERE s.sector = $1 AND s.is_active = true
      `, [sector]);

      const sectorStocks = res.rows;
      if (sectorStocks.length < 2) continue;

      // Extract all values per metric across the sector peer group
      const sectorValues: Record<string, (number | null)[]> = {};
      for (const m of METRIC_KEYS) {
        sectorValues[m.col] = sectorStocks.map(s =>
          s[m.col] !== null && s[m.col] !== undefined
            ? parseFloat(s[m.col])
            : null
        );
      }

      // Score each stock across all 10 metrics
      // If a metric value is null for a stock, percentileRank returns null
      // calcCompositeScore averages only the non-null scores (graceful N/A handling)
      const scored = sectorStocks.map(stock => {
        const metricScores = METRIC_KEYS.map(m => {
          const myVal = stock[m.col] !== null && stock[m.col] !== undefined
            ? parseFloat(stock[m.col])
            : null;
          return percentileRank(sectorValues[m.col], myVal, m.lowerBetter);
        });

        return {
          id:             stock.id,
          ticker:         stock.ticker,
          compositeScore: calcCompositeScore(metricScores),
        };
      });

      // Sort descending — rank 1 = best composite score
      scored.sort((a, b) => b.compositeScore - a.compositeScore);

      for (let i = 0; i < scored.length; i++) {
        await upsertPeerRank(scored[i].id, today, {
          sector,
          compositeScore: scored[i].compositeScore,
          rankPosition:   i + 1,
          totalPeers:     scored.length,
        });
      }

      totalRanked += scored.length;
      console.log(`  ✅ ${sector}: ${scored.length} stocks ranked`);
    } catch (err: any) {
      console.error(`  ❌ Sector ${sector}: ${err.message}`);
    }
  }

  console.log(`🏆 [peer-ranker] Done. Ranked ${totalRanked} stocks across ${sectors.rows.length} sectors`);
}
