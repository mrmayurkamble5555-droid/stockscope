import screenerRouter from "./routes/screener";
import trendingRouter from "./routes/trending";
app.use("/api/v1/screener", screenerRouter);
app.use("/api/v1/trending", trendingRouter);
import { useEffect, useState, useRef, useCallback } from "react";
import PivotChart from "./PivotChart";
import FairValuePanel from "./FairValuePanel";

const backendBase = "http://localhost:3001/api/v1";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fval = (metric) => {
  if (!metric) return "NA";
  if (metric.value !== null && metric.value !== undefined) return metric.value;
  if (metric.rawValue !== null && metric.rawValue !== undefined) return metric.rawValue;
  return "NA";
};
const tval = (v) => (v !== null && v !== undefined && v !== 0) ? v : "NA";
const fmt = (v, prefix = "₹") => v ? `${prefix}${parseFloat(v).toLocaleString("en-IN")}` : "NA";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#f4f6f8", surface: "#ffffff", surfaceAlt: "#f8fafc",
  border: "#e2e8f0", borderStrong: "#cbd5e1",
  green: "#16a34a", greenDark: "#15803d", greenLight: "#dcfce7", greenText: "#14532d",
  red: "#dc2626", redLight: "#fee2e2", redText: "#7f1d1d",
  amber: "#d97706", amberLight: "#fef3c7", amberText: "#78350f",
  blue: "#2563eb", blueLight: "#eff6ff", blueText: "#1e3a8a",
  purple: "#7c3aed", purpleLight: "#f5f3ff", purpleText: "#4c1d95",
  textPrimary: "#0f172a", textSecond: "#475569", textThird: "#94a3b8",
};

const S = {
  card: { background: C.surface, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  pill: (active) => ({ borderRadius: 999, padding: "6px 14px", border: `1px solid ${active ? C.green : C.border}`, backgroundColor: active ? C.greenLight : C.surface, color: active ? C.greenText : C.textSecond, cursor: "pointer", fontWeight: active ? 600 : 400, fontSize: 13, transition: "all .15s" }),
  greenBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, padding: "9px 20px", border: "none", background: C.green, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, letterSpacing: ".2px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  grid4: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 },
};

// ─── Logo SVG ─────────────────────────────────────────────────────────────────
function Logo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
      <rect width="72" height="72" rx="18" fill="#0f172a" />
      <text x="10" y="50" fontFamily="Georgia,serif" fontSize="38" fontWeight="900" fill="#16a34a">S</text>
      <polyline points="42,44 50,30 58,30" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <polyline points="52,25 58,30 53,35" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, color, bg, size = 11 }) {
  return <span style={{ fontSize: size, fontWeight: 700, color, background: bg, borderRadius: 5, padding: "2px 8px", display: "inline-block", letterSpacing: ".2px" }}>{label}</span>;
}

// ─── MetricBox ────────────────────────────────────────────────────────────────
function MetricBox({ label, value, color, sub }) {
  return (
    <div style={{ backgroundColor: C.surfaceAlt, borderRadius: 10, padding: "11px 13px", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, color: C.textThird, marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || C.textPrimary }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.textThird, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Stock Rank Hero ──────────────────────────────────────────────────────────
function RankHero({ rank, total, sector, ticker }) {
  if (!rank || !total) return null;
  const pct = ((rank / total) * 100).toFixed(0);
  const isTop = rank <= Math.ceil(total * 0.25);
  const color = isTop ? C.green : rank <= Math.ceil(total * 0.5) ? C.amber : C.red;
  const label = isTop ? "Top Performer" : rank <= Math.ceil(total * 0.5) ? "Mid Tier" : "Lagging";
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.surfaceAlt} 0%, ${C.surface} 100%)`,
      border: `2px solid ${color}`, borderRadius: 14, padding: "16px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16
    }}>
      <div>
        <div style={{ fontSize: 11, color: C.textThird, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>
          Sector Rank · {sector}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 52, fontWeight: 900, color, lineHeight: 1, fontFamily: "Georgia,serif" }}>#{rank}</span>
          <span style={{ fontSize: 18, color: C.textThird, fontWeight: 500 }}>/ {total}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <Badge label={label} color={color === "green" ? C.greenText : color === C.amber ? C.amberText : C.redText}
            bg={color === C.green ? C.greenLight : color === C.amber ? C.amberLight : C.redLight} size={12} />
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke={C.border} strokeWidth="6" />
          <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${(1 - rank / total) * 201} 201`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dasharray .6s ease" }} />
          <text x="40" y="45" textAnchor="middle" fontSize="18" fontWeight="800" fill={color} fontFamily="Georgia,serif">
            {100 - parseInt(pct)}%
          </text>
        </svg>
        <div style={{ fontSize: 10, color: C.textThird, marginTop: -4 }}>Better than</div>
      </div>
    </div>
  );
}

