export function StockHeaderBlock({ header, peers, technicals }) {
  if (!header) return null;

  const t = technicals || {};

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "linear-gradient(135deg,#1e1b4b,#0f172a)",
        marginBottom: 24,
      }}
    >
      <h2 style={{ margin: 0 }}>
        {header.ticker} — {header.name}
      </h2>
      <p style={{ margin: "4px 0 8px 0", color: "#a5b4fc" }}>
        {header.sector} · {header.exchange}
      </p>
      <p style={{ margin: 0 }}>
        CMP: <strong>{t.cmp ?? "NA"}</strong> · Rank{" "}
        <strong>{peers.rank}</strong> / {peers.totalPeers}
      </p>
    </div>
  );
}

