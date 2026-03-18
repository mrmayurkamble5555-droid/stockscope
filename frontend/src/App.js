import { useEffect, useState } from "react";
import { StockHeaderBlock } from "./StockHeaderBlock";

function App() {
  const [query, setQuery] = useState("VBL");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // For now we use your backend test route
  const backendBase = "http://localhost:3001/api/v1";

  const search = async () => {
    try {
      const res = await fetch(
        `${backendBase}/test/stock/${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults([data]);
      setSelected(data);
      setActiveTab("overview");
    } catch (e) {
      console.error("Search error", e);
    }
  };

  const loadStock = async (ticker) => {
    try {
      const res = await fetch(
        `${backendBase}/test/stock/${encodeURIComponent(ticker)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelected(data);
      setActiveTab("overview");
    } catch (e) {
      console.error("Stock load error", e);
    }
  };

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const peersArr = selected?.peers?.peers || [];
  const topPeers = peersArr.slice(0, 5);

  const t = selected?.technicals || {};
  const f = selected?.fundamentals || {};
  const header = selected?.header || {
    ticker: query,
    name: "Demo Company",
    exchange: "NSE",
    sector: "Unknown",
    industry: "Unknown",
  };

  const primaryCardStyle = {
    background: "linear-gradient(135deg, #020617, #0f172a)",
    borderRadius: 16,
    padding: 20,
    border: "1px solid rgba(148,163,184,0.3)",
  };

  const subtleCardStyle = {
    backgroundColor: "#020617",
    borderRadius: 12,
    padding: 16,
    border: "1px solid rgba(30,64,175,0.6)",
  };

  const pillButton = {
    borderRadius: 999,
    padding: "8px 18px",
    border: "1px solid rgba(148,163,184,0.4)",
    backgroundColor: "transparent",
    color: "#e5e7eb",
    cursor: "pointer",
    fontWeight: 500,
  };

  const primaryButton = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    padding: "10px 22px",
    border: "none",
    background: "linear-gradient(135deg, #22c55e, #4ade80)",
    color: "#022c22",
    cursor: "pointer",
    fontWeight: 600,
    boxShadow: "0 10px 25px rgba(34,197,94,0.25)",
  };

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      style={{
        ...pillButton,
        backgroundColor: activeTab === id ? "#1e293b" : "transparent",
        borderColor:
          activeTab === id ? "rgba(148,163,184,0.8)" : "rgba(148,163,184,0.4)",
        color: activeTab === id ? "#f9fafb" : "#9ca3af",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #020617 0, #020617 40%, #020617 100%)",
        color: "#e5e7eb",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          height: 64,
          borderBottom: "1px solid rgba(30,64,175,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          background:
            "linear-gradient(90deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background:
                "radial-gradient(circle at 30% 0, #22c55e, #065f46)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              color: "#e5e7eb",
            }}
          >
            S
          </div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              StockScope
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#64748b",
                letterSpacing: 0.4,
              }}
            >
              Investor Research Workspace
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#64748b",
          }}
        >
          Data for educational use only – not investment advice.
        </div>
      </header>

      {/* Main layout */}
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {/* Search + key stats row */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 1.2fr)",
            gap: 24,
            marginBottom: 24,
          }}
        >
          {/* Left: search and selected stock card */}
          <div style={primaryCardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  Symbol search
                </div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  Find a company you track
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "#020617",
                  borderRadius: 999,
                  padding: "6px 14px",
                  border: "1px solid rgba(51,65,85,0.9)",
                }}
              >
                {/* Search icon */}
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "999px",
                    border: "2px solid #475569",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      width: 2,
                      height: 9,
                      backgroundColor: "#475569",
                      transform: "rotate(45deg)",
                      bottom: -4,
                      right: -3,
                      borderRadius: 999,
                    }}
                  />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value.toUpperCase())}
                  placeholder="Type NSE symbol, e.g. TCS, HDFCBANK"
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "#e5e7eb",
                    fontSize: 14,
                  }}
                />
              </div>

              <button style={primaryButton} onClick={search}>
                Search
              </button>
            </div>

            {/* Current selection summary */}
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
              Showing demo data for:{" "}
              <span style={{ color: "#e5e7eb", fontWeight: 600 }}>
                {header.ticker} · {header.name}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1.4fr)",
                gap: 16,
              }}
            >
              <div
                style={{
                  backgroundColor: "#020617",
                  borderRadius: 12,
                  padding: 14,
                  border: "1px solid rgba(30,64,175,0.5)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  Current price
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: "#f9fafb",
                    marginBottom: 2,
                  }}
                >
                  ₹{t.cmp ?? 2500}
                </div>
                <div style={{ fontSize: 12, color: "#22c55e" }}>
                  Live demo feed – not real market data
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "#020617",
                  borderRadius: 12,
                  padding: 14,
                  border: "1px solid rgba(30,64,175,0.5)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  Exchange & sector
                </div>
                <div style={{ fontSize: 14, marginBottom: 2 }}>
                  {header.exchange} · {header.sector}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {header.industry}
                </div>
              </div>
            </div>
          </div>

          {/* Right: trust card */}
          <div style={subtleCardStyle}>
            <div
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 1.2,
                color: "#64748b",
                marginBottom: 6,
              }}
            >
              Built for long-term investors
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              One screen to sanity‑check any stock idea.
            </div>
            <ul
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: "#9ca3af",
                paddingLeft: 18,
                marginBottom: 12,
              }}
            >
              <li>Clean layout focused on fundamentals first.</li>
              <li>No ads, no noise – just key ratios and levels.</li>
              <li>Transparent about data source and limitations.</li>
            </ul>
            <div
              style={{
                fontSize: 11,
                color: "#6b7280",
                borderTop: "1px dashed rgba(55,65,81,0.8)",
                paddingTop: 8,
              }}
            >
              Disclaimer: This is a research helper, not a SEBI‑registered
              advisory. Always do your own research before investing.
            </div>
          </div>
        </section>

        {/* Lower section: details */}
        {selected && (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 1.2fr)",
              gap: 24,
            }}
          >
            {/* Left: header + tabs */}
            <div style={primaryCardStyle}>
              <StockHeaderBlock
                header={selected.header || {}}
                peers={selected.peers || { peers: [] }}
                technicals={selected.technicals || {}}
              />

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 18,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                {tabBtn("overview", "Overview")}
                {tabBtn("fundamentals", "Fundamentals")}
                {tabBtn("technicals", "Technicals")}
                {tabBtn("peers", "Peers")}
              </div>

              {activeTab === "overview" && (
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                    Snapshot for long‑term view
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#9ca3af",
                      marginBottom: 12,
                    }}
                  >
                    Use this section as a quick checklist before you spend more
                    time on a stock. Look at earnings quality, leverage and
                    basic technical context.
                  </p>
                  <ul
                    style={{
                      fontSize: 13,
                      color: "#e5e7eb",
                      lineHeight: 1.7,
                    }}
                  >
                    <li>P/E Ratio: {f.peRatio?.value ?? "NA"}</li>
                    <li>ROCE %: {f.roce?.value ?? "NA"}</li>
                    <li>Debt / Equity: {f.debtToEquity?.value ?? "NA"}</li>
                    <li>
                      CMP vs Pivot: {t.cmp ?? "NA"} vs {t.pivot ?? "NA"}
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === "fundamentals" && (
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                    Fundamentals focus
                  </h3>
                  <ul
                    style={{
                      fontSize: 13,
                      color: "#e5e7eb",
                      lineHeight: 1.7,
                    }}
                  >
                    <li>P/E Ratio: {f.peRatio?.value ?? "NA"}</li>
                    <li>ROCE %: {f.roce?.value ?? "NA"}</li>
                    <li>Debt / Equity: {f.debtToEquity?.value ?? "NA"}</li>
                  </ul>
                </div>
              )}

              {activeTab === "technicals" && (
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                    Trading levels (demo)
                  </h3>
                  <ul
                    style={{
                      fontSize: 13,
                      color: "#e5e7eb",
                      lineHeight: 1.7,
                    }}
                  >
                    <li>CMP: {t.cmp ?? "NA"}</li>
                    <li>Pivot: {t.pivot ?? "NA"}</li>
                    <li>
                      R1 / R2: {t.r1 ?? "NA"} / {t.r2 ?? "NA"}
                    </li>
                    <li>
                      S1 / S2: {t.s1 ?? "NA"} / {t.s2 ?? "NA"}
                    </li>
                    <li>
                      EMA20 / 50 / 100: {t.ema20 ?? "NA"} / {t.ema50 ?? "NA"} /{" "}
                      {t.ema100 ?? "NA"}
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === "peers" && (
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                    Top 5 peers (demo)
                  </h3>
                  {topPeers.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#9ca3af" }}>
                      Peers data not available in this demo snapshot.
                    </p>
                  ) : (
                    <ol
                      style={{
                        fontSize: 13,
                        color: "#e5e7eb",
                        lineHeight: 1.7,
                      }}
                    >
                      {topPeers.map((p, i) => (
                        <li key={i}>
                          {p.rank ?? "-"}
                          {". "}
                          {p.ticker ?? "-"} — {p.name ?? "-"}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>

            {/* Right: side notes */}
            <div style={subtleCardStyle}>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>
                Notes for your checklist
              </h3>
              <ul
                style={{
                  fontSize: 13,
                  color: "#9ca3af",
                  lineHeight: 1.7,
                }}
              >
                <li>
                  Confirm business quality: stable earnings, clean balance
                  sheet.
                </li>
                <li>Cross‑check valuations with sector averages.</li>
                <li>Align position size with your risk and holding period.</li>
                <li>Always read at least the last 2–3 annual reports.</li>
              </ul>
              <div
                style={{
                  marginTop: 14,
                  fontSize: 11,
                  color: "#6b7280",
                }}
              >
                This workspace is designed to reduce noise and help you take
                calmer, more deliberate decisions – like a professional research
                notebook, not a trading game.
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
