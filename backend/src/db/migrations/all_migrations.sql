-- ═══════════════════════════════════════════════════════════════
-- StockScope Database Migrations
-- Run in order: 001 → 005
-- ═══════════════════════════════════════════════════════════════

-- ─── 001: stocks ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stocks (
  id         SERIAL PRIMARY KEY,
  ticker     VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(200),
  exchange   VARCHAR(10),
  sector     VARCHAR(100),
  industry   VARCHAR(100),
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stocks_ticker ON stocks(ticker);

-- ─── 002: fundamentals ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fundamentals (
  id                 SERIAL PRIMARY KEY,
  stock_id           INT REFERENCES stocks(id) ON DELETE CASCADE,
  date               DATE NOT NULL,
  pe_ratio           NUMERIC(10,2),
  industry_pe        NUMERIC(10,2),
  roce_pct           NUMERIC(10,2),
  debt_to_equity     NUMERIC(10,4),
  net_profit_cr      NUMERIC(14,2),
  free_cashflow_cr   NUMERIC(14,2),
  profit_growth_5y   NUMERIC(10,2),
  pledged_pct        NUMERIC(8,4),
  market_cap_cr      NUMERIC(16,2),
  cmp                NUMERIC(12,2),
  source             VARCHAR(50),   -- 'NSE' | 'SCREENER' | 'MIXED'
  UNIQUE(stock_id, date)
);
CREATE INDEX IF NOT EXISTS idx_fund_stock_date ON fundamentals(stock_id, date DESC);

-- ─── 003: ohlc ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ohlc (
  id       SERIAL PRIMARY KEY,
  stock_id INT REFERENCES stocks(id) ON DELETE CASCADE,
  date     DATE NOT NULL,
  open     NUMERIC(12,2),
  high     NUMERIC(12,2),
  low      NUMERIC(12,2),
  close    NUMERIC(12,2),
  volume   BIGINT,
  source   VARCHAR(20) DEFAULT 'NSE',   -- 'NSE' | 'YFINANCE'
  UNIQUE(stock_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ohlc_stock_date ON ohlc(stock_id, date DESC);

-- ─── 004: technicals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS technicals (
  id       SERIAL PRIMARY KEY,
  stock_id INT REFERENCES stocks(id) ON DELETE CASCADE,
  date     DATE NOT NULL,
  pivot    NUMERIC(12,2),
  r1       NUMERIC(12,2),
  r2       NUMERIC(12,2),
  s1       NUMERIC(12,2),
  s2       NUMERIC(12,2),
  ema20    NUMERIC(12,2),
  ema50    NUMERIC(12,2),
  ema100   NUMERIC(12,2),
  UNIQUE(stock_id, date)
);
CREATE INDEX IF NOT EXISTS idx_tech_stock_date ON technicals(stock_id, date DESC);

-- ─── 005: peer_ranks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS peer_ranks (
  id              SERIAL PRIMARY KEY,
  stock_id        INT REFERENCES stocks(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  sector          VARCHAR(100),
  composite_score NUMERIC(6,2),
  rank_position   INT,
  total_peers     INT,
  UNIQUE(stock_id, date)
);
CREATE INDEX IF NOT EXISTS idx_rank_stock_date ON peer_ranks(stock_id, date DESC);
