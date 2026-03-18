import { db } from '../db/connection';
import { upsertPeerRank } from '../services/stockDbService';
import { percentileRank, calcCompositeScore } from '../services/calculatorService';

const METRIC_KEYS = [
  { col: 'pe_ratio',          lowerBetter: true  },
  { col: 'roce_pct',          lowerBetter: false },
  { col: 'debt_to_equity',    lowerBetter: true  },
  { col: 'net_profit_cr',     lowerBetter: false },
  { col: 'free_cashflow_cr',  lowerBetter: false },
  { col: 'profit_growth_5y',  lowerBetter: false },
  { col: 'pledged_pct',       lowerBetter: true  },
];

export async function runPeerRanker() {
  console.log('🏆 [peer-ranker] Starting...');
  const today = new Date().toISOString().slice(0, 10);

  // Get all distinct sectors
  const sectors = await db.query(
    'SELECT DISTINCT sector FROM stocks WHERE is_active = true AND sector IS NOT NULL AND sector != \'\''
  );

  let totalRanked = 0;

  for (const { sector } of sectors.rows) {
    try {
      // Get all stocks + fundamentals in this sector
      const res = await db.query(`
        SELECT s.id, s.ticker, f.pe_ratio, f.roce_pct, f.debt_to_equity,
               f.net_profit_cr, f.free_cashflow_cr, f.profit_growth_5y, f.pledged_pct
        FROM stocks s
        JOIN LATERAL (
          SELECT * FROM fundamentals WHERE stock_id = s.id ORDER BY date DESC LIMIT 1
        ) f ON true
        WHERE s.sector = $1 AND s.is_active = true
      `, [sector]);

      const sectorStocks = res.rows;
      if (sectorStocks.length < 2) continue;

      // Extract values per metric column (all stocks in sector)
      const sectorValues: Record<string, (number | null)[]> = {};
      for (const m of METRIC_KEYS) {
        sectorValues[m.col] = sectorStocks.map(s =>
          s[m.col] !== null ? parseFloat(s[m.col]) : null
        );
      }

      // Rank each stock
      const scored = sectorStocks.map(stock => {
        const metricScores = METRIC_KEYS.map(m => {
          const myVal = stock[m.col] !== null ? parseFloat(stock[m.col]) : null;
          return percentileRank(sectorValues[m.col], myVal, m.lowerBetter);
        });
        return {
          id:             stock.id,
          compositeScore: calcCompositeScore(metricScores),
        };
      });

      // Sort by composite score (desc) to assign ranks
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
    } catch (err: any) {
      console.error(`  ❌ Sector ${sector}: ${err.message}`);
    }
  }

  console.log(`🏆 [peer-ranker] Done. Ranked ${totalRanked} stocks across ${sectors.rows.length} sectors`);
}
