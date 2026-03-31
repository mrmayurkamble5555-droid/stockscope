// FairValuePanel.js
// Auto-fetches all fundamental data from Yahoo Finance via backend proxy
// Uses 3-method weighted fair value like a real equity analyst

import React, { useState, useEffect, useCallback } from 'react';

const BACKEND = "http://localhost:3001/api/v1";

const C = {
  green:'#16a34a', greenDark:'#15803d', greenLight:'#dcfce7', greenText:'#14532d',
  amber:'#d97706', amberLight:'#fef3c7', amberText:'#78350f',
  red:'#dc2626',   redLight:'#fee2e2',   redText:'#7f1d1d',
  blue:'#2563eb',  blueLight:'#eff6ff',  blueText:'#1e3a8a',
  purple:'#7c3aed',purpleLight:'#f5f3ff',purpleText:'#4c1d95',
  border:'#e2e8f0', bg:'#f8fafc', surface:'#ffffff',
  textPrimary:'#0f172a', textSecond:'#475569', textThird:'#94a3b8',
};

const fmtINR = (v) => v && !isNaN(v) ? '₹' + Math.round(v).toLocaleString('en-IN') : '—';
const fmtNum = (v,d=2) => v && !isNaN(v) ? parseFloat(v).toFixed(d) : '—';
const pct = (a,b) => b ? (((a-b)/b)*100).toFixed(1) : null;