// ─── Market Mood Indicator ────────────────────────────────────────────────────
function MarketMoodMeter() {
  const [mood, setMood] = useState(null);
  useEffect(() => {
    // Derive mood from Nifty change via yfinance proxy
    fetch(`${backendBase}/ohlc/NIFTY50`)
      .then(r => r.json())
      .then(d => {
        const candles = d.candles || [];
        if (candles.length >= 2) {
          const prev = candles[candles.length - 2].close;
          const curr = candles[candles.length - 1].close;
          const chg = ((curr - prev) / prev) * 100;
          setMood({ value: Math.min(Math.max(50 + chg * 10, 5), 95), chg: chg.toFixed(2), nifty: curr });
        }
      }).catch(() => setMood({ value: 55, chg: "0.00", nifty: null }));
  }, []);

  const val = mood?.value ?? 55;
  const angle = -90 + (val / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const nx = 70 + 52 * Math.cos(rad);
  const ny = 70 + 52 * Math.sin(rad);
  const label = val < 20 ? "Extreme Fear" : val < 40 ? "Fear" : val < 60 ? "Neutral" : val < 80 ? "Greed" : "Extreme Greed";
  const moodColor = val < 20 ? C.red : val < 40 ? "#f97316" : val < 60 ? C.amber : val < 80 ? C.green : "#15803d";

  return (
    <div style={{ ...S.card, padding: "16px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSecond, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
        Market Mood
      </div>
      <svg width="140" height="80" viewBox="0 0 140 80" style={{ display: "block", margin: "0 auto" }}>
        <defs>
          <linearGradient id="moodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={C.red} />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor={C.amber} />
            <stop offset="75%" stopColor={C.green} />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>
        <path d="M 18,70 A 52,52 0 0 1 122,70" fill="none" stroke={C.border} strokeWidth="12" strokeLinecap="round" />
        <path d="M 18,70 A 52,52 0 0 1 122,70" fill="none" stroke="url(#moodGrad)" strokeWidth="10" strokeLinecap="round" />
        <line x1="70" y1="70" x2={nx.toFixed(1)} y2={ny.toFixed(1)}
          stroke={C.textPrimary} strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: "all .6s ease" }} />
        <circle cx="70" cy="70" r="5" fill={C.textPrimary} />
        <text x="70" y="58" textAnchor="middle" fontSize="11" fontWeight="800" fill={moodColor}>{label}</text>
      </svg>
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: moodColor }}>{val.toFixed(0)}</span>
        <span style={{ fontSize: 11, color: C.textThird, marginLeft: 6 }}>/ 100</span>
        {mood?.chg && <div style={{ fontSize: 11, color: parseFloat(mood.chg) >= 0 ? C.green : C.red, fontWeight: 600, marginTop: 2 }}>
          Nifty {parseFloat(mood.chg) >= 0 ? "+" : ""}{mood.chg}%
        </div>}
      </div>
    </div>
  );
}

