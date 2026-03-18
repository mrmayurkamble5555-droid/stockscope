import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { db } from './connection';

const SECTOR_MAP: Record<string, { sector: string; industry: string }> = {
  HDFCBANK:  { sector: 'Banking',     industry: 'Private Banks'    },
  ICICIBANK: { sector: 'Banking',     industry: 'Private Banks'    },
  KOTAKBANK: { sector: 'Banking',     industry: 'Private Banks'    },
  AXISBANK:  { sector: 'Banking',     industry: 'Private Banks'    },
  SBIN:      { sector: 'Banking',     industry: 'PSU Banks'        },
  BANKBARODA:{ sector: 'Banking',     industry: 'PSU Banks'        },
  PNB:       { sector: 'Banking',     industry: 'PSU Banks'        },
  INDUSINDBK:{ sector: 'Banking',     industry: 'Private Banks'    },
  FEDERALBNK:{ sector: 'Banking',     industry: 'Private Banks'    },
  IDFCFIRSTB:{ sector: 'Banking',     industry: 'Private Banks'    },
  YESBANK:   { sector: 'Banking',     industry: 'Private Banks'    },
  TCS:       { sector: 'Technology',  industry: 'IT Services'      },
  INFY:      { sector: 'Technology',  industry: 'IT Services'      },
  WIPRO:     { sector: 'Technology',  industry: 'IT Services'      },
  HCLTECH:   { sector: 'Technology',  industry: 'IT Services'      },
  TECHM:     { sector: 'Technology',  industry: 'IT Services'      },
  LTIM:      { sector: 'Technology',  industry: 'IT Services'      },
  MPHASIS:   { sector: 'Technology',  industry: 'IT Services'      },
  PERSISTENT:{ sector: 'Technology',  industry: 'IT Services'      },
  COFORGE:   { sector: 'Technology',  industry: 'IT Services'      },
  OFSS:      { sector: 'Technology',  industry: 'IT Services'      },
  ITC:       { sector: 'FMCG',        industry: 'Diversified'      },
  HUL:       { sector: 'FMCG',        industry: 'Personal Care'    },
  NESTLEIND: { sector: 'FMCG',        industry: 'Food Products'    },
  BRITANNIA: { sector: 'FMCG',        industry: 'Food Products'    },
  BRIT:      { sector: 'FMCG',        industry: 'Food Products'    },
  MARICO:    { sector: 'FMCG',        industry: 'Personal Care'    },
  DABUR:     { sector: 'FMCG',        industry: 'Personal Care'    },
  COLPAL:    { sector: 'FMCG',        industry: 'Personal Care'    },
  GODREJCP:  { sector: 'FMCG',        industry: 'Personal Care'    },
  VBL:       { sector: 'FMCG',        industry: 'Beverages'        },
  MARUTI:    { sector: 'Auto',        industry: 'Automobiles'      },
  TATAMOTORS:{ sector: 'Auto',        industry: 'Automobiles'      },
  EICHERMOT: { sector: 'Auto',        industry: 'Automobiles'      },
  HEROMOTOCO:{ sector: 'Auto',        industry: 'Automobiles'      },
  TVSMOTOR:  { sector: 'Auto',        industry: 'Automobiles'      },
  SUNPHARMA: { sector: 'Pharma',      industry: 'Pharmaceuticals'  },
  DRREDDY:   { sector: 'Pharma',      industry: 'Pharmaceuticals'  },
  CIPLA:     { sector: 'Pharma',      industry: 'Pharmaceuticals'  },
  DIVISLAB:  { sector: 'Pharma',      industry: 'Pharmaceuticals'  },
  LUPIN:     { sector: 'Pharma',      industry: 'Pharmaceuticals'  },
  AUROPHARMA:{ sector: 'Pharma',      industry: 'Pharmaceuticals'  },
  RELIANCE:  { sector: 'Energy',      industry: 'Oil & Gas'        },
  ONGC:      { sector: 'Energy',      industry: 'Oil & Gas'        },
  IOC:       { sector: 'Energy',      industry: 'Oil & Gas'        },
  BPCL:      { sector: 'Energy',      industry: 'Oil & Gas'        },
  NTPC:      { sector: 'Energy',      industry: 'Power'            },
  POWERGRID: { sector: 'Energy',      industry: 'Power'            },
  BAJFINANCE:{ sector: 'NBFC',        industry: 'Consumer Finance' },
  BAJAJFINSV:{ sector: 'NBFC',        industry: 'Diversified Finance'},
  HDFCLIFE:  { sector: 'Insurance',   industry: 'Life Insurance'   },
  SBILIFE:   { sector: 'Insurance',   industry: 'Life Insurance'   },
  MUTHOOTFIN:{ sector: 'NBFC',        industry: 'Gold Finance'     },
  TATASTEEL: { sector: 'Metals',      industry: 'Steel'            },
  JSWSTEEL:  { sector: 'Metals',      industry: 'Steel'            },
  HINDALCO:  { sector: 'Metals',      industry: 'Aluminium'        },
  VEDL:      { sector: 'Metals',      industry: 'Diversified Metals'},
  TITAN:     { sector: 'Consumer',    industry: 'Jewellery'        },
  DMART:     { sector: 'Retail',      industry: 'Retail'           },
  TRENT:     { sector: 'Retail',      industry: 'Retail'           },
  ULTRACEMCO:{ sector: 'Cement',      industry: 'Cement'           },
  SHREECEM:  { sector: 'Cement',      industry: 'Cement'           },
  AMBUJACEM: { sector: 'Cement',      industry: 'Cement'           },
  ACC:       { sector: 'Cement',      industry: 'Cement'           },
  LT:        { sector: 'Infrastructure', industry: 'Construction'  },
  ADANIPORTS:{ sector: 'Infrastructure', industry: 'Ports'         },
};

