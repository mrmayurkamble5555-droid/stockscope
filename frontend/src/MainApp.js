import { useEffect, useState, useRef, useCallback } from "react";
import PivotChart from "./PivotChart";
import FairValuePanel from "./FairValuePanel";

const backendBase = "http://localhost:3001/api/v1";

const fval = (m) => { if (!m) return "NA"; if (m.value!=null) return m.value; if (m.rawValue!=null) return m.rawValue; return "NA"; };
const tval = (v) => (v !== null && v !== undefined && v !== 0) ? v : "NA";
const fmt  = (v, prefix="₹") => v ? `${prefix}${parseFloat(v).toLocaleString("en-IN")}` : "NA";

const C = {
  bg:"#f4f6f8",surface:"#ffffff",surfaceAlt:"#f8fafc",border:"#e2e8f0",borderStrong:"#cbd5e1",
  green:"#16a34a",greenDark:"#15803d",greenLight:"#dcfce7",greenText:"#14532d",
  red:"#dc2626",redLight:"#fee2e2",redText:"#7f1d1d",
  amber:"#d97706",amberLight:"#fef3c7",amberText:"#78350f",
  blue:"#2563eb",blueLight:"#eff6ff",blueText:"#1e3a8a",
  purple:"#7c3aed",purpleLight:"#f5f3ff",purpleText:"#4c1d95",
  textPrimary:"#0f172a",textSecond:"#475569",textThird:"#94a3b8",
};
const S = {
  card:{background:C.surface,borderRadius:14,padding:20,border:`1px solid ${C.border}`,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"},
  pill:(a)=>({borderRadius:999,padding:"6px 14px",border:`1px solid ${a?C.green:C.border}`,backgroundColor:a?C.greenLight:C.surface,color:a?C.greenText:C.textSecond,cursor:"pointer",fontWeight:a?600:400,fontSize:13,transition:"all .15s"}),
  greenBtn:{display:"flex",alignItems:"center",justifyContent:"center",gap:6,borderRadius:8,padding:"9px 20px",border:"none",background:C.green,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14,letterSpacing:".2px"},
  grid2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12},
  grid3:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10},
  grid4:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10},
};

// ── Claude API call ────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function buildSystemPrompt() {
  return `You are a senior equity research analyst specializing in Indian stock markets (NSE/BSE).
Respond ONLY with valid JSON. No markdown, no backticks, no preamble, no explanation.
All monetary values in INR. Be specific, concise, and data-driven.`;
}

function buildAnalysisPrompt(ticker, stockData) {
  const f = stockData?.fundamentals || {};
  const t = stockData?.technicals || {};
  const h = stockData?.header || {};
  const pr = stockData?.priceRange || {};
  const peers = stockData?.peers || {};

  const fv = (m) => { if (!m) return "N/A"; if (m.value!=null) return m.value; if (m.rawValue!=null) return m.rawValue; return "N/A"; };
  const cmp = t.cmp || h.cmp || 0;

  return `Analyze ${ticker} (${h.name || ticker}) on NSE.

Market Data:
- CMP: ₹${cmp}
- Sector: ${h.sector || "N/A"}
- Industry: ${h.industry || "N/A"}
- 52W High: ₹${pr.week52High || "N/A"}
- 52W Low: ₹${pr.week52Low || "N/A"}
- ATH: ₹${pr.allTimeHigh || "N/A"}
- Sector Rank: #${peers.rank || "N/A"} of ${peers.totalPeers || "N/A"}

Fundamentals:
- P/E Ratio: ${fv(f.peRatio)}
- ROCE: ${fv(f.roce)}%
- Debt/Equity: ${fv(f.debtToEquity)}
- Net Profit (Cr): ${fv(f.netProfit)}
- Free Cash Flow (Cr): ${fv(f.freeCashFlow)}
- 5Y Profit Growth: ${fv(f.profitGrowth5Y)}%
- Pledged %: ${fv(f.pledgedPct)}%

Technicals:
- Pivot: ₹${t.pivot || "N/A"}
- R1: ₹${t.r1 || "N/A"}, R2: ₹${t.r2 || "N/A"}
- S1: ₹${t.s1 || "N/A"}, S2: ₹${t.s2 || "N/A"}
- EMA20: ₹${t.ema20 || "N/A"}, EMA50: ₹${t.ema50 || "N/A"}, EMA100: ₹${t.ema100 || "N/A"}

Return ONLY this exact JSON (no other text):
{
  "aiRating": 7.5,
  "confidence": "HIGH",
  "tradingPattern": "Cup and Handle",
  "patternConfidence": 78,
  "swingHypothesis": {
    "upsideTarget": 450,
    "stopLoss": 385,
    "rrRatio": 2.5,
    "timeframe": "4-6 weeks",
    "note": "one sentence note on the setup"
  },
  "intrinsicValue": 485,
  "valuationUpside": 21.0,
  "valuationNote": "two sentence note on valuation",
  "zones": {
    "strongBuy": 370,
    "buyZone": 395,
    "fairZone": 450,
    "avoidAbove": 520
  },
  "aiEntry": {
    "isInBuyZone": true,
    "entryNote": "one sentence on current entry opportunity",
    "targetOnRebound": 450
  },
  "sectorBreakdown": "two sentences on why the stock has this sector rank, citing a specific driver",
  "dueDiligence": {
    "fundamentalStrengths": "two sentences",
    "technicalSetup": "two sentences",
    "movingAverages": "one sentence",
    "riskFactors": "two sentences"
  },
  "sentimentNote": "one sentence market sentiment note for this stock"
}`;
}