// ─── Trending Stocks ──────────────────────────────────────────────────────────
function TrendingStocks({ onSelectStock }) {
  const [stocks, setStocks] = useState([]);
  const [tab, setTab] = useState("gainers");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t) => {
    setLoading(true);
    try {
      const r = await fetch(`${backendBase}/trending?type=${t}`);
      const d = await r.json();
      setStocks(d.stocks || []);
    } catch {
      // Fallback: fetch from screener sorted by change
      try {
        const r = await fetch(`${backendBase}/screener?sort=${t === "gainers" ? "growth" : "rank"}&limit=8`);
        const d = await r.json();
        setStocks((d.stocks || []).slice(0, 8));
      } catch { }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  return (
    <div style={S.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>Trending Today</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["gainers", "Top Gainers"], ["active", "Most Active"]].map(([v, l]) => (
            <button key={v} onClick={() => { setTab(v); load(v); }} style={S.pill(tab === v)}>{l}</button>
          ))}
        </div>
      </div>
      {loading ? <div style={{ color: C.textThird, fontSize: 13, padding: "12px 0" }}>Loading...</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {stocks.slice(0, 8).map((s, i) => (
            <div key={s.ticker || i} onClick={() => onSelectStock(s.ticker)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`,
                background: C.surfaceAlt, transition: "background .12s"
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.greenLight}
              onMouseLeave={e => e.currentTarget.style.background = C.surfaceAlt}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, background: C.green,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, color: "#fff"
                }}>{(s.ticker || "?")[0]}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{s.ticker}</div>
                  <div style={{ fontSize: 11, color: C.textThird }}>{s.sector || s.name?.split(" ").slice(0, 2).join(" ")}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
                  {s.cmp ? `₹${s.cmp}` : "-"}
                </div>
                {s.growth5Y && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: s.growth5Y > 0 ? C.green : C.red }}>
                    {s.growth5Y > 0 ? "+" : ""}{s.growth5Y}%
                  </div>
                )}
              </div>
            </div>
          ))}
          {stocks.length === 0 && <div style={{ color: C.textThird, fontSize: 12 }}>No data available</div>}
        </div>
      )}
    </div>
  );
}

// ─── Search with Suggestions ──────────────────────────────────────────────────
function SearchBar({ onSearch, onSelectStock }) {
  const [query, setQuery] = useState("VBL");
  const [suggs, setSuggs] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  const fetchSuggs = useCallback(async (q) => {
    if (!q || q.length < 1) { setSuggs([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`${backendBase}/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setSuggs(d || []);
    } catch { setSuggs([]); }
    finally { setLoading(false); }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase();
    setQuery(val);
    setShowSugg(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggs(val), 200);
  };

  const handleSelect = (ticker) => {
    setQuery(ticker);
    setShowSugg(false);
    setSuggs([]);
    onSelectStock(ticker);
  };

  const handleSearch = () => {
    setShowSugg(false);
    onSearch(query);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSugg(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => { if (query.length > 0) setShowSugg(true); }}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Search NSE symbol — SBI, TCS, RELIANCE..."
          style={{
            flex: 1, background: C.surfaceAlt, border: `1.5px solid ${C.border}`,
            borderRadius: 10, padding: "11px 16px", color: C.textPrimary,
            fontSize: 14, outline: "none", fontFamily: "Inter,sans-serif",
            transition: "border .15s"
          }}
          onFocus={e => e.target.style.borderColor = C.green}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        <button style={S.greenBtn} onClick={handleSearch}>Search</button>
      </div>

      {/* Suggestions dropdown */}
      {showSugg && (suggs.length > 0 || loading) && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 60,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden"
        }}>
          {loading && <div style={{ padding: "10px 14px", fontSize: 12, color: C.textThird }}>Searching...</div>}
          {suggs.slice(0, 8).map((s, i) => (
            <div key={i} onMouseDown={() => handleSelect(s.ticker)}
              style={{
                padding: "10px 14px", cursor: "pointer", borderBottom: i < suggs.length - 1 ? `1px solid ${C.border}` : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "background .1s"
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.greenLight}
              onMouseLeave={e => e.currentTarget.style.background = C.surface}>
              <div>
                <span style={{ fontWeight: 700, color: C.green, fontSize: 13 }}>{s.ticker}</span>
                <span style={{ fontSize: 12, color: C.textSecond, marginLeft: 8 }}>{s.name}</span>
              </div>
              <span style={{ fontSize: 11, color: C.textThird }}>{s.exchange || "NSE"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sector Screener ──────────────────────────────────────────────────────────
function Screener({ onSelectStock }) {
  const [sectors, setSectors] = useState([]);
  const [sector, setSector] = useState("");
  const [stocks, setStocks] = useState([]);
  const [sortBy, setSortBy] = useState("rank");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetch(`${backendBase}/screener`)
      .then(r => r.json())
      .then(d => {
        // Filter out empty/Others, sort by count desc
        const secs = (d.sectors || [])
          .filter(s => s.sector && s.sector !== "" && s.count > 0)
          .sort((a, b) => b.count - a.count);
        setSectors(secs);
      });
  }, []);

  const loadSector = async (s, sort = sortBy, p = 0) => {
    if (!s) return;
    setLoading(true);
    try {
      const r = await fetch(`${backendBase}/screener?sector=${encodeURIComponent(s)}&sort=${sort}&limit=200`);
      const d = await r.json();
      setStocks(d.stocks || []);
      setPage(p);
    } finally { setLoading(false); }
  };

  const handleSector = (s) => { setSector(s); loadSector(s); };
  const handleSort = (s) => { setSortBy(s); loadSector(sector, s); };

  const pageStocks = stocks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(stocks.length / PAGE_SIZE);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, marginBottom: 4 }}>Sector Screener</div>
      <div style={{ fontSize: 12, color: C.textThird, marginBottom: 14 }}>
        {sectors.reduce((a, s) => a + s.count, 0).toLocaleString()} stocks across {sectors.length} sectors
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {sectors.map(s => (
          <button key={s.sector} onClick={() => handleSector(s.sector)} style={S.pill(sector === s.sector)}>
            {s.sector}
            <span style={{ fontSize: 10, marginLeft: 4, opacity: .6 }}>({s.count})</span>
          </button>
        ))}
      </div>

      {sector && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.textThird }}>Sort:</span>
            {[["rank", "Rank"], ["pe", "P/E ↑"], ["pe_desc", "P/E ↓"], ["profit", "Profit"], ["growth", "Growth"], ["debt", "Low Debt"]].map(([v, l]) => (
              <button key={v} onClick={() => handleSort(v)} style={{ ...S.pill(sortBy === v), padding: "4px 10px", fontSize: 11 }}>{l}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: C.textThird, padding: 24, textAlign: "center", fontSize: 13 }}>Loading {sector} stocks...</div>
          ) : (
            <>
              <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Inter,sans-serif" }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["#", "Ticker", "Company", "CMP", "P/E", "D/E", "Net Profit", "5Y Growth", "52W H", "52W L", "Rank"].map(h => (
                        <th key={h} style={{
                          padding: "10px 12px", textAlign: "left", fontWeight: 700,
                          color: C.textSecond, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageStocks.map((s, i) => {
                      const rowN = page * PAGE_SIZE + i + 1;
                      return (
                        <tr key={s.ticker} onClick={() => onSelectStock(s.ticker)}
                          style={{
                            cursor: "pointer", borderBottom: `1px solid ${C.border}`,
                            backgroundColor: i % 2 === 0 ? C.surface : C.surfaceAlt
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = C.greenLight}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = i % 2 === 0 ? C.surface : C.surfaceAlt}>
                          <td style={{ padding: "9px 12px", color: C.textThird, fontWeight: 600 }}>{rowN}</td>
                          <td style={{ padding: "9px 12px", color: C.green, fontWeight: 800 }}>{s.ticker}</td>
                          <td style={{ padding: "9px 12px", color: C.textPrimary, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name?.split(" ").slice(0, 3).join(" ")}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: C.textPrimary }}>{s.cmp ? `₹${s.cmp}` : "-"}</td>
                          <td style={{ padding: "9px 12px", color: s.pe < 25 ? C.green : s.pe > 60 ? C.red : C.textPrimary }}>{s.pe ? `${s.pe.toFixed(1)}x` : "-"}</td>
                          <td style={{ padding: "9px 12px", color: s.debtToEquity < 0.3 ? C.green : s.debtToEquity > 1 ? C.red : C.textPrimary }}>{s.debtToEquity ? s.debtToEquity.toFixed(2) : "-"}</td>
                          <td style={{ padding: "9px 12px", color: C.textPrimary }}>{s.netProfit ? `₹${Math.round(s.netProfit)}cr` : "-"}</td>
                          <td style={{ padding: "9px 12px", color: s.growth5Y > 15 ? C.green : s.growth5Y < 0 ? C.red : C.textPrimary }}>{s.growth5Y ? `${s.growth5Y}%` : "-"}</td>
                          <td style={{ padding: "9px 12px", color: C.green }}>{s.week52High ? `₹${s.week52High}` : "-"}</td>
                          <td style={{ padding: "9px 12px", color: C.amber }}>{s.week52Low ? `₹${s.week52Low}` : "-"}</td>
                          <td style={{ padding: "9px 12px" }}>
                            {s.rank && <Badge label={`#${s.rank}`} color={C.greenText} bg={C.greenLight} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {stocks.length === 0 && <div style={{ color: C.textThird, padding: 24, textAlign: "center" }}>No stocks found</div>}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button key={i} onClick={() => setPage(i)}
                      style={{ ...S.pill(page === i), padding: "4px 12px", fontSize: 12 }}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.textThird, textAlign: "center", marginTop: 6 }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, stocks.length)} of {stocks.length} stocks
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [priceRange, setPriceRange] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [view, setView] = useState("stock");

  const loadStock = useCallback(async (ticker) => {
    if (!ticker) return;
    try {
      const [stockRes, rangeRes] = await Promise.all([
        fetch(`${backendBase}/stock/${encodeURIComponent(ticker)}`),
        fetch(`${backendBase}/stock/${encodeURIComponent(ticker)}/pricerange`),
      ]);
      const stockData = await stockRes.json();
      const rangeData = rangeRes.ok ? await rangeRes.json() : null;
      setSelected(stockData);
      setPriceRange(rangeData);
      setActiveTab("overview");
      setView("stock");
    } catch (e) { console.error(e); }
  }, []);

  const handleSearch = async (query) => {
    if (!query) return;
    try {
      const res = await fetch(`${backendBase}/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data || []);
      if (data?.length > 0) loadStock(data[0].ticker);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadStock("VBL"); }, [loadStock]);

  const t = selected?.technicals || {};
  const f = selected?.fundamentals || {};
  const header = selected?.header || {};
  const peers = selected?.peers?.peers || [];
  const cmp = t.cmp || header.cmp || 0;
  const epsNum = parseFloat(fval(f.eps) || fval(f.epsBasic) || 0) || 0;
  const rank = selected?.peers?.rank;
  const total = selected?.peers?.totalPeers;

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setActiveTab(id)} style={{
      ...S.pill(activeTab === id), padding: "7px 16px"
    }}>{label}</button>
  );

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.textPrimary,
      fontFamily: "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fontSize: 14
    }}>

      {/* ── Header ── */}
      <header style={{
        height: 62, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", background: C.surface, position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 1px 6px rgba(0,0,0,0.07)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={38} />
          <div>
            <div style={{
              fontSize: 18, fontWeight: 800, color: C.textPrimary,
              fontFamily: "Georgia,serif", letterSpacing: "-.3px"
            }}>
              Stock<span style={{ color: C.green }}>Scope</span>
            </div>
            <div style={{ fontSize: 10, color: C.textThird, fontWeight: 500, letterSpacing: ".5px" }}>
              INVESTOR RESEARCH WORKSPACE
            </div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          {[["stock", "🔍 Stocks"], ["screener", "📊 Screener"], ["trending", "🔥 Trending"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={S.pill(view === v)}>{l}</button>
          ))}
        </nav>
        <div style={{ fontSize: 11, color: C.textThird }}>Educational use only</div>
      </header>

      <main style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* SCREENER VIEW */}
        {view === "screener" && (
          <div style={S.card}><Screener onSelectStock={loadStock} /></div>
        )}

        {/* TRENDING VIEW */}
        {view === "trending" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <TrendingStocks onSelectStock={loadStock} />
            <MarketMoodMeter />
          </div>
        )}

        {/* STOCK VIEW */}
        {view === "stock" && (
          <>
            {/* Search + Mood row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, marginBottom: 20 }}>
              <div style={S.card}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: C.textThird, marginBottom: 6, fontWeight: 600 }}>
                  Symbol Search
                </div>
                <SearchBar onSearch={handleSearch} onSelectStock={loadStock} />
                {results.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {results.map((s, i) => (
                      <button key={i} onClick={() => loadStock(s.ticker)} style={{
                        ...S.pill(selected?.header?.ticker === s.ticker),
                        padding: "5px 12px", fontSize: 12,
                      }}>
                        {s.ticker} <span style={{ opacity: .6, fontSize: 10 }}>— {s.name?.split(" ").slice(0, 2).join(" ")}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <div style={{
                    display: "flex", gap: 16, marginTop: 14, padding: "12px 16px",
                    background: C.surfaceAlt, borderRadius: 10, border: `1px solid ${C.border}`
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.textThird, marginBottom: 2 }}>CMP</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: cmp > 0 ? C.green : C.textPrimary }}>
                        {cmp > 0 ? fmt(cmp) : "—"}
                      </div>
                    </div>
                    <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 16 }}>
                      <div style={{ fontSize: 10, color: C.textThird, marginBottom: 2 }}>Sector</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{header.sector || "—"}</div>
                      <div style={{ fontSize: 11, color: C.textThird }}>{header.exchange || "NSE"} · {header.industry || "—"}</div>
                    </div>
                  </div>
                )}
              </div>
              <MarketMoodMeter />
            </div>

            {selected && (
              <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20 }}>
                <div>
                  {/* Stock header */}
                  <div style={{ ...S.card, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <div style={{ fontSize: 24, fontWeight: 900, color: C.textPrimary, fontFamily: "Georgia,serif" }}>{header.ticker}</div>
                          <Badge label={header.exchange || "NSE"} color={C.blueText} bg={C.blueLight} />
                          {header.sector && <Badge label={header.sector} color={C.greenText} bg={C.greenLight} />}
                        </div>
                        <div style={{ fontSize: 13, color: C.textSecond }}>{header.name}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 28, fontWeight: 900, color: C.green, fontFamily: "Georgia,serif" }}>{cmp > 0 ? fmt(cmp) : "—"}</div>
                        <div style={{ fontSize: 11, color: C.textThird }}>Last traded price</div>
                      </div>
                    </div>

                    {/* 52W range bar */}
                    {priceRange && cmp > 0 && priceRange.week52Low && priceRange.week52High && (() => {
                      const lo = priceRange.week52Low, hi = priceRange.week52High;
                      const pct = Math.min(100, Math.max(0, ((cmp - lo) / (hi - lo)) * 100));
                      return (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textThird, marginBottom: 4 }}>
                            <span>52W Low: {fmt(lo)}</span>
                            <span style={{ fontWeight: 600, color: C.textPrimary }}>CMP at {pct.toFixed(0)}%</span>
                            <span>52W High: {fmt(hi)}</span>
                          </div>
                          <div style={{ height: 6, background: C.border, borderRadius: 3, position: "relative" }}>
                            <div style={{
                              position: "absolute", left: 0, width: `${pct}%`, height: "100%",
                              background: C.green, borderRadius: 3, transition: "width .5s"
                            }} />
                            <div style={{
                              position: "absolute", left: `${pct}%`, top: -3, width: 12, height: 12,
                              borderRadius: "50%", background: C.green, border: "2px solid #fff",
                              transform: "translateX(-50%)", boxShadow: "0 0 0 1px #e2e8f0"
                            }} />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Rank Hero */}
                    <RankHero rank={rank} total={total} sector={header.sector} ticker={header.ticker} />

                    {/* 52W stats */}
                    {priceRange && (
                      <div style={S.grid4}>
                        {[["52W High", priceRange.week52High, C.green], ["52W Low", priceRange.week52Low, C.amber], ["All-Time High", priceRange.allTimeHigh, C.purple], ["All-Time Low", priceRange.allTimeLow, C.textThird]].map(([l, v, c]) => (
                          <div key={l} style={{ textAlign: "center", background: C.surfaceAlt, borderRadius: 8, padding: "10px 8px", border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 10, color: C.textThird, marginBottom: 2, fontWeight: 600 }}>{l}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{v ? fmt(v) : "NA"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tabs */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                    {tabBtn("overview", "Overview")}
                    {tabBtn("fundamentals", "Fundamentals")}
                    {tabBtn("technicals", "Technicals")}
                    {tabBtn("peers", "Peers")}
                  </div>

                  {/* Overview */}
                  {activeTab === "overview" && (
                    <div style={S.card}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecond, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".5px" }}>Snapshot</div>
                      <div style={S.grid2}>
                        {[
                          ["CMP", cmp > 0 ? fmt(cmp) : "NA", C.green],
                          ["Sector", header.sector || "NA", null],
                          ["Exchange", header.exchange || "NSE", null],
                          ["Industry", header.industry || "NA", null],
                          ["P/E Ratio", fval(f.peRatio), null],
                          ["ROCE %", fval(f.roce), null],
                          ["Debt/Equity", fval(f.debtToEquity), null],
                          ["Sector Rank", rank ? `#${rank} of ${total}` : "NA", C.green],
                        ].map(([l, v, c]) => <MetricBox key={l} label={l} value={v} color={c} />)}
                      </div>
                    </div>
                  )}

                  {/* Fundamentals */}
                  {activeTab === "fundamentals" && (
                    <div style={S.card}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecond, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".5px" }}>Fundamentals</div>
                      <div style={S.grid2}>
                        {[
                          ["P/E Ratio", fval(f.peRatio), f.peRatio?.context],
                          ["ROCE %", fval(f.roce), null],
                          ["Debt / Equity", fval(f.debtToEquity), null],
                          ["Net Profit (Cr)", fval(f.netProfit), null],
                          ["Free Cash Flow", fval(f.freeCashFlow), null],
                          ["5Yr Profit Growth", fval(f.profitGrowth5Y), null],
                          ["Pledged %", fval(f.pledgedPct), null],
                          ["52W High / Low", priceRange ? `${fmt(priceRange.week52High)} / ${fmt(priceRange.week52Low)}` : "NA", null],
                        ].map(([l, v, ctx]) => <MetricBox key={l} label={l} value={v} sub={ctx} />)}
                      </div>
                    </div>
                  )}

                  {/* Technicals */}
                  {activeTab === "technicals" && (
                    <div style={S.card}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecond, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".5px" }}>Technical Levels</div>
                      <div style={S.grid3}>
                        {[
                          ["CMP", cmp > 0 ? fmt(cmp) : "NA", C.green],
                          ["Pivot", tval(t.pivot) !== "NA" ? fmt(t.pivot) : "NA", C.amber],
                          ["R1", tval(t.r1) !== "NA" ? fmt(t.r1) : "NA", C.red],
                          ["R2", tval(t.r2) !== "NA" ? fmt(t.r2) : "NA", C.red],
                          ["S1", tval(t.s1) !== "NA" ? fmt(t.s1) : "NA", C.green],
                          ["S2", tval(t.s2) !== "NA" ? fmt(t.s2) : "NA", C.green],
                          ["EMA 20", tval(t.ema20) !== "NA" ? fmt(t.ema20) : "NA", C.purple],
                          ["EMA 50", tval(t.ema50) !== "NA" ? fmt(t.ema50) : "NA", C.purple],
                          ["EMA 100", tval(t.ema100) !== "NA" ? fmt(t.ema100) : "NA", C.purple],
                          ["52W High", priceRange?.week52High ? fmt(priceRange.week52High) : "NA", C.green],
                          ["52W Low", priceRange?.week52Low ? fmt(priceRange.week52Low) : "NA", C.amber],
                          ["ATH", priceRange?.allTimeHigh ? fmt(priceRange.allTimeHigh) : "NA", C.purple],
                        ].map(([l, v, c]) => (
                          <div key={l} style={{
                            background: C.surfaceAlt, borderRadius: 8, padding: "10px 12px",
                            border: `1px solid ${C.border}`, textAlign: "center"
                          }}>
                            <div style={{ fontSize: 10, color: C.textThird, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px" }}>{l}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                        <div style={{
                          padding: "10px 16px", background: C.surfaceAlt, borderBottom: `1px solid ${C.border}`,
                          fontSize: 11, color: C.textSecond, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px"
                        }}>
                          Candlestick · Pivot / Support / Resistance
                        </div>
                        <PivotChart defaultSymbol={header.ticker || "RELIANCE"} />
                      </div>
                    </div>
                  )}

                  {/* Peers */}
                  {activeTab === "peers" && (
                    <div style={S.card}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecond, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".5px" }}>
                        Sector Peers — {selected?.peers?.sector}
                      </div>
                      <div style={{ fontSize: 11, color: C.textThird, marginBottom: 12 }}>
                        Ranked by composite score
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {peers.slice(0, 12).map((p, i) => (
                          <div key={i} onClick={() => loadStock(p.ticker)}
                            style={{
                              background: p.ticker === header.ticker ? C.greenLight : C.surfaceAlt,
                              borderRadius: 8, padding: "10px 14px",
                              border: `1px solid ${p.ticker === header.ticker ? C.green : C.border}`,
                              display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.greenLight}
                            onMouseLeave={e => e.currentTarget.style.background = p.ticker === header.ticker ? C.greenLight : C.surfaceAlt}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{
                                fontSize: 18, fontWeight: 900, color: p.rank <= 3 ? C.green : C.textThird,
                                fontFamily: "Georgia,serif", minWidth: 36
                              }}>#{p.rank}</span>
                              <div>
                                <div style={{ fontWeight: 700, color: p.ticker === header.ticker ? C.greenDark : C.textPrimary }}>{p.ticker}</div>
                                <div style={{ fontSize: 11, color: C.textSecond }}>{p.name?.split(" ").slice(0, 3).join(" ")}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", fontSize: 12, color: C.textSecond }}>
                              {p.cmp && <div style={{ fontWeight: 700, color: C.textPrimary }}>₹{p.cmp}</div>}
                              {p.pe && <div>P/E {p.pe.toFixed(1)}x</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT PANEL — single FairValuePanel */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <FairValuePanel cmp={cmp > 0 ? cmp : 500} eps={epsNum > 0 ? epsNum : 10} ticker={header.ticker || ""} />
                  <TrendingStocks onSelectStock={loadStock} />

                  {/* Price position card */}
                  {priceRange && cmp > 0 && (
                    <div style={S.card}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSecond, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
                        Price Position
                      </div>
                      {[["vs 52W High", priceRange.week52High, C.green], ["vs 52W Low", priceRange.week52Low, C.amber], ["vs ATH", priceRange.allTimeHigh, C.purple]].map(([l, ref, c]) => {
                        if (!ref || !cmp) return null;
                        const pct = (((cmp - ref) / ref) * 100).toFixed(1);
                        return (
                          <div key={l} style={{
                            display: "flex", justifyContent: "space-between",
                            fontSize: 13, marginBottom: 8, alignItems: "center"
                          }}>
                            <span style={{ color: C.textSecond }}>{l}</span>
                            <span style={{
                              fontWeight: 700, padding: "3px 10px", borderRadius: 6, fontSize: 12,
                              background: parseFloat(pct) >= 0 ? C.greenLight : C.redLight,
                              color: parseFloat(pct) >= 0 ? C.greenText : C.redText
                            }}>
                              {parseFloat(pct) >= 0 ? "+" : ""}{pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pros & Cons + Checklist */}
                  <div style={{ ...S.card, background: C.surface }}>
                    <div style={{
                      fontSize: 12, fontWeight: 800, color: C.textPrimary, marginBottom: 12,
                      textTransform: "uppercase", letterSpacing: ".5px"
                    }}>
                      Before You Invest
                    </div>

                    {/* Pros */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, color: C.greenText,
                        background: C.greenLight, borderRadius: 6, padding: "4px 10px",
                        display: "inline-block", marginBottom: 8
                      }}>✓ Why stocks can be great</div>
                      {[
                        "Long-term wealth creation — equity beats inflation over 10+ years",
                        "Dividend income — some stocks pay regular cash to shareholders",
                        "Liquidity — buy/sell anytime on NSE/BSE",
                        "Part-ownership of a real business you believe in",
                        "Compounding — reinvested returns grow exponentially over time",
                      ].map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                          <span style={{ color: C.green, fontWeight: 700, fontSize: 13, marginTop: 1 }}>+</span>
                          <span style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.6 }}>{p}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 12 }} />

                    {/* Cons */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, color: C.redText,
                        background: C.redLight, borderRadius: 6, padding: "4px 10px",
                        display: "inline-block", marginBottom: 8
                      }}>✗ Risks to know first</div>
                      {[
                        "Market volatility — prices can drop 30–50% even in good companies",
                        "Requires patience — short-term thinking often leads to losses",
                        "Business risk — poor management or sector disruption can destroy value",
                        "Emotional bias — fear and greed are the investor's worst enemies",
                        "No guaranteed returns — unlike FDs, equity has no assured income",
                      ].map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                          <span style={{ color: C.red, fontWeight: 700, fontSize: 13, marginTop: 1 }}>−</span>
                          <span style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.6 }}>{p}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 12 }} />

                    {/* Checklist */}
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: C.blueText,
                      background: C.blueLight, borderRadius: 6, padding: "4px 10px",
                      display: "inline-block", marginBottom: 8
                    }}>✓ Your pre-buy checklist</div>
                    {[
                      "Is earnings stable for last 5 years?",
                      "Is debt-to-equity below 1?",
                      "Is ROCE above 15%?",
                      "Is CMP below or near fair value?",
                      "Have you read the last annual report?",
                    ].map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                        <span style={{ color: C.blue, fontWeight: 700, fontSize: 12, marginTop: 1 }}>☐</span>
                        <span style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.6 }}>{p}</span>
                      </div>
                    ))}

                    <div style={{
                      marginTop: 10, fontSize: 10, color: C.textThird, lineHeight: 1.5,
                      borderTop: `1px solid ${C.border}`, paddingTop: 8
                    }}>
                      Data for educational purposes only. Not SEBI registered investment advice.
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