function getSector(ticker: string): { sector: string; industry: string } {
  return SECTOR_MAP[ticker] || { sector: 'Others', industry: 'Diversified' };
}

async function seedFromCsv() {
  const possiblePaths = [
    path.join(process.cwd(), 'EQUITY_L.csv'),
    'C:\\Users\\Mayur\\Downloads\\EQUITY_L.csv',
    'C:\\Users\\Mayur\\Desktop\\EQUITY_L.csv',
  ];

  let csvPath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) { csvPath = p; break; }
  }

  if (!csvPath) {
    console.error('❌ EQUITY_L.csv not found!');
    console.error('   Copy EQUITY_L.csv to: C:\\Users\\Mayur\\Desktop\\stockscope-backend\\EQUITY_L.csv');
    process.exit(1);
  }

  console.log(`📂 Reading: ${csvPath}`);
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines   = content.split('\n').filter(l => l.trim());
  const dataLines = lines.slice(1);
  console.log(`📊 Found ${dataLines.length} rows in CSV\n`);

  let seeded = 0, skipped = 0, failed = 0;

  for (const line of dataLines) {
    const cols   = line.split(',');
    if (cols.length < 3) continue;
    const ticker = cols[0]?.trim().toUpperCase();
    const name   = cols[1]?.trim().replace(/"/g, '');
    const series = cols[2]?.trim();

    if (series !== 'EQ') { skipped++; continue; }
    if (!ticker || !name) { skipped++; continue; }

    const { sector, industry } = getSector(ticker);

    try {
      await db.query(`
        INSERT INTO stocks (ticker, name, exchange, sector, industry, is_active)
        VALUES ($1, $2, 'NSE', $3, $4, true)
        ON CONFLICT (ticker) DO UPDATE SET
          name = EXCLUDED.name, is_active = true
      `, [ticker, name, sector, industry]);
      seeded++;
      if (seeded % 200 === 0) console.log(`  ✅ ${seeded} seeded...`);
    } catch (err: any) {
      failed++;
    }
  }

  const count = await db.query('SELECT COUNT(*) FROM stocks');
  console.log(`\n✅ Done! Seeded: ${seeded} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`📋 Total stocks in DB: ${count.rows[0].count}`);
  await db.end();
}

seedFromCsv().catch(err => { console.error(err); process.exit(1); });
