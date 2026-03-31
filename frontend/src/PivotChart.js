// PivotChart.js — StockScope Technical Section
// Fix: candlestick color must be plain strings, not objects

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Chart,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LineController,
} from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';

Chart.register(
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LineController,
  CandlestickController,
  CandlestickElement
);

const BACKEND = "http://localhost:3001/api/v1";

async function fetchStockData(symbol) {
  const res = await fetch(`${BACKEND}/ohlc/${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return await res.json();
}

const styles = {
  wrapper: { background: '#0f172a', padding: '16px', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 14, fontWeight: 600, color: '#e5e7eb' },
  subtitle: { fontSize: 11, color: '#64748b', marginLeft: 8 },
  selectorRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  selectorBtn: (active) => ({
    padding: '4px 12px', borderRadius: 20,
    border: `1px solid ${active ? '#22c55e' : 'rgba(148,163,184,0.3)'}`,
    background: active ? 'rgba(34,197,94,0.1)' : 'transparent',
    color: active ? '#22c55e' : '#64748b',
    fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer',
  }),
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 },
  metricCard: { background: '#020617', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(30,64,175,0.3)' },
  metricLabel: { fontSize: 10, color: '#64748b', marginBottom: 2 },
  metricValue: (color) => ({ fontSize: 13, fontWeight: 700, color: color || '#e5e7eb' }),
  legend: { display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' },
  legendLine: (color, dashed) => ({
    width: 18, height: 2,
    background: dashed ? 'transparent' : color,
    borderTop: dashed ? `2px dashed ${color}` : 'none',
    borderRadius: 1,
  }),
  chartContainer: { position: 'relative', width: '100%', height: 300 },
  loading: { height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  error: { height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', background: 'transparent', cursor: 'pointer', fontSize: 12 },
};

const QUICK_STOCKS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN'];
const fmt = (v) => '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function PivotChart({ defaultSymbol = 'RELIANCE' }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const [selected, setSelected] = useState(defaultSymbol);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (defaultSymbol && defaultSymbol !== selected) setSelected(defaultSymbol);
  }, [defaultSymbol]); // eslint-disable-line

  const loadData = useCallback(async (symbol) => {
    setLoading(true); setError('');
    try { setData(await fetchStockData(symbol)); }
    catch (e) { setError(`Failed to load ${symbol}. Is backend running?`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(selected); }, [selected, loadData]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const { candles, levels, cmp } = data;
    const n = candles.length;
    const tickLabels = candles.map(c => c.date);

    const allVals = [...candles.flatMap(c => [c.high, c.low]), levels.r2, levels.s2, cmp];
    const yMin = Math.min(...allVals) * 0.994;
    const yMax = Math.max(...allVals) * 1.006;

    // ── Colour each candle individually via per-point data ──────────────────
    // chartjs-chart-financial v0.1.x needs backgroundColor/borderColor
    // as plain strings on the dataset OR per-point via a parsing function.
    // Safest: colour each bar inside the data array.
    const candleData = candles.map((c, i) => {
      const bull = c.close >= c.open;
      return {
        x: i,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        // per-element colours (supported in chartjs-chart-financial)
        color:            bull ? '#22c55e' : '#ef4444',
        borderColor:      bull ? '#22c55e' : '#ef4444',
        backgroundColor:  bull ? '#22c55e' : '#ef4444',
      };
    });

    const hline = (val, color, dash, label) => ({
      type: 'line', label,
      data: Array(n).fill(null).map((_, i) => ({ x: i, y: val })),
      borderColor: color, borderWidth: dash ? 1.5 : 2,
      borderDash: dash ? [6, 4] : [], pointRadius: 0, tension: 0, order: 1,
      parsing: false,
    });

    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels: candles.map((_, i) => i),
        datasets: [
          {
            type: 'candlestick',
            label: selected,
            data: candleData,
            // plain string fallbacks (required by some versions)
            color:           '#22c55e',
            borderColor:     '#22c55e',
            backgroundColor: '#22c55e',
            order: 2,
            parsing: false,
          },
          hline(levels.r2,    '#ef4444', true,  'R2'),
          hline(levels.r1,    '#ef4444', true,  'R1'),
          hline(levels.pivot, '#E6850A', true,  'Pivot'),
          hline(cmp,          '#3b82f6', false, 'CMP'),
          hline(levels.s1,    '#22c55e', true,  'S1'),
          hline(levels.s2,    '#22c55e', true,  'S2'),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(2,6,23,0.95)',
            borderColor: 'rgba(30,64,175,0.5)', borderWidth: 1,
            titleColor: '#94a3b8', bodyColor: '#e5e7eb',
            callbacks: {
              title: (items) => tickLabels[items[0]?.dataIndex] || '',
              label: (ctx) => {
                const d = ctx.raw;
                if (d && d.o !== undefined)
                  return `O:${d.o}  H:${d.h}  L:${d.l}  C:${d.c}`;
                return `${ctx.dataset.label}: ${fmt(d?.y ?? ctx.raw)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            ticks: {
              color: '#475569', font: { size: 10 }, maxRotation: 0,
              callback: (val) => tickLabels[val] || '',
              autoSkip: true, maxTicksLimit: 8,
              stepSize: 1,
            },
            grid: { color: 'rgba(30,64,175,0.1)' },
            border: { color: 'rgba(30,64,175,0.3)' },
            min: -0.5,
            max: n - 0.5,
          },
          y: {
            position: 'right', min: yMin, max: yMax,
            ticks: {
              color: '#475569', font: { size: 10 },
              callback: (v) => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
            },
            grid: { color: 'rgba(30,64,175,0.1)' },
            border: { color: 'rgba(30,64,175,0.3)' },
          },
        },
      },
    });

    // Draw right-axis level badges after each render
    const originalDraw = chartRef.current.draw.bind(chartRef.current);
    chartRef.current.draw = function () {
      originalDraw();
      const chart = chartRef.current;
      if (!chart) return;
      const ctx2 = chart.ctx;
      const yScale = chart.scales.y;
      const xRight = chart.chartArea.right;
      [
        { val: levels.r2,    label: 'R2',  color: '#ef4444' },
        { val: levels.r1,    label: 'R1',  color: '#ef4444' },
        { val: levels.pivot, label: 'P',   color: '#E6850A' },
        { val: cmp,          label: 'CMP', color: '#3b82f6' },
        { val: levels.s1,    label: 'S1',  color: '#22c55e' },
        { val: levels.s2,    label: 'S2',  color: '#22c55e' },
      ].forEach(({ val, label, color }) => {
        const y = yScale.getPixelForValue(val);
        ctx2.save();
        const w = ctx2.measureText(label).width + 10;
        ctx2.fillStyle = color;
        ctx2.beginPath();
        ctx2.roundRect
          ? ctx2.roundRect(xRight + 2, y - 9, w, 18, 3)
          : ctx2.rect(xRight + 2, y - 9, w, 18);
        ctx2.fill();
        ctx2.fillStyle = '#fff';
        ctx2.font = '700 10px system-ui,sans-serif';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(label, xRight + 7, y);
        ctx2.restore();
      });
    };

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data, selected]);

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div>
          <span style={styles.title}>{selected}</span>
          <span style={styles.subtitle}>Pivot · Support · Resistance</span>
        </div>
        <div style={styles.selectorRow}>
          {QUICK_STOCKS.map(s => (
            <button key={s} style={styles.selectorBtn(s === selected)} onClick={() => setSelected(s)}>{s}</button>
          ))}
        </div>
      </div>

      {data && (
        <div style={styles.metricsGrid}>
          {[
            ['CMP',        fmt(data.cmp),                                              '#3b82f6'],
            ['Pivot',      fmt(data.levels.pivot),                                     '#E6850A'],
            ['Resistance', `R1: ${fmt(data.levels.r1)} · R2: ${fmt(data.levels.r2)}`, '#ef4444'],
            ['Support',    `S1: ${fmt(data.levels.s1)} · S2: ${fmt(data.levels.s2)}`, '#22c55e'],
          ].map(([label, value, color]) => (
            <div key={label} style={styles.metricCard}>
              <div style={styles.metricLabel}>{label}</div>
              <div style={styles.metricValue(color)}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.legend}>
        {[
          { color: '#22c55e', label: 'Bullish' },
          { color: '#ef4444', label: 'Bearish' },
          { color: '#E6850A', label: 'Pivot',  dashed: true },
          { color: '#ef4444', label: 'R1/R2',  dashed: true },
          { color: '#22c55e', label: 'S1/S2',  dashed: true },
          { color: '#3b82f6', label: 'CMP' },
        ].map(l => (
          <span key={l.label} style={styles.legendItem}>
            <span style={styles.legendLine(l.color, l.dashed)} />
            {l.label}
          </span>
        ))}
      </div>

      {loading && <div style={styles.loading}><span style={{ fontSize: 12 }}>Loading {selected}...</span></div>}
      {!loading && error && (
        <div style={styles.error}>
          <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>
          <button style={styles.retryBtn} onClick={() => loadData(selected)}>Retry</button>
        </div>
      )}
      {!loading && !error && <div style={styles.chartContainer}><canvas ref={canvasRef} /></div>}
    </div>
  );
}