// ── Shared UI Primitives ───────────────────────────────────────────────────────
function Logo({size=36}){
  return(<svg width={size} height={size} viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg"><rect width="72" height="72" rx="18" fill="#0f172a"/><text x="10" y="50" fontFamily="Georgia,serif" fontSize="38" fontWeight="900" fill="#16a34a">S</text><polyline points="42,44 50,30 58,30" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/><polyline points="52,25 58,30 53,35" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>);
}
function Badge({label,color,bg,size=11}){
  return <span style={{fontSize:size,fontWeight:700,color,background:bg,borderRadius:5,padding:"2px 8px",display:"inline-block",letterSpacing:".2px"}}>{label}</span>;
}
function MetricBox({label,value,color,sub}){
  return(<div style={{backgroundColor:C.surfaceAlt,borderRadius:10,padding:"11px 13px",border:`1px solid ${C.border}`}}><div style={{fontSize:11,color:C.textThird,marginBottom:3,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px"}}>{label}</div><div style={{fontSize:15,fontWeight:700,color:color||C.textPrimary}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.textThird,marginTop:2}}>{sub}</div>}</div>);
}
function RankHero({rank,total,sector,aiEnabled,aiNote,aiNoteLoading}){
  const [showNote,setShowNote]=useState(false);
  useEffect(()=>setShowNote(false),[rank]);
  if(!rank||!total) return null;
  const pct=((rank/total)*100).toFixed(0);
  const isTop=rank<=Math.ceil(total*0.25);
  const color=isTop?C.green:rank<=Math.ceil(total*0.5)?C.amber:C.red;
  const label=isTop?"Top Performer":rank<=Math.ceil(total*0.5)?"Mid Tier":"Lagging";
  return(
    <div style={{background:`linear-gradient(135deg,${C.surfaceAlt} 0%,${C.surface} 100%)`,border:`2px solid ${color}`,borderRadius:14,padding:"16px 20px",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,color:C.textThird,fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Sector Rank · {sector}</div>
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{fontSize:52,fontWeight:900,color,lineHeight:1,fontFamily:"Georgia,serif"}}>#{rank}</span>
            <span style={{fontSize:18,color:C.textThird,fontWeight:500}}>/ {total}</span>
          </div>
          <div style={{marginTop:6,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <Badge label={label} color={color===C.green?C.greenText:color===C.amber?C.amberText:C.redText} bg={color===C.green?C.greenLight:color===C.amber?C.amberLight:C.redLight} size={12}/>
            {aiEnabled&&(
              <button onClick={()=>setShowNote(v=>!v)} style={{display:"flex",alignItems:"center",gap:4,background:C.purpleLight,border:`1px solid ${C.purple}44`,borderRadius:999,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:600,color:C.purple}}>
                ✦ AI Note
              </button>
            )}
          </div>
        </div>
        <div style={{textAlign:"center"}}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke={C.border} strokeWidth="6"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${(1-rank/total)*201} 201`} strokeLinecap="round" transform="rotate(-90 40 40)" style={{transition:"stroke-dasharray .6s ease"}}/>
            <text x="40" y="45" textAnchor="middle" fontSize="18" fontWeight="800" fill={color} fontFamily="Georgia,serif">{100-parseInt(pct)}%</text>
          </svg>
          <div style={{fontSize:10,color:C.textThird,marginTop:-4}}>Better than</div>
        </div>
      </div>
      {aiEnabled&&showNote&&(
        <div style={{marginTop:12,background:C.purpleLight,border:`1px solid ${C.purple}33`,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.textSecond,lineHeight:1.6,animation:"fadeInDown .2s ease"}}>
          <span style={{color:C.purple,fontWeight:700}}>✦ AI Sector Breakdown:</span>{" "}
          {aiNoteLoading ? <span style={{color:C.textThird,fontStyle:"italic"}}>Analysing...</span> : (aiNote || "—")}
        </div>
      )}
    </div>
  );
}

// ── Market Mood ────────────────────────────────────────────────────────────────
function MarketMoodMeter({aiEnabled,aiSentimentNote}){
  const [mood,setMood]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setLoading(true);
    fetch(`${backendBase}/mood`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d) setMood(d); else setMood({value:50,chg:"0.00",hasData:false}); })
      .catch(()=>setMood({value:50,chg:"0.00",hasData:false}))
      .finally(()=>setLoading(false));
  },[]);

  const val=mood?.value??50;
  const angle=-90+(val/100)*180;
  const rad=angle*Math.PI/180;
  const nx=70+52*Math.cos(rad);
  const ny=70+52*Math.sin(rad);
  const moodLabel=val<20?"Extreme Fear":val<40?"Fear":val<60?"Neutral":val<80?"Greed":"Extreme Greed";
  const moodColor=val<20?C.red:val<40?"#f97316":val<60?C.amber:val<80?C.green:"#15803d";

  return(
    <div style={{...S.card,padding:"16px 20px"}}>
      <div style={{fontSize:12,fontWeight:700,color:C.textSecond,textTransform:"uppercase",letterSpacing:".5px",marginBottom:10}}>
        Market Mood {loading&&<span style={{fontSize:10,color:C.textThird,fontWeight:400}}>— loading...</span>}
      </div>
      <svg width="140" height="80" viewBox="0 0 140 80" style={{display:"block",margin:"0 auto"}}>
        <defs>
          <linearGradient id="moodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={C.red}/>
            <stop offset="25%"  stopColor="#f97316"/>
            <stop offset="50%"  stopColor={C.amber}/>
            <stop offset="75%"  stopColor={C.green}/>
            <stop offset="100%" stopColor="#15803d"/>
          </linearGradient>
        </defs>
        <path d="M 18,70 A 52,52 0 0 1 122,70" fill="none" stroke={C.border} strokeWidth="12" strokeLinecap="round"/>
        <path d="M 18,70 A 52,52 0 0 1 122,70" fill="none" stroke="url(#moodGrad)" strokeWidth="10" strokeLinecap="round"/>
        <line x1="70" y1="70" x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke={C.textPrimary} strokeWidth="2.5" strokeLinecap="round" style={{transition:"all .8s ease"}}/>
        <circle cx="70" cy="70" r="5" fill={C.textPrimary}/>
        <text x="70" y="56" textAnchor="middle" fontSize="10" fontWeight="800" fill={moodColor}>{moodLabel}</text>
      </svg>
      <div style={{textAlign:"center",marginTop:4}}>
        <span style={{fontSize:20,fontWeight:800,color:moodColor}}>{val.toFixed(0)}</span>
        <span style={{fontSize:11,color:C.textThird,marginLeft:6}}>/ 100</span>
        {mood&&<div style={{fontSize:11,fontWeight:600,marginTop:4,color:parseFloat(mood.chg)>=0?C.green:C.red}}>
          Nifty 50 {parseFloat(mood.chg)>=0?"+":""}{mood.chg}%
        </div>}
        {mood&&!mood.hasData&&<div style={{fontSize:10,color:C.textThird,marginTop:2}}>Market data estimate</div>}
      </div>
      {aiEnabled&&aiSentimentNote&&(
        <div style={{marginTop:10,padding:"8px 10px",background:C.purpleLight,borderRadius:8,border:`1px solid ${C.purple}22`,fontSize:11,color:C.textSecond,lineHeight:1.5}}>
          <span style={{color:C.purple,fontWeight:700}}>↑ AI Sentiment:</span> {aiSentimentNote}
        </div>
      )}
    </div>
  );
}

// ── Trending Stocks ───────────────────────────────────────────────────────────
function TrendingStocks({onSelectStock}){
  const [stocks,setStocks]=useState([]);
  const [tab,setTab]=useState("gainers");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);

  const load=useCallback(async(t)=>{
    setLoading(true);setError(false);
    try{
      const r=await fetch(`${backendBase}/trending?type=${t}`);
      if(!r.ok) throw new Error();
      const d=await r.json();
      setStocks(d.stocks||[]);
    }catch{setError(true);setStocks([]);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{load(tab);},[tab,load]);

  return(
    <div style={S.card}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700,color:C.textPrimary}}>Trending Today</div>
        <div style={{display:"flex",gap:6}}>
          {[["gainers","Top Gainers"],["active","Most Active"]].map(([v,l])=>(
            <button key={v} onClick={()=>{setTab(v);load(v);}} style={S.pill(tab===v)}>{l}</button>
          ))}
        </div>
      </div>
      {loading&&<div style={{color:C.textThird,fontSize:13,padding:"16px 0",textAlign:"center"}}>Loading...</div>}
      {error&&!loading&&<div style={{color:C.textThird,fontSize:12,padding:"8px 0"}}>Could not load trending data. Backend may be starting up.</div>}
      {!loading&&!error&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {stocks.slice(0,8).map((s,i)=>(
            <div key={s.ticker||i} onClick={()=>onSelectStock(s.ticker)}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,cursor:"pointer",border:`1px solid ${C.border}`,background:C.surfaceAlt,transition:"background .12s"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.greenLight}
              onMouseLeave={e=>e.currentTarget.style.background=C.surfaceAlt}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:28,height:28,borderRadius:7,background:C.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>{(s.ticker||"?")[0]}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.textPrimary}}>{s.ticker}</div>
                  <div style={{fontSize:11,color:C.textThird}}>{s.sector||s.name?.split(" ").slice(0,2).join(" ")}</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.textPrimary}}>{s.cmp?`₹${parseFloat(s.cmp).toLocaleString("en-IN")}`:"-"}</div>
                {s.growth5Y!=null&&<div style={{fontSize:11,fontWeight:600,color:s.growth5Y>0?C.green:C.red}}>{s.growth5Y>0?"+":""}{s.growth5Y}%</div>}
              </div>
            </div>
          ))}
          {stocks.length===0&&<div style={{color:C.textThird,fontSize:12,padding:"8px 0"}}>No trending data right now</div>}
        </div>
      )}
    </div>
  );
}

// ── Search Bar ────────────────────────────────────────────────────────────────
function SearchBar({onSearch,onSelectStock}){
  const [query,setQuery]=useState("");
  const [suggs,setSuggs]=useState([]);
  const [showSugg,setShowSugg]=useState(false);
  const [loading,setLoading]=useState(false);
  const debounceRef=useRef(null);
  const wrapRef=useRef(null);

  const fetchSuggs=useCallback(async(q)=>{
    if(!q||q.length<1){setSuggs([]);return;}
    setLoading(true);
    try{
      const r=await fetch(`${backendBase}/search?q=${encodeURIComponent(q)}`);
      const d=await r.json();
      setSuggs(Array.isArray(d)?d:Array.isArray(d?.results)?d.results:[]);
    }
    catch{setSuggs([]);}
    finally{setLoading(false);}
  },[]);

  const handleChange=(e)=>{
    const val=e.target.value.toUpperCase();setQuery(val);setShowSugg(true);
    if(debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current=setTimeout(()=>fetchSuggs(val),200);
  };
  const handleSelect=(ticker)=>{setQuery(ticker);setShowSugg(false);setSuggs([]);onSelectStock(ticker);};
  const handleSearch=()=>{setShowSugg(false);onSearch(query);};

  useEffect(()=>{
    const h=(e)=>{if(wrapRef.current&&!wrapRef.current.contains(e.target)) setShowSugg(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  return(
    <div ref={wrapRef} style={{position:"relative",flex:1}}>
      <div style={{display:"flex",gap:10}}>
        <input value={query} onChange={handleChange}
          onFocus={e=>{e.target.style.borderColor=C.green; if(query.length>0) setShowSugg(true);}}
          onBlur={e=>e.target.style.borderColor=C.border}
          onKeyDown={e=>e.key==="Enter"&&handleSearch()}
          placeholder="Search NSE symbol — SBI, TCS, RELIANCE..."
          style={{flex:1,background:C.surfaceAlt,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 16px",color:C.textPrimary,fontSize:14,outline:"none",fontFamily:"Inter,sans-serif",transition:"border .15s"}}
        />
        <button style={S.greenBtn} onClick={handleSearch}>Search</button>
      </div>
      {showSugg&&(suggs.length>0||loading)&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:60,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:100,overflow:"hidden"}}>
          {loading&&<div style={{padding:"10px 14px",fontSize:12,color:C.textThird}}>Searching...</div>}
          {suggs.slice(0,8).map((s,i)=>(
            <div key={i} onMouseDown={()=>handleSelect(s.ticker)}
              style={{padding:"10px 14px",cursor:"pointer",borderBottom:i<suggs.length-1?`1px solid ${C.border}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.greenLight}
              onMouseLeave={e=>e.currentTarget.style.background=C.surface}>
              <div>
                <span style={{fontWeight:700,color:C.green,fontSize:13}}>{s.ticker}</span>
                <span style={{fontSize:12,color:C.textSecond,marginLeft:8}}>{s.name}</span>
              </div>
              <span style={{fontSize:11,color:C.textThird}}>{s.exchange||"NSE"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sector Screener ───────────────────────────────────────────────────────────
function Screener({onSelectStock}){
  const [sectors,setSectors]=useState([]);
  const [sector,setSector]=useState("");
  const [stocks,setStocks]=useState([]);
  const [sortBy,setSortBy]=useState("rank");
  const [loading,setLoading]=useState(false);
  const [loadingSectors,setLoadingSectors]=useState(true);
  const [sectorError,setSectorError]=useState(false);
  const [page,setPage]=useState(0);
  const PAGE_SIZE=20;

  useEffect(()=>{
    setLoadingSectors(true);setSectorError(false);
    fetch(`${backendBase}/screener`)
      .then(r=>{if(!r.ok) throw new Error();return r.json();})
      .then(d=>{ const secs=(d.sectors||[]).filter(s=>s.sector&&s.count>0); setSectors(secs); })
      .catch(()=>setSectorError(true))
      .finally(()=>setLoadingSectors(false));
  },[]);

  const loadSector=async(s,sort=sortBy,p=0)=>{
    if(!s) return;
    setLoading(true);
    try{
      const r=await fetch(`${backendBase}/screener?sector=${encodeURIComponent(s)}&sort=${sort}&limit=500`);
      if(!r.ok) throw new Error();
      const d=await r.json();
      setStocks(d.stocks||[]);setPage(p);
    }catch{setStocks([]);}
    finally{setLoading(false);}
  };

  const handleSector=(s)=>{setSector(s);loadSector(s);};
  const handleSort=(s)=>{setSortBy(s);loadSector(sector,s);};
  const pageStocks=stocks.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const totalPages=Math.ceil(stocks.length/PAGE_SIZE);

  return(
    <div style={{marginTop:8}}>
      <div style={{fontSize:15,fontWeight:800,color:C.textPrimary,marginBottom:4}}>Sector Screener</div>
      {loadingSectors&&<div style={{fontSize:13,color:C.textThird,padding:"16px 0"}}>Loading sectors from NSE...</div>}
      {sectorError&&!loadingSectors&&<div style={{fontSize:13,color:C.red,padding:"12px 0"}}>Could not load sectors. Make sure backend is running.</div>}
      {!loadingSectors&&!sectorError&&(
        <>
          <div style={{fontSize:12,color:C.textThird,marginBottom:14}}>
            {sectors.length} sectors · NSE listed
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
            {sectors.map(s=>(
              <button key={s.sector} onClick={()=>handleSector(s.sector)} style={S.pill(sector===s.sector)}>
                {s.sector}{sector===s.sector&&stocks.length>0&&<span style={{fontSize:10,marginLeft:4,opacity:.6}}>({stocks.length})</span>}
              </button>
            ))}
          </div>
        </>
      )}
      {sector&&(
        <>
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:11,color:C.textThird}}>Sort:</span>
            {[["rank","Rank"],["pe","P/E ↑"],["pe_desc","P/E ↓"],["profit","Profit"],["growth","Growth"],["debt","Low Debt"],["volume","Volume"]].map(([v,l])=>(
              <button key={v} onClick={()=>handleSort(v)} style={{...S.pill(sortBy===v),padding:"4px 10px",fontSize:11}}>{l}</button>
            ))}
          </div>
          {loading?(
            <div style={{color:C.textThird,padding:24,textAlign:"center",fontSize:13}}>Loading {sector} stocks...</div>
          ):(
            <>
              <div style={{overflowX:"auto",borderRadius:10,border:`1px solid ${C.border}`,marginBottom:10}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"Inter,sans-serif"}}>
                  <thead>
                    <tr style={{background:C.surfaceAlt}}>
                      {["#","Ticker","Company","CMP","P/E","D/E","Net Profit","1D Change","52W H","52W L","Rank"].map(h=>(
                        <th key={h} style={{padding:"10px 12px",textAlign:"left",fontWeight:700,color:C.textSecond,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageStocks.map((s,i)=>{
                      const rowN=page*PAGE_SIZE+i+1;
                      return(
                        <tr key={s.ticker||i} onClick={()=>onSelectStock(s.ticker)}
                          style={{cursor:"pointer",borderBottom:`1px solid ${C.border}`,backgroundColor:i%2===0?C.surface:C.surfaceAlt}}
                          onMouseEnter={e=>e.currentTarget.style.backgroundColor=C.greenLight}
                          onMouseLeave={e=>e.currentTarget.style.backgroundColor=i%2===0?C.surface:C.surfaceAlt}>
                          <td style={{padding:"9px 12px",color:C.textThird,fontWeight:600}}>{rowN}</td>
                          <td style={{padding:"9px 12px",color:C.green,fontWeight:800}}>{s.ticker}</td>
                          <td style={{padding:"9px 12px",color:C.textPrimary,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name?.split(" ").slice(0,3).join(" ")}</td>
                          <td style={{padding:"9px 12px",fontWeight:700,color:C.textPrimary}}>{s.cmp?`₹${parseFloat(s.cmp).toLocaleString("en-IN")}`:"-"}</td>
                          <td style={{padding:"9px 12px",color:s.pe<25?C.green:s.pe>60?C.red:C.textPrimary}}>{s.pe?`${parseFloat(s.pe).toFixed(1)}x`:"-"}</td>
                          <td style={{padding:"9px 12px"}}>{s.debtToEquity?parseFloat(s.debtToEquity).toFixed(2):"-"}</td>
                          <td style={{padding:"9px 12px",color:C.textPrimary}}>{s.netProfit?`₹${Math.round(s.netProfit)}cr`:"-"}</td>
                          <td style={{padding:"9px 12px",color:s.growth5Y>0?C.green:s.growth5Y<0?C.red:C.textPrimary}}>{s.growth5Y!=null?`${s.growth5Y>0?"+":""}${s.growth5Y}%`:"-"}</td>
                          <td style={{padding:"9px 12px",color:C.green}}>{s.week52High?`₹${s.week52High}`:"-"}</td>
                          <td style={{padding:"9px 12px",color:C.amber}}>{s.week52Low?`₹${s.week52Low}`:"-"}</td>
                          <td style={{padding:"9px 12px"}}>{s.rank&&<Badge label={`#${s.rank}`} color={C.greenText} bg={C.greenLight}/>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {stocks.length===0&&<div style={{color:C.textThird,padding:24,textAlign:"center"}}>No stocks found for this sector</div>}
              </div>
              {totalPages>1&&(
                <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                  {Array.from({length:totalPages},(_,i)=>(
                    <button key={i} onClick={()=>setPage(i)} style={{...S.pill(page===i),padding:"4px 12px",fontSize:12}}>{i+1}</button>
                  ))}
                </div>
              )}
              <div style={{fontSize:11,color:C.textThird,textAlign:"center",marginTop:6}}>
                Showing {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,stocks.length)} of {stocks.length} stocks in {sector}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── AI Analysis Tab ───────────────────────────────────────────────────────────
function AIAnalysisTab({ ai, loading, error, onRetry, cmp }) {
  if (loading) {
    return (
      <div style={S.card}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:C.purpleLight,border:`2px solid ${C.purple}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✦</div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:C.textPrimary}}>Running AI Analysis...</div>
            <div style={{fontSize:11,color:C.textThird}}>Claude is analysing fundamentals, technicals & sector data</div>
          </div>
        </div>
        {[90,70,80,60,75].map((w,i)=>(
          <div key={i} style={{height:14,borderRadius:6,background:C.border,marginBottom:10,width:`${w}%`,animation:"shimmer 1.4s infinite"}}/>
        ))}
        <style>{`@keyframes shimmer{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
      </div>
    );
  }
  if (error) {
    return (
      <div style={S.card}>
        <div style={{color:C.red,fontSize:13,marginBottom:10}}>⚠ {error}</div>
        <button onClick={onRetry} style={{...S.greenBtn,width:"auto",fontSize:12,padding:"7px 18px"}}>Retry Analysis</button>
      </div>
    );
  }
  if (!ai) {
    return (
      <div style={S.card}>
        <div style={{textAlign:"center",padding:"24px 0",color:C.textThird}}>
          <div style={{fontSize:28,marginBottom:8}}>🤖</div>
          <div style={{fontSize:14,fontWeight:600}}>No AI analysis yet</div>
          <div style={{fontSize:12,marginTop:4}}>Select a stock to run AI analysis</div>
        </div>
      </div>
    );
  }

  const upsidePct = ai.swingHypothesis?.upsideTarget && cmp
    ? (((ai.swingHypothesis.upsideTarget - cmp) / cmp) * 100).toFixed(1)
    : null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>

      {/* Row 1: AI Rating + Swing Hypothesis */}
      <div style={S.grid2}>
        {/* AI Rating */}
        <div style={{...S.card,display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:16}}>
          <div style={{fontSize:10,fontWeight:700,color:C.purple,background:C.purpleLight,borderRadius:20,padding:"2px 10px",letterSpacing:".05em"}}>✦ AI RATING</div>
          <svg width="72" height="82" viewBox="0 0 64 72">
            <path d="M32 4 L58 16 L58 36 C58 52 46 64 32 68 C18 64 6 52 6 36 L6 16 Z"
              fill={C.purpleLight} stroke={C.purple} strokeWidth="2.5"/>
            <text x="32" y="44" textAnchor="middle" fontSize="20" fontWeight="800" fill={C.purple} fontFamily="Georgia,serif">{ai.aiRating}</text>
          </svg>
          <div style={{fontSize:13,fontWeight:700,color:C.textPrimary,fontFamily:"Georgia,serif"}}>{ai.aiRating} / 10</div>
          <div style={{fontSize:10,fontWeight:700,color:ai.confidence==="HIGH"?C.green:ai.confidence==="MEDIUM"?C.amber:C.red,background:ai.confidence==="HIGH"?C.greenLight:ai.confidence==="MEDIUM"?C.amberLight:C.redLight,borderRadius:20,padding:"2px 10px"}}>
            AI CONFIDENCE: {ai.confidence}
          </div>
        </div>

        {/* Swing Hypothesis */}
        <div style={{...S.card,padding:16}}>
          <div style={{fontSize:10,fontWeight:700,color:C.purple,background:C.purpleLight,borderRadius:20,padding:"2px 10px",letterSpacing:".05em",display:"inline-block",marginBottom:12}}>✦ SWING HYPOTHESIS</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:C.textSecond}}>🎯 Upside Target</span>
              <span style={{fontSize:13,fontWeight:700,color:C.green}}>₹{ai.swingHypothesis?.upsideTarget}
                {upsidePct&&<span style={{fontSize:10,color:C.textThird,fontWeight:400}}> (+{upsidePct}%)</span>}
              </span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:C.textSecond}}>🛑 Stop Loss</span>
              <span style={{fontSize:13,fontWeight:700,color:C.red}}>₹{ai.swingHypothesis?.stopLoss}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:C.textSecond}}>⚖️ R:R Ratio</span>
              <span style={{fontSize:13,fontWeight:700,color:C.textPrimary}}>{ai.swingHypothesis?.rrRatio}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:C.textSecond}}>⏳ Timeframe</span>
              <span style={{fontSize:12,color:C.textSecond}}>{ai.swingHypothesis?.timeframe}</span>
            </div>
            {ai.swingHypothesis?.note&&(
              <div style={{marginTop:4,fontSize:11,color:C.textThird,fontStyle:"italic",lineHeight:1.5,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                {ai.swingHypothesis.note}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trading Pattern */}
      <div style={{...S.card,padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:C.purple,background:C.purpleLight,borderRadius:20,padding:"2px 10px",letterSpacing:".05em",display:"inline-block",marginBottom:8}}>✦ TRADING PATTERN</div>
            <div style={{fontSize:16,fontWeight:700,color:C.textPrimary}}>{ai.tradingPattern}</div>
            <div style={{fontSize:11,color:C.textThird,marginTop:2}}>Pattern identified by AI analysis</div>
          </div>
          <div style={{textAlign:"center"}}>
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="22" fill="none" stroke={C.border} strokeWidth="4"/>
              <circle cx="26" cy="26" r="22" fill="none" stroke={C.purple} strokeWidth="4"
                strokeDasharray={`${(ai.patternConfidence/100)*138} 138`}
                strokeLinecap="round" transform="rotate(-90 26 26)"/>
              <text x="26" y="31" textAnchor="middle" fontSize="13" fontWeight="800" fill={C.purple}>{ai.patternConfidence}%</text>
            </svg>
            <div style={{fontSize:9,color:C.textThird,marginTop:2}}>confidence</div>
          </div>
        </div>
      </div>

      {/* Intrinsic Value + Zones */}
      <div style={{...S.card,background:"#0f172a",border:"none",padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#f8fafc"}}>AI Intrinsic Value</div>
            <div style={{fontSize:10,color:"#64748b",marginTop:2}}>Computed from sector, fundamentals & technicals</div>
          </div>
          <span style={{background:C.green,color:"#fff",fontSize:11,fontWeight:700,borderRadius:6,padding:"3px 10px"}}>
            ₹{ai.intrinsicValue}
          </span>
        </div>
        {ai.valuationNote&&(
          <div style={{background:"#1e293b",borderRadius:8,padding:"10px 12px",marginBottom:12,border:"1px solid #22c55e33"}}>
            <div style={{fontSize:11,color:"#4ade80",fontWeight:600,marginBottom:4}}>
              +{ai.valuationUpside}% Upside from CMP
            </div>
            <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5}}>{ai.valuationNote}</div>
          </div>
        )}
        <div style={S.grid2}>
          {[
            ["STRONG BUY",ai.zones?.strongBuy,C.green,"#f0fdf4"],
            ["BUY ZONE",ai.zones?.buyZone,"#0891b2","#f0f9ff"],
            ["FAIR ZONE",ai.zones?.fairZone,C.amber,C.amberLight],
            ["AVOID ZONE",ai.zones?.avoidAbove,C.red,C.redLight],
          ].map(([label,val,color,bg])=>(
            <div key={label} style={{background:bg,border:`1px solid ${color}33`,borderRadius:8,padding:"9px 11px"}}>
              <div style={{fontSize:9,fontWeight:700,color,letterSpacing:".05em",marginBottom:3}}>{label}</div>
              <div style={{fontSize:16,fontWeight:800,color:C.textPrimary,fontFamily:"Georgia,serif"}}>{val?`₹${val}`:"—"}</div>
            </div>
          ))}
        </div>
        {ai.aiEntry&&(
          <div style={{marginTop:12,background:"#1e293b",borderRadius:8,padding:"12px",border:"1px solid #33415577"}}>
            <div style={{fontSize:9,color:C.purple,fontWeight:700,letterSpacing:".08em",marginBottom:6}}>AI ENTRY SIGNAL</div>
            <div style={{fontSize:12,color:"#e2e8f0",lineHeight:1.5}}>{ai.aiEntry.entryNote}</div>
            {ai.aiEntry.targetOnRebound&&(
              <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>
                AI targets rebound to <strong style={{color:"#4ade80"}}>₹{ai.aiEntry.targetOnRebound}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full Due Diligence */}
      <div style={S.card}>
        <div style={{fontSize:10,fontWeight:700,color:C.purple,background:C.purpleLight,borderRadius:20,padding:"2px 10px",letterSpacing:".05em",display:"inline-block",marginBottom:14}}>✦ FULL AI DUE DILIGENCE</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[
            {icon:"📊",label:"Fundamental Strengths",key:"fundamentalStrengths"},
            {icon:"📈",label:"Technical Setup",key:"technicalSetup"},
            {icon:"〰️",label:"Moving Averages",key:"movingAverages"},
            {icon:"⚠️",label:"Risk Factors",key:"riskFactors"},
          ].map(({icon,label,key})=>(
            <div key={key}>
              <div style={{fontSize:11,fontWeight:700,color:C.textSecond,textTransform:"uppercase",letterSpacing:".04em",marginBottom:3}}>
                {icon} {label}
              </div>
              <div style={{fontSize:12,color:C.textSecond,lineHeight:1.6,paddingLeft:20}}>
                {ai.dueDiligence?.[key]||"—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{fontSize:10,color:C.textThird,textAlign:"center",paddingBottom:8}}>
        For educational use only. Not SEBI-registered investment advice.
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [results,setResults]=useState([]);
  const [selected,setSelected]=useState(null);
  const [priceRange,setPriceRange]=useState(null);
  const [activeTab,setActiveTab]=useState("overview");
  const [view,setView]=useState("stock");

  // AI State
  const [aiEnabled,setAiEnabled]=useState(true);
  const [aiData,setAiData]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiError,setAiError]=useState(null);
  const lastAiTicker=useRef(null);

  const runAI=useCallback(async(ticker,stockDataForAI,priceRangeForAI)=>{
    if(!ticker||!aiEnabled) return;
    setAiLoading(true);setAiError(null);setAiData(null);
    try{
      const combined={...stockDataForAI,priceRange:priceRangeForAI};
      const raw=await callClaude(buildSystemPrompt(),buildAnalysisPrompt(ticker,combined));
      const clean=raw.replace(/```json|```/g,"").trim();
      setAiData(JSON.parse(clean));
      lastAiTicker.current=ticker;
    }catch(e){
      setAiError("AI analysis unavailable. Please try again.");
    }finally{
      setAiLoading(false);
    }
  },[aiEnabled]);

  const loadStock=useCallback(async(ticker)=>{
    if(!ticker) return;
    try{
      const [stockRes,rangeRes]=await Promise.all([
        fetch(`${backendBase}/stock/${encodeURIComponent(ticker)}`),
        fetch(`${backendBase}/stock/${encodeURIComponent(ticker)}/pricerange`),
      ]);
      const stockData=await stockRes.json();
      const rangeData=rangeRes.ok?await rangeRes.json():null;
      setSelected(stockData);setPriceRange(rangeData);setActiveTab("overview");setView("stock");
      setAiData(null);setAiError(null);lastAiTicker.current=null;
      // Auto-run AI if enabled
      if(aiEnabled) runAI(ticker,stockData,rangeData);
    }catch(e){console.error(e);}
  },[aiEnabled,runAI]);

  const handleSearch=async(query)=>{
    if(!query) return;
    try{
      const res=await fetch(`${backendBase}/search?q=${encodeURIComponent(query)}`);
      const data=await res.json();
      const arr=Array.isArray(data)?data:Array.isArray(data?.results)?data.results:[];
      setResults(arr);
      if(arr.length>0) loadStock(arr[0].ticker);
    }catch(e){console.error(e);}
  };

  useEffect(()=>{},[]);// placeholder — no auto-load on startup

  const t=selected?.technicals||{};
  const f=selected?.fundamentals||{};
  const header=selected?.header||{};
  const peers=selected?.peers?.peers||[];
  const cmp=t.cmp||header.cmp||0;
  const epsNum=parseFloat(fval(f.eps)||fval(f.epsBasic)||0)||0;
  const rank=selected?.peers?.rank;
  const total=selected?.peers?.totalPeers;

  const tabBtn=(id,label,isAI=false)=>(
    <button key={id} onClick={()=>setActiveTab(id)} style={{
      ...S.pill(activeTab===id),
      padding:"7px 16px",
      ...(isAI&&activeTab!==id?{borderColor:`${C.purple}44`,color:C.purple,background:C.purpleLight}:{}),
      ...(isAI&&activeTab===id?{borderColor:C.purple,background:C.purple,color:"#fff"}:{}),
    }}>{label}</button>
  );

  // AI toggle handler — re-runs analysis if turning on and no data yet
  const handleAIToggle=()=>{
    const next=!aiEnabled;
    setAiEnabled(next);
    if(next&&selected&&!aiData&&!aiLoading){
      setTimeout(()=>runAI(header.ticker,selected,priceRange),50);
    }
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.textPrimary,fontFamily:"Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",fontSize:14}}>
      <style>{`
        @keyframes fadeInDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
        @keyframes shimmer{0%,100%{opacity:.4}50%{opacity:1}}
      `}</style>

      {/* ── Header ── */}
      <header style={{height:62,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",background:C.surface,position:"sticky",top:0,zIndex:50,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Logo size={38}/>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:C.textPrimary,fontFamily:"Georgia,serif",letterSpacing:"-.3px"}}>Stock<span style={{color:C.green}}>Scope</span></div>
            <div style={{fontSize:10,color:C.textThird,fontWeight:500,letterSpacing:".5px"}}>INVESTOR RESEARCH WORKSPACE</div>
          </div>
        </div>
        <nav style={{display:"flex",gap:8,alignItems:"center"}}>
          {[["stock","🔍 Stocks"],["screener","📊 Screener"],["trending","🔥 Trending"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={S.pill(view===v)}>{l}</button>
          ))}
          {/* AI Insights Toggle */}
          <div onClick={handleAIToggle} style={{
            display:"flex",alignItems:"center",gap:6,
            background:aiEnabled?C.purpleLight:"#f9fafb",
            border:`1px solid ${aiEnabled?C.purple+"44":C.border}`,
            borderRadius:999,padding:"5px 12px 5px 10px",
            cursor:"pointer",userSelect:"none",transition:"all .2s",marginLeft:4,
          }}>
            <span style={{fontSize:13}}>🤖</span>
            <span style={{fontSize:12,fontWeight:600,color:aiEnabled?C.purple:C.textThird}}>AI Insights</span>
            <div style={{width:28,height:16,borderRadius:8,background:aiEnabled?C.purple:"#d1d5db",position:"relative",transition:"background .2s"}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:aiEnabled?14:2,transition:"left .2s"}}/>
            </div>
          </div>
        </nav>
        <div style={{fontSize:11,color:C.textThird}}>Educational use only</div>
      </header>

      <main style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>
        {view==="screener"&&<div style={S.card}><Screener onSelectStock={loadStock}/></div>}
        {view==="trending"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <TrendingStocks onSelectStock={loadStock}/>
            <MarketMoodMeter aiEnabled={aiEnabled} aiSentimentNote={aiData?.sentimentNote}/>
          </div>
        )}
        {view==="stock"&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:20,marginBottom:20}}>
              <div style={S.card}>
                <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:1,color:C.textThird,marginBottom:6,fontWeight:600}}>Symbol Search</div>
                <SearchBar onSearch={handleSearch} onSelectStock={loadStock}/>
                {results.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:12}}>
                    {results.map((s,i)=>(
                      <button key={i} onClick={()=>loadStock(s.ticker)} style={{...S.pill(selected?.header?.ticker===s.ticker),padding:"5px 12px",fontSize:12}}>
                        {s.ticker} <span style={{opacity:.6,fontSize:10}}>— {s.name?.split(" ").slice(0,2).join(" ")}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selected&&(
                  <div style={{display:"flex",gap:16,marginTop:14,padding:"12px 16px",background:C.surfaceAlt,borderRadius:10,border:`1px solid ${C.border}`}}>
                    <div>
                      <div style={{fontSize:10,color:C.textThird,marginBottom:2}}>CMP</div>
                      <div style={{fontSize:22,fontWeight:800,color:cmp>0?C.green:C.textPrimary}}>{cmp>0?fmt(cmp):"—"}</div>
                    </div>
                    <div style={{borderLeft:`1px solid ${C.border}`,paddingLeft:16}}>
                      <div style={{fontSize:10,color:C.textThird,marginBottom:2}}>Sector</div>
                      <div style={{fontSize:14,fontWeight:600}}>{header.sector||"—"}</div>
                      <div style={{fontSize:11,color:C.textThird}}>{header.exchange||"NSE"} · {header.industry||"—"}</div>
                    </div>
                    {/* AI Forecast badge in search bar */}
                    {aiEnabled&&(
                      <div style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
                        <button onClick={()=>setActiveTab("ai")} style={{display:"flex",alignItems:"center",gap:5,background:C.purpleLight,border:`1px solid ${C.purple}44`,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,color:C.purple}}>
                          📈 AI Forecast
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <MarketMoodMeter aiEnabled={aiEnabled} aiSentimentNote={aiData?.sentimentNote}/>
            </div>

            {selected&&(
              <section style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 300px",gap:20}}>
                <div>
                  {/* Stock header card */}
                  <div style={{...S.card,marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                          <div style={{fontSize:24,fontWeight:900,color:C.textPrimary,fontFamily:"Georgia,serif"}}>{header.ticker}</div>
                          <Badge label={header.exchange||"NSE"} color={C.blueText} bg={C.blueLight}/>
                          {header.sector&&<Badge label={header.sector} color={C.greenText} bg={C.greenLight}/>}
                        </div>
                        <div style={{fontSize:13,color:C.textSecond}}>{header.name}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:28,fontWeight:900,color:C.green,fontFamily:"Georgia,serif"}}>{cmp>0?fmt(cmp):"—"}</div>
                        <div style={{fontSize:11,color:C.textThird}}>Last traded price</div>
                      </div>
                    </div>
                    {priceRange&&cmp>0&&priceRange.week52Low&&priceRange.week52High&&(()=>{
                      const lo=priceRange.week52Low,hi=priceRange.week52High;
                      const pct=Math.min(100,Math.max(0,((cmp-lo)/(hi-lo))*100));
                      return(
                        <div style={{marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.textThird,marginBottom:4}}>
                            <span>52W Low: {fmt(lo)}</span>
                            <span style={{fontWeight:600,color:C.textPrimary}}>CMP at {pct.toFixed(0)}%</span>
                            <span>52W High: {fmt(hi)}</span>
                          </div>
                          <div style={{height:6,background:C.border,borderRadius:3,position:"relative"}}>
                            <div style={{position:"absolute",left:0,width:`${pct}%`,height:"100%",background:C.green,borderRadius:3,transition:"width .5s"}}/>
                            <div style={{position:"absolute",left:`${pct}%`,top:-3,width:12,height:12,borderRadius:"50%",background:C.green,border:"2px solid #fff",transform:"translateX(-50%)",boxShadow:"0 0 0 1px #e2e8f0"}}/>
                          </div>
                        </div>
                      );
                    })()}
                    <RankHero
                      rank={rank} total={total} sector={header.sector}
                      aiEnabled={aiEnabled}
                      aiNote={aiData?.sectorBreakdown}
                      aiNoteLoading={aiLoading}
                    />
                    {priceRange&&(
                      <div style={S.grid4}>
                        {[["52W High",priceRange.week52High,C.green],["52W Low",priceRange.week52Low,C.amber],["All-Time High",priceRange.allTimeHigh,C.purple],["All-Time Low",priceRange.allTimeLow,C.textThird]].map(([l,v,c])=>(
                          <div key={l} style={{textAlign:"center",background:C.surfaceAlt,borderRadius:8,padding:"10px 8px",border:`1px solid ${C.border}`}}>
                            <div style={{fontSize:10,color:C.textThird,marginBottom:2,fontWeight:600}}>{l}</div>
                            <div style={{fontSize:14,fontWeight:800,color:c}}>{v?fmt(v):"NA"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tab bar — now includes AI Analysis */}
                  <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                    {tabBtn("overview","Overview")}
                    {tabBtn("fundamentals","Fundamentals")}
                    {tabBtn("technicals","Technicals")}
                    {tabBtn("peers","Peers")}
                    {aiEnabled&&tabBtn("ai","🤖 AI Analysis",true)}
                  </div>

                  {/* Overview Tab */}
                  {activeTab==="overview"&&(
                    <div style={S.card}>
                      <div style={{fontSize:13,fontWeight:700,color:C.textSecond,marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>Snapshot</div>
                      <div style={S.grid2}>
                        {[["CMP",cmp>0?fmt(cmp):"NA",C.green],["Sector",header.sector||"NA",null],["Exchange",header.exchange||"NSE",null],["Industry",header.industry||"NA",null],["P/E Ratio",fval(f.peRatio),null],["ROCE %",fval(f.roce),null],["Debt/Equity",fval(f.debtToEquity),null],["Sector Rank",rank?`#${rank} of ${total}`:"NA",C.green]].map(([l,v,c])=><MetricBox key={l} label={l} value={v} color={c}/>)}
                      </div>
                      {/* AI summary strip on overview when enabled */}
                      {aiEnabled&&(aiLoading||aiData)&&(
                        <div style={{marginTop:16,padding:"12px 14px",background:C.purpleLight,border:`1px solid ${C.purple}22`,borderRadius:10}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.purple,marginBottom:6}}>✦ AI Quick Read</div>
                          {aiLoading?(
                            <div style={{fontSize:12,color:C.textThird,fontStyle:"italic"}}>Running AI analysis...</div>
                          ):(
                            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                              <div style={{fontSize:12,color:C.textSecond}}><strong style={{color:C.purple}}>Rating:</strong> {aiData?.aiRating}/10 ({aiData?.confidence})</div>
                              <div style={{fontSize:12,color:C.textSecond}}><strong style={{color:C.purple}}>Pattern:</strong> {aiData?.tradingPattern}</div>
                              <div style={{fontSize:12,color:C.textSecond}}><strong style={{color:C.green}}>Target:</strong> ₹{aiData?.swingHypothesis?.upsideTarget}</div>
                              <div style={{fontSize:12,color:C.textSecond}}><strong style={{color:C.red}}>Stop:</strong> ₹{aiData?.swingHypothesis?.stopLoss}</div>
                              <button onClick={()=>setActiveTab("ai")} style={{fontSize:11,fontWeight:600,color:C.purple,background:"none",border:`1px solid ${C.purple}44`,borderRadius:6,padding:"2px 10px",cursor:"pointer"}}>Full Analysis →</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fundamentals Tab */}
                  {activeTab==="fundamentals"&&(
                    <div style={S.card}>
                      <div style={{fontSize:13,fontWeight:700,color:C.textSecond,marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>Fundamentals</div>
                      <div style={S.grid2}>
                        {[["P/E Ratio",fval(f.peRatio),f.peRatio?.context],["ROCE %",fval(f.roce),null],["Debt / Equity",fval(f.debtToEquity),null],["Net Profit (Cr)",fval(f.netProfit),null],["Free Cash Flow",fval(f.freeCashFlow),null],["5Yr Profit Growth",fval(f.profitGrowth5Y),null],["Pledged %",fval(f.pledgedPct),null],["52W High / Low",priceRange?`${fmt(priceRange.week52High)} / ${fmt(priceRange.week52Low)}`:"NA",null]].map(([l,v,ctx])=><MetricBox key={l} label={l} value={v} sub={ctx}/>)}
                      </div>
                      {aiEnabled&&aiData?.dueDiligence?.fundamentalStrengths&&(
                        <div style={{marginTop:14,padding:"10px 14px",background:C.purpleLight,border:`1px solid ${C.purple}22`,borderRadius:10,fontSize:12,color:C.textSecond,lineHeight:1.6}}>
                          <span style={{color:C.purple,fontWeight:700}}>✦ AI Fundamental Read:</span> {aiData.dueDiligence.fundamentalStrengths}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Technicals Tab */}
                  {activeTab==="technicals"&&(
                    <div style={S.card}>
                      <div style={{fontSize:13,fontWeight:700,color:C.textSecond,marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>Technical Levels</div>
                      <div style={S.grid3}>
                        {[["CMP",cmp>0?fmt(cmp):"NA",C.green],["Pivot",tval(t.pivot)!=="NA"?fmt(t.pivot):"NA",C.amber],["R1",tval(t.r1)!=="NA"?fmt(t.r1):"NA",C.red],["R2",tval(t.r2)!=="NA"?fmt(t.r2):"NA",C.red],["S1",tval(t.s1)!=="NA"?fmt(t.s1):"NA",C.green],["S2",tval(t.s2)!=="NA"?fmt(t.s2):"NA",C.green],["EMA 20",tval(t.ema20)!=="NA"?fmt(t.ema20):"NA",C.purple],["EMA 50",tval(t.ema50)!=="NA"?fmt(t.ema50):"NA",C.purple],["EMA 100",tval(t.ema100)!=="NA"?fmt(t.ema100):"NA",C.purple],["52W High",priceRange?.week52High?fmt(priceRange.week52High):"NA",C.green],["52W Low",priceRange?.week52Low?fmt(priceRange.week52Low):"NA",C.amber],["ATH",priceRange?.allTimeHigh?fmt(priceRange.allTimeHigh):"NA",C.purple]].map(([l,v,c])=>(
                          <div key={l} style={{background:C.surfaceAlt,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                            <div style={{fontSize:10,color:C.textThird,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:".3px"}}>{l}</div>
                            <div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {aiEnabled&&aiData?.dueDiligence?.technicalSetup&&(
                        <div style={{marginTop:14,padding:"10px 14px",background:C.purpleLight,border:`1px solid ${C.purple}22`,borderRadius:10,fontSize:12,color:C.textSecond,lineHeight:1.6}}>
                          <span style={{color:C.purple,fontWeight:700}}>✦ AI Technical Read:</span> {aiData.dueDiligence.technicalSetup}
                        </div>
                      )}
                      <div style={{marginTop:16,borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`}}>
                        <div style={{padding:"10px 16px",background:C.surfaceAlt,borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.textSecond,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>Candlestick · Pivot / Support / Resistance</div>
                        <PivotChart defaultSymbol={header.ticker||"RELIANCE"}/>
                      </div>
                    </div>
                  )}

                  {/* Peers Tab */}
                  {activeTab==="peers"&&(
                    <div style={S.card}>
                      <div style={{fontSize:13,fontWeight:700,color:C.textSecond,marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>Sector Peers — {selected?.peers?.sector}</div>
                      <div style={{fontSize:11,color:C.textThird,marginBottom:12}}>Ranked by composite score</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {peers.slice(0,12).map((p,i)=>(
                          <div key={i} onClick={()=>loadStock(p.ticker)}
                            style={{background:p.ticker===header.ticker?C.greenLight:C.surfaceAlt,borderRadius:8,padding:"10px 14px",border:`1px solid ${p.ticker===header.ticker?C.green:C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                            onMouseEnter={e=>e.currentTarget.style.background=C.greenLight}
                            onMouseLeave={e=>e.currentTarget.style.background=p.ticker===header.ticker?C.greenLight:C.surfaceAlt}>
                            <div style={{display:"flex",alignItems:"center",gap:12}}>
                              <span style={{fontSize:18,fontWeight:900,color:p.rank<=3?C.green:C.textThird,fontFamily:"Georgia,serif",minWidth:36}}>#{p.rank}</span>
                              <div>
                                <div style={{fontWeight:700,color:p.ticker===header.ticker?C.greenDark:C.textPrimary}}>{p.ticker}</div>
                                <div style={{fontSize:11,color:C.textSecond}}>{p.name?.split(" ").slice(0,3).join(" ")}</div>
                              </div>
                            </div>
                            <div style={{textAlign:"right",fontSize:12,color:C.textSecond}}>
                              {p.cmp&&<div style={{fontWeight:700,color:C.textPrimary}}>₹{p.cmp}</div>}
                              {p.pe&&<div>P/E {parseFloat(p.pe).toFixed(1)}x</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Analysis Tab */}
                  {activeTab==="ai"&&(
                    <AIAnalysisTab
                      ai={aiData}
                      loading={aiLoading}
                      error={aiError}
                      cmp={cmp}
                      onRetry={()=>runAI(header.ticker,selected,priceRange)}
                    />
                  )}
                </div>

                {/* Right column — unchanged */}
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <FairValuePanel cmp={cmp>0?cmp:500} eps={epsNum>0?epsNum:10} ticker={header.ticker||""}/>
                  <TrendingStocks onSelectStock={loadStock}/>
                  {priceRange&&cmp>0&&(
                    <div style={S.card}>
                      <div style={{fontSize:12,fontWeight:700,color:C.textSecond,marginBottom:10,textTransform:"uppercase",letterSpacing:".5px"}}>Price Position</div>
                      {[["vs 52W High",priceRange.week52High,C.green],["vs 52W Low",priceRange.week52Low,C.amber],["vs ATH",priceRange.allTimeHigh,C.purple]].map(([l,ref,c])=>{
                        if(!ref||!cmp) return null;
                        const pct=(((cmp-ref)/ref)*100).toFixed(1);
                        return(
                          <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8,alignItems:"center"}}>
                            <span style={{color:C.textSecond}}>{l}</span>
                            <span style={{fontWeight:700,padding:"3px 10px",borderRadius:6,fontSize:12,background:parseFloat(pct)>=0?C.greenLight:C.redLight,color:parseFloat(pct)>=0?C.greenText:C.redText}}>
                              {parseFloat(pct)>=0?"+":""}{pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{...S.card,background:C.surface}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.textPrimary,marginBottom:12,textTransform:"uppercase",letterSpacing:".5px"}}>Before You Invest</div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.greenText,background:C.greenLight,borderRadius:6,padding:"4px 10px",display:"inline-block",marginBottom:8}}>✓ Why stocks can be great</div>
                      {["Long-term wealth creation — equity beats inflation over 10+ years","Dividend income — some stocks pay regular cash to shareholders","Liquidity — buy/sell anytime on NSE/BSE","Part-ownership of a real business you believe in","Compounding — reinvested returns grow exponentially over time"].map((p,i)=>(
                        <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
                          <span style={{color:C.green,fontWeight:700,fontSize:13,marginTop:1}}>+</span>
                          <span style={{fontSize:12,color:C.textSecond,lineHeight:1.6}}>{p}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{borderTop:`1px solid ${C.border}`,marginBottom:12}}/>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.redText,background:C.redLight,borderRadius:6,padding:"4px 10px",display:"inline-block",marginBottom:8}}>✗ Risks to know first</div>
                      {["Market volatility — prices can drop 30–50% even in good companies","Requires patience — short-term thinking often leads to losses","Business risk — poor management or sector disruption can destroy value","Emotional bias — fear and greed are the investor's worst enemies","No guaranteed returns — unlike FDs, equity has no assured income"].map((p,i)=>(
                        <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
                          <span style={{color:C.red,fontWeight:700,fontSize:13,marginTop:1}}>−</span>
                          <span style={{fontSize:12,color:C.textSecond,lineHeight:1.6}}>{p}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{borderTop:`1px solid ${C.border}`,marginBottom:12}}/>
                    <div style={{fontSize:11,fontWeight:700,color:C.blueText,background:C.blueLight,borderRadius:6,padding:"4px 10px",display:"inline-block",marginBottom:8}}>✓ Your pre-buy checklist</div>
                    {["Is earnings stable for last 5 years?","Is debt-to-equity below 1?","Is ROCE above 15%?","Is CMP below or near fair value?","Have you read the last annual report?"].map((p,i)=>(
                      <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
                        <span style={{color:C.blue,fontWeight:700,fontSize:12,marginTop:1}}>☐</span>
                        <span style={{fontSize:12,color:C.textSecond,lineHeight:1.6}}>{p}</span>
                      </div>
                    ))}
                    <div style={{marginTop:10,fontSize:10,color:C.textThird,lineHeight:1.5,borderTop:`1px solid ${C.border}`,paddingTop:8}}>Data for educational purposes only. Not SEBI registered investment advice.</div>
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