// ── Fetch fundamentals from Yahoo Finance via backend proxy ──────────────────
async function fetchFundamentals(ticker) {
  const sym = ticker.toUpperCase().endsWith('.NS') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.NS`;

  // Yahoo Finance v10 quoteSummary — all fundamental modules in one call
  const url = `${BACKEND}/fundamentals/${sym}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ── 3-Method Fair Value Engine ───────────────────────────────────────────────
function computeFairValue(data) {
  const { eps, bookValue, fcfPerShare, pe, industryPE, roe, growthRate, debtToEquity } = data;

  const results = {};
  let totalWeight = 0;
  let weightedSum = 0;

  // Method 1: PE Valuation — EPS × normalised Industry PE
  if (eps > 0 && industryPE > 0) {
    const normPE = Math.min(industryPE, 50); // cap at 50 to avoid euphoria
    results.pe = { value: eps * normPE, label: 'PE Valuation', weight: 40,
      desc: `EPS ₹${eps.toFixed(1)} × Industry PE ${normPE.toFixed(0)}x` };
    weightedSum += results.pe.value * 40;
    totalWeight += 40;
  }

  // Method 2: Graham Number — √(22.5 × EPS × Book Value)
  if (eps > 0 && bookValue > 0) {
    const graham = Math.sqrt(22.5 * eps * bookValue);
    results.graham = { value: graham, label: 'Graham Number', weight: 30,
      desc: `√(22.5 × EPS × Book Value ₹${bookValue.toFixed(0)})` };
    weightedSum += graham * 30;
    totalWeight += 30;
  }

  // Method 3: DCF Lite — FCF grown at estimated rate, discounted at 12%
  if (fcfPerShare > 0) {
    const g = Math.min(growthRate || 12, 25) / 100; // cap growth at 25%
    const r = 0.12; // required return
    const years = 10;
    let dcf = 0;
    for (let i = 1; i <= years; i++) {
      dcf += (fcfPerShare * Math.pow(1 + g, i)) / Math.pow(1 + r, i);
    }
    const terminalVal = (fcfPerShare * Math.pow(1 + g, years) * (1 + 0.04)) / ((r - 0.04) * Math.pow(1 + r, years));
    const total = dcf + terminalVal;
    results.dcf = { value: total, label: 'DCF (10yr)', weight: 30,
      desc: `FCF/share ₹${fcfPerShare.toFixed(0)}, growth ${(g*100).toFixed(0)}%, discount 12%` };
    weightedSum += total * 30;
    totalWeight += 30;
  }

  // Quality adjustments
  let qualityScore = 1.0;
  if (roe > 20)         qualityScore += 0.05;  // High ROE premium
  if (debtToEquity < 0.3) qualityScore += 0.05; // Low debt premium
  if (debtToEquity > 1.5) qualityScore -= 0.10; // High debt penalty

  const rawFair = totalWeight > 0 ? weightedSum / totalWeight : null;
  const fairValue = rawFair ? rawFair * qualityScore : null;

  return { fairValue, methods: results, qualityScore, totalWeight };
}

// ── Loading Animation ────────────────────────────────────────────────────────
function AnalysisLoader({ ticker }) {
  const steps = [
    "Fetching financial statements...",
    "Reading EPS & Book Value...",
    "Calculating Graham Number...",
    "Running DCF model...",
    "Scoring quality metrics...",
    "Computing fair value range...",
  ];
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    const t1 = setInterval(() => setStep(s => Math.min(s+1, steps.length-1)), 600);
    const t2 = setInterval(() => setDots(d => d.length < 3 ? d + '.' : ''), 400);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  return (
    <div style={{ padding:'20px 16px', fontFamily:'Inter,sans-serif' }}>
      {/* Animated chart bars */}
      <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:48, marginBottom:16, justifyContent:'center' }}>
        {[0.4,0.7,0.5,1,0.8,0.6,0.9,0.55,0.75,0.85].map((h,i)=>(
          <div key={i} style={{
            width:10, borderRadius:'3px 3px 0 0',
            background:i%3===0?C.green:i%3===1?C.blue:C.amber,
            animation:`barPulse 1.2s ease-in-out ${i*0.1}s infinite alternate`,
            height:`${h*100}%`,
          }}/>
        ))}
      </div>
      <style>{`
        @keyframes barPulse { from{opacity:.3;transform:scaleY(.6)} to{opacity:1;transform:scaleY(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <div style={{ textAlign:'center', marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.textPrimary, marginBottom:4 }}>
          Analysing {ticker}
        </div>
        <div style={{ fontSize:11, color:C.green, fontWeight:600 }}>
          {steps[step]}{dots}
        </div>
      </div>

      {/* Step progress */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {steps.map((s,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8,
            opacity: i <= step ? 1 : 0.25, transition:'opacity .3s',
            animation: i === step ? 'fadeIn .3s ease' : 'none' }}>
            <div style={{ width:14, height:14, borderRadius:'50%', flexShrink:0,
              background: i < step ? C.green : i === step ? C.blue : C.border,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {i < step && <span style={{ fontSize:9, color:'#fff', fontWeight:800 }}>✓</span>}
              {i === step && <div style={{ width:6, height:6, borderRadius:'50%',
                background:'#fff', animation:'spin .8s linear infinite' }}/>}
            </div>
            <span style={{ fontSize:11, color: i<=step ? C.textPrimary : C.textThird,
              fontWeight: i===step ? 600 : 400 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Method Breakdown Card ────────────────────────────────────────────────────
function MethodCard({ method, weight }) {
  const colors = {
    'PE Valuation': [C.blue, C.blueLight, C.blueText],
    'Graham Number': [C.purple, C.purpleLight, C.purpleText],
    'DCF (10yr)': [C.green, C.greenLight, C.greenText],
  };
  const [border, bg, text] = colors[method.label] || [C.border, C.bg, C.textSecond];
  return (
    <div style={{ background:bg, border:`1px solid ${border}33`, borderRadius:10,
      padding:'10px 12px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
        <div style={{ fontSize:11, fontWeight:700, color:text }}>{method.label}</div>
        <div style={{ fontSize:10, color:text, background:`${border}22`, borderRadius:4,
          padding:'1px 6px', fontWeight:600 }}>{weight}% wt</div>
      </div>
      <div style={{ fontSize:16, fontWeight:800, color:text, fontFamily:'Georgia,serif', marginBottom:3 }}>
        {fmtINR(method.value)}
      </div>
      <div style={{ fontSize:10, color:C.textThird, lineHeight:1.4 }}>{method.desc}</div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function FairValuePanel({ ticker = '', cmp = 0 }) {
  const [state, setState]   = useState('idle'); // idle | loading | done | error
  const [fvData, setFvData] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [err, setErr]       = useState('');

  const analyse = useCallback(async (sym) => {
    if (!sym) return;
    setState('loading');
    setErr('');
    try {
      const data = await fetchFundamentals(sym);
      const { fairValue, methods, qualityScore, totalWeight } = computeFairValue(data);
      setRawData(data);
      setFvData({ fairValue, methods, qualityScore, totalWeight,
        strongBuy: fairValue ? fairValue * 0.70 : null,
        buy:       fairValue ? fairValue * 0.85 : null,
        hold:      fairValue ? fairValue * 1.10 : null,
        avoid:     fairValue ? fairValue * 1.20 : null,
      });
      setState('done');
    } catch(e) {
      setErr('Could not fetch data. Check backend connection.');
      setState('error');
    }
  }, []);

  // Auto-run when ticker changes
  useEffect(() => {
    if (ticker) analyse(ticker);
    else setState('idle');
  }, [ticker, analyse]);

  // Verdict
  const getVerdict = () => {
    if (!fvData?.fairValue || !cmp) return null;
    const { fairValue, strongBuy, buy, hold, avoid } = fvData;
    if (cmp <= strongBuy) return { label:'Strong Buy', color:C.green,  bg:C.greenLight,  text:C.greenText, emoji:'🟢' };
    if (cmp <= buy)       return { label:'Buy',         color:C.green,  bg:C.greenLight,  text:C.greenText, emoji:'✅' };
    if (cmp <= hold)      return { label:'Fair Value',  color:C.amber,  bg:C.amberLight,  text:C.amberText, emoji:'🟡' };
    if (cmp <= avoid)     return { label:'Slightly Expensive', color:C.amber, bg:C.amberLight, text:C.amberText, emoji:'⚠️' };
    return { label:'Expensive', color:C.red, bg:C.redLight, text:C.redText, emoji:'🔴' };
  };

  const verdict = getVerdict();
  const upside  = fvData?.fairValue && cmp ? pct(fvData.fairValue, cmp) : null;
  const cmpPct  = fvData?.fairValue && cmp
    ? Math.min(100, Math.max(0, (cmp / (fvData.fairValue * 1.5)) * 100))
    : 50;

  return (
    <div style={{ background:C.surface, borderRadius:14, border:`1px solid ${C.border}`,
      fontFamily:'Inter,-apple-system,sans-serif', boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
      overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.border}`,
        background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#f8fafc', letterSpacing:'.2px' }}>
              Equity Valuation Engine
            </div>
            <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>
              3-method weighted fair value analysis
            </div>
          </div>
          {ticker && (
            <div style={{ fontSize:12, fontWeight:700, color:C.green,
              background:'rgba(22,163,74,0.15)', border:'1px solid rgba(22,163,74,0.3)',
              borderRadius:6, padding:'4px 10px' }}>{ticker}</div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding:'14px 16px' }}>

        {/* IDLE */}
        {state === 'idle' && (
          <div style={{ padding:'20px 0', textAlign:'center', color:C.textThird, fontSize:12 }}>
            Search a stock to run valuation analysis
          </div>
        )}

        {/* LOADING */}
        {state === 'loading' && <AnalysisLoader ticker={ticker}/>}

        {/* ERROR */}
        {state === 'error' && (
          <div style={{ padding:16, textAlign:'center' }}>
            <div style={{ color:C.red, fontSize:12, marginBottom:10 }}>{err}</div>
            <button onClick={()=>analyse(ticker)}
              style={{ padding:'6px 16px', borderRadius:8, border:`1px solid ${C.green}`,
                color:C.green, background:'transparent', cursor:'pointer', fontSize:12 }}>
              Retry
            </button>
          </div>
        )}

        {/* DONE */}
        {state === 'done' && fvData && (
          <>
            {/* Fair Value Hero */}
            <div style={{ background: verdict?.bg || C.greenLight,
              border:`2px solid ${verdict?.color || C.green}44`,
              borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10, color:C.textThird, fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4 }}>
                    Intrinsic Fair Value
                  </div>
                  <div style={{ fontSize:32, fontWeight:900, color:C.green,
                    fontFamily:'Georgia,serif', lineHeight:1 }}>
                    {fmtINR(fvData.fairValue)}
                  </div>
                  {upside && (
                    <div style={{ fontSize:12, fontWeight:600, marginTop:4,
                      color: parseFloat(upside) > 0 ? C.greenDark : C.red }}>
                      {parseFloat(upside) > 0 ? '▲' : '▼'} {Math.abs(upside)}% {parseFloat(upside) > 0 ? 'upside' : 'overvalued'} vs CMP {fmtINR(cmp)}
                    </div>
                  )}
                </div>
                {verdict && (
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:20, marginBottom:2 }}>{verdict.emoji}</div>
                    <div style={{ fontSize:12, fontWeight:800, color:verdict.text,
                      background:C.surface, border:`1px solid ${verdict.color}44`,
                      borderRadius:8, padding:'5px 12px', whiteSpace:'nowrap' }}>
                      {verdict.label}
                    </div>
                  </div>
                )}
              </div>

              {/* Quality badge */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {fvData.qualityScore > 1.05 && (
                  <span style={{ fontSize:10, fontWeight:600, color:C.greenText,
                    background:C.surface, border:`1px solid ${C.green}33`,
                    borderRadius:4, padding:'2px 8px' }}>
                    Quality Premium Applied +{((fvData.qualityScore-1)*100).toFixed(0)}%
                  </span>
                )}
                {fvData.qualityScore < 0.95 && (
                  <span style={{ fontSize:10, fontWeight:600, color:C.redText,
                    background:C.surface, border:`1px solid ${C.red}33`,
                    borderRadius:4, padding:'2px 8px' }}>
                    Risk Discount Applied {((fvData.qualityScore-1)*100).toFixed(0)}%
                  </span>
                )}
                <span style={{ fontSize:10, fontWeight:600, color:C.blueText,
                  background:C.surface, border:`1px solid ${C.blue}33`,
                  borderRadius:4, padding:'2px 8px' }}>
                  {Object.keys(fvData.methods).length} methods used
                </span>
              </div>
            </div>

            {/* Buy Range */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.textSecond,
                textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                Price Action Zones
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  ['Strong Buy',  fvData.strongBuy, C.green,  C.greenLight,  C.greenText,  'Below this = deep value'],
                  ['Buy Zone',    fvData.buy,        '#65a30d','#f0fdf4',    '#365314',    '15% margin of safety'],
                  ['Fair Value',  fvData.fairValue,  C.amber,  C.amberLight, C.amberText,  'Hold zone — fairly priced'],
                  ['Avoid Zone',  fvData.avoid,      C.red,    C.redLight,   C.redText,    'Above this = expensive'],
                ].map(([label, val, border, bg, text, hint])=>(
                  <div key={label} style={{ background:bg, border:`1px solid ${border}33`,
                    borderRadius:9, padding:'9px 11px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:text,
                      textTransform:'uppercase', letterSpacing:'.3px', marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:17, fontWeight:900, color:text,
                      fontFamily:'Georgia,serif', marginBottom:2 }}>{fmtINR(val)}</div>
                    <div style={{ fontSize:10, color:C.textThird }}>{hint}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CMP Gauge bar */}
            {cmp > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ position:'relative', height:10, borderRadius:5, marginBottom:6,
                  background:`linear-gradient(to right, ${C.green}, #65a30d, ${C.amber}, ${C.red})` }}>
                  <div style={{ position:'absolute', left:`${cmpPct}%`, top:-5,
                    width:20, height:20, borderRadius:'50%', background:C.textPrimary,
                    border:'3px solid #fff', boxShadow:'0 0 0 1.5px #94a3b8',
                    transform:'translateX(-50%)', transition:'left .5s ease',
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:C.textThird }}>
                  <span>Deep Value</span><span>Fair</span><span>Expensive</span>
                </div>
                {verdict && (
                  <div style={{ textAlign:'center', marginTop:5, fontSize:12,
                    fontWeight:700, color:verdict.text }}>
                    {fmtINR(cmp)} → {verdict.label}
                  </div>
                )}
              </div>
            )}

            {/* Method Breakdown */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.textSecond,
                textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                Valuation Methods
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {Object.entries(fvData.methods).map(([key, method])=>(
                  <MethodCard key={key} method={method} weight={method.weight}/>
                ))}
              </div>
            </div>

            {/* Key Fundamentals Used */}
            {rawData && (
              <div style={{ background:C.bg, borderRadius:10, padding:'12px 14px',
                border:`1px solid ${C.border}`, marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.textSecond,
                  textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>
                  Data Used in Analysis
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {[
                    ['EPS (TTM)',       rawData.eps>0         ? `₹${fmtNum(rawData.eps,1)}`        : '—'],
                    ['Book Value/sh',   rawData.bookValue>0   ? `₹${fmtNum(rawData.bookValue,0)}`  : '—'],
                    ['FCF/share',       rawData.fcfPerShare>0 ? `₹${fmtNum(rawData.fcfPerShare,0)}`: '—'],
                    ['Industry PE',     rawData.industryPE>0  ? `${fmtNum(rawData.industryPE,1)}x` : '—'],
                    ['ROE %',           rawData.roe>0         ? `${fmtNum(rawData.roe,1)}%`        : '—'],
                    ['Debt/Equity',     rawData.debtToEquity>=0?`${fmtNum(rawData.debtToEquity,2)}`:'—'],
                    ['Revenue Growth',  rawData.growthRate>0  ? `${fmtNum(rawData.growthRate,1)}%` : '—'],
                    ['Current PE',      rawData.pe>0          ? `${fmtNum(rawData.pe,1)}x`         : '—'],
                  ].map(([label, val])=>(
                    <div key={label} style={{ display:'flex', justifyContent:'space-between',
                      fontSize:11, padding:'4px 0', borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ color:C.textThird }}>{label}</span>
                      <span style={{ fontWeight:700, color:C.textPrimary }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:10, color:C.textThird, marginTop:8 }}>
                  Source: Yahoo Finance · Auto-fetched
                </div>
              </div>
            )}

            <div style={{ fontSize:10, color:C.textThird, lineHeight:1.5 }}>
              Weighted: PE(40%) + Graham(30%) + DCF(30%) · Quality-adjusted · For educational use only
            </div>
          </>
        )}
      </div>
    </div>
  );
}
