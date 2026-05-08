import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ScatterChart, Scatter
} from 'recharts'

// ═══════════════════════════════════════════════════════════════════════
// BLOOMBERG THEME
// ═══════════════════════════════════════════════════════════════════════
const T = {
  bg:       '#0A0A0A',
  surface:  '#111111',
  card:     '#161616',
  border:   '#222222',
  borderHi: '#2A2A2A',
  accent:   '#00D4AA',
  accentDim:'#00D4AA33',
  text:     '#E8E8E8',
  textDim:  '#888888',
  textMute: '#444444',
  green:    '#00D4AA',
  red:      '#FF4444',
  yellow:   '#FFD700',
  blue:     '#4A9EFF',
  purple:   '#B44FFF',
  orange:   '#FF8C00',
  font:     "'IBM Plex Mono','Courier New',monospace",
  fontSans: "'IBM Plex Sans','Segoe UI',sans-serif",
}

const ETF_COLORS: Record<string,string> = {
  ISWD:'#00D4AA', IUSF:'#4A9EFF', ISDE:'#FFD700',
  AMAL:'#FF4444', HIWS:'#FF8C00', IWDA:'#888888',
  CSPX:'#555555', GLD:'#FFD700',
}
const getColor = (k: string) => {
  if (ETF_COLORS[k]) return ETF_COLORS[k]
  let h = 0; for (const c of k) h = (h*31+c.charCodeAt(0))&0xffffffff
  const cols = ['#00D4AA','#4A9EFF','#FFD700','#FF4444','#B44FFF','#FF8C00']
  return cols[Math.abs(h) % cols.length]
}

// ═══════════════════════════════════════════════════════════════════════
// API LAYER WITH CACHE
// ═══════════════════════════════════════════════════════════════════════
const _clientCache: Record<string, {data:any; ts:number}> = {}
const CACHE_TTL = 60 * 60 * 1000 // 1h

async function api<T>(url: string, opts?: RequestInit, cacheTTL = CACHE_TTL): Promise<T> {
  const key = url + JSON.stringify(opts?.body || '')
  const cached = _clientCache[key]
  if (cached && Date.now() - cached.ts < cacheTTL) return cached.data as T
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => '')}`)
  const data = await res.json()
  _clientCache[key] = { data, ts: Date.now() }
  return data as T
}

function useApi<T>(url: string | null, opts?: RequestInit, ttl = CACHE_TTL) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const urlRef = useRef(url)

  useEffect(() => {
    if (!url) return
    setLoading(true); setError(null)
    api<T>(url, opts, ttl)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [url])

  return { data, loading, error }
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════
const Loader = ({ text = 'Loading…' }: { text?: string }) => (
  <div style={{ display:'flex', gap:10, alignItems:'center', color:T.textDim, padding:24, fontSize:'0.82rem', fontFamily:T.font }}>
    <div style={{ width:12, height:12, border:`1.5px solid ${T.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
    {text}
  </div>
)

const Err = ({ msg }: { msg: string }) => (
  <div style={{ background:'#1A0808', border:`1px solid ${T.red}44`, borderRadius:6, padding:'10px 14px', color:T.red, fontSize:'0.78rem', fontFamily:T.font }}>
    ⚠ {msg}
  </div>
)

const BloomTT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:4, padding:'8px 12px', fontSize:'0.75rem', fontFamily:T.font }}>
      <div style={{ color:T.textDim, marginBottom:4 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color:p.color || T.text, display:'flex', gap:8 }}>
          <span style={{ color:T.textDim }}>{p.name}:</span>
          <span>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const Card = ({ children, style }: any) => (
  <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:6, ...style }}>{children}</div>
)

const CardHeader = ({ title, sub }: { title: string; sub?: string }) => (
  <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
    <span style={{ color:T.text, fontWeight:700, fontSize:'0.82rem', fontFamily:T.fontSans }}>{title}</span>
    {sub && <span style={{ color:T.textMute, fontSize:'0.68rem', fontFamily:T.font }}>{sub}</span>}
  </div>
)

const Pill = ({ label, active, color, onClick }: any) => (
  <button onClick={onClick} style={{ padding:'3px 10px', borderRadius:2, border:`1px solid ${active ? color : T.border}`, background:active ? color+'22' : 'transparent', color:active ? color : T.textDim, cursor:'pointer', fontSize:'0.72rem', fontFamily:T.font, fontWeight:active?700:400, transition:'all 0.1s' }}>
    {label}
  </button>
)

const Val = ({ v, good, bad, suffix='' }: { v: number|string; good?: number; bad?: number; suffix?: string }) => {
  const n = typeof v === 'number' ? v : parseFloat(v as string)
  const color = good !== undefined && n > good ? T.green
               : bad  !== undefined && n < bad  ? T.red
               : T.text
  return <span style={{ color, fontFamily:T.font, fontWeight:700 }}>{typeof n === 'number' && !isNaN(n) && n > 0 && suffix !== '%' ? '' : ''}{v}{suffix}</span>
}

const SigBadge = ({ p }: { p: number }) => {
  const [label, color] = p < 0.01 ? ['★★★ p<0.01', T.green]
                       : p < 0.05 ? ['★★ p<0.05',  T.accent]
                       : p < 0.10 ? ['★ p<0.10',   T.yellow]
                       : ['NS', T.red]
  return <span style={{ color, fontFamily:T.font, fontSize:'0.7rem', fontWeight:700 }}>{label}</span>
}

const SignalDot = ({ signal }: { signal: string }) => (
  <span style={{ color: signal==='bullish'?T.green : signal==='bearish'?T.red : T.yellow, fontFamily:T.font, fontSize:'0.7rem', fontWeight:700 }}>
    {signal==='bullish' ? '▲ BULL' : signal==='bearish' ? '▼ BEAR' : '● NEUT'}
  </span>
)

// ═══════════════════════════════════════════════════════════════════════
// DATA HOOKS
// ═══════════════════════════════════════════════════════════════════════
function useRegistry() {
  return useApi<{registry: Record<string,any>; count: number}>('/api/registry')
}

function useLive() {
  const [data, setData]   = useState<Record<string,any>>({})
  const [loading, setLoading] = useState(true)
  const fetch_ = useCallback(async () => {
    try { const d = await api<Record<string,any>>('/api/live', undefined, 5*60*1000); setData(d) }
    catch(e) { console.error(e) } finally { setLoading(false) }
  },[])
  useEffect(() => { fetch_(); const t = setInterval(fetch_, 60000); return () => clearInterval(t) },[fetch_])
  return { data, loading, refresh: fetch_ }
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 1 — DISCOVER
// ═══════════════════════════════════════════════════════════════════════
function DiscoverTab({ registry }: { registry: Record<string,any> }) {
  const { data: live, loading: liveLoading, refresh } = useLive()
  const allKeys = Object.keys(registry)

  // Auto-load compare for all halal ETFs
  const halalKeys = allKeys.filter(k => registry[k]?.halal)
  const compareUrl = halalKeys.length > 0 ? `/api/compare?keys=${halalKeys.join(',')}&period=5y` : null
  const { data: compareData, loading: compareLoading } = useApi<Record<string,any>>(compareUrl)

  const perfData = (() => {
    if (!compareData) return []
    const dates = new Set<string>()
    Object.values(compareData).forEach((d:any) => d.normalized?.dates?.forEach((dt:string) => dates.add(dt)))
    return [...dates].sort().map(date => {
      const row: any = { date }
      Object.entries(compareData).forEach(([k,v]:any) => {
        const idx = v.normalized?.dates?.indexOf(date)
        if (idx != null && idx !== -1) row[k] = v.normalized.prices[idx]
      })
      return row
    })
  })()

  return (
    <div>
      {/* What is this? Banner */}
      <div style={{ background:`linear-gradient(135deg, ${T.accentDim}, transparent)`, border:`1px solid ${T.accent}33`, borderRadius:6, padding:'14px 20px', marginBottom:16 }}>
        <div style={{ fontFamily:T.fontSans, fontWeight:700, color:T.accent, marginBottom:4 }}>📡 DISCOVER — What are Halal ETFs?</div>
        <div style={{ color:T.textDim, fontSize:'0.78rem', lineHeight:1.7 }}>
          Halal ETFs exclude companies involved in alcohol, tobacco, weapons, gambling and conventional banking (riba).
          They are certified by an independent <strong style={{color:T.text}}>Shariah Board</strong> and screened quarterly.
          All ETFs below trade on the <strong style={{color:T.text}}>London Stock Exchange (LSE)</strong> and are accessible via a French CTO account.
        </div>
      </div>

      {/* Live prices grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:8, marginBottom:16 }}>
        {allKeys.map(key => {
          const lp = live[key]; const info = registry[key]
          const up = (lp?.change_pct || 0) >= 0
          return (
            <Card key={key} style={{ padding:14, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:getColor(key) }}/>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontFamily:T.font, fontWeight:800, color:getColor(key), fontSize:'0.88rem' }}>{key}</span>
                {info?.halal && <span style={{ color:T.green, fontSize:'0.6rem', fontFamily:T.font }}>✓ HALAL</span>}
              </div>
              <div style={{ color:T.textMute, fontSize:'0.62rem', fontFamily:T.fontSans, marginBottom:8, lineHeight:1.3 }}>{info?.name}</div>
              {liveLoading ? <div style={{ color:T.textMute, fontSize:'0.75rem' }}>…</div> : lp?.price ? (
                <>
                  <div style={{ fontFamily:T.font, fontWeight:800, fontSize:'1.15rem', color:T.text }}>{lp.price.toFixed(2)}</div>
                  <div style={{ color:up?T.green:T.red, fontFamily:T.font, fontSize:'0.78rem', fontWeight:700 }}>
                    {up?'▲':'▼'} {Math.abs(lp.change_pct||0).toFixed(2)}%
                  </div>
                  <div style={{ color:T.textMute, fontSize:'0.58rem', fontFamily:T.font, marginTop:2 }}>
                    {lp.source==='live'?'● LIVE':'○ EST'} · {lp.currency}
                  </div>
                </>
              ) : <div style={{ color:T.textMute, fontSize:'0.72rem' }}>N/A</div>}
              <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}`, display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                <div><div style={{ color:T.textMute, fontSize:'0.58rem' }}>TER</div><div style={{ color:T.text, fontSize:'0.7rem', fontFamily:T.font }}>{info?.ter}%</div></div>
                <div><div style={{ color:T.textMute, fontSize:'0.58rem' }}>Region</div><div style={{ color:T.text, fontSize:'0.7rem', fontFamily:T.font }}>{info?.region}</div></div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Performance chart */}
      <Card style={{ marginBottom:16 }}>
        <CardHeader title="5-Year Cumulative Performance (Halal ETFs, base 100)" sub={compareLoading?'Loading…':`${Object.keys(compareData||{}).length} ETFs`} />
        <div style={{ padding:16 }}>
          {compareLoading ? <Loader text="Fetching 5-year price history…" /> : perfData.length === 0 ? <Loader text="Preparing chart…" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={perfData} margin={{top:5,right:10,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.border}/>
                <XAxis dataKey="date" tick={{fill:T.textMute,fontSize:9,fontFamily:T.font}} tickLine={false} interval={Math.max(1,Math.floor(perfData.length/8))}/>
                <YAxis tick={{fill:T.textMute,fontSize:9,fontFamily:T.font}} tickLine={false}/>
                <Tooltip content={<BloomTT/>}/>
                <ReferenceLine y={100} stroke={T.border} strokeDasharray="4 2"/>
                {halalKeys.map(k => <Line key={k} type="monotone" dataKey={k} stroke={getColor(k)} strokeWidth={1.5} dot={false}/>)}
                <Legend wrapperStyle={{fontSize:'0.72rem',fontFamily:T.font}}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Halal info table */}
      <Card>
        <CardHeader title="Shariah Certification Details" sub="Source: MSCI Shariah Board"/>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem', fontFamily:T.font }}>
            <thead>
              <tr style={{ background:T.surface }}>
                {['ETF','Full Name','ISIN','TER','Shariah Board','Screens','PEA','PER','CTO'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', color:T.textDim, fontWeight:600, textAlign:'left', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allKeys.filter(k=>registry[k]?.halal).map((key,i) => {
                const info = registry[key]
                return (
                  <tr key={key} style={{ background:i%2?T.surface:'transparent' }}>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:getColor(key), fontWeight:800 }}>{key}</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.textDim, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{info.name}</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.textMute }}>{info.isin}</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.yellow }}>{info.ter}%/yr</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.textDim }}>{info.board}</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.textMute, fontSize:'0.65rem' }}>Alcohol·Tobacco·Weapons·Riba</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.red }}>✗</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.red }}>✗</td>
                    <td style={{ padding:'8px 12px', borderBottom:`1px solid ${T.border}`, color:T.green }}>✓</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${T.border}`, color:T.textMute, fontSize:'0.68rem' }}>
          ⚠ Islamic ETFs are domiciled in Ireland (UCITS). Not eligible for PEA (UK/IE domicile). Not available as PER units. CTO is the only viable French account. TTF does NOT apply to UCITS ETFs.
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 2 — ANALYZE
// ═══════════════════════════════════════════════════════════════════════
function AnalyzeTab({ registry }: { registry: Record<string,any> }) {
  const allKeys = Object.keys(registry)
  const [key, setKey]       = useState('ISWD')
  const [period, setPeriod] = useState('5y')
  const { data, loading, error } = useApi<any>(key ? `/api/metrics/${key}?period=${period}` : null)

  const m  = data?.metrics || {}
  const sg = data?.signals || {}
  const si = data?.significance || {}

  const METRICS_GROUPS = [
    { label:'PERFORMANCE',    items:[['CAGR',m.cagr,'%',8,0],['Total Return',m.total_return,'%',0,null],['Annualized Slope',m.annualized_slope,'%',null,null]] },
    { label:'RISK-ADJUSTED',  items:[['Sharpe Ratio',m.sharpe,'',1,0],['Sortino Ratio',m.sortino,'',1.5,0],['Calmar Ratio',m.calmar,'',0.5,0],['Omega Ratio',m.omega,'',1.5,null]] },
    { label:'DRAWDOWN',       items:[['Max Drawdown',m.max_drawdown,'%',null,-40],['Ulcer Index',m.ulcer_index,'%',null,null]] },
    { label:'TAIL RISK',      items:[['VaR 95%',m.var_95,'%',null,null],['CVaR 95%',m.cvar_95,'%',null,null]] },
    { label:'DISTRIBUTION',   items:[['Skewness',m.skewness,'',0,null],['Excess Kurtosis',m.excess_kurtosis,'',null,null],['Win Rate',m.win_rate,'%',55,null]] },
    { label:'STRUCTURE',      items:[['Log R²',m.log_r_squared,'',0.85,null],['Autocorr lag-1',m.autocorr_lag1,'',null,null]] },
  ]

  const rollingData = m.rolling_1y || []

  return (
    <div>
      <div style={{ background:T.accentDim, border:`1px solid ${T.accent}33`, borderRadius:6, padding:'10px 16px', marginBottom:14, fontSize:'0.75rem', color:T.textDim, fontFamily:T.fontSans }}>
        <strong style={{color:T.accent}}>HOW TO USE:</strong> Select an ETF → Select a period → Read the 20+ metrics below.
        Green = good · Red = caution · ★★★ = statistically significant result you can trust.
      </div>

      {/* Controls */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {allKeys.map(k => <Pill key={k} label={k} active={key===k} color={getColor(k)} onClick={()=>setKey(k)}/>)}
        </div>
        <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
          {['1y','2y','3y','5y'].map(p => <Pill key={p} label={p} active={period===p} color={T.accent} onClick={()=>setPeriod(p)}/>)}
        </div>
      </div>

      {loading ? <Loader text={`Computing 20+ metrics for ${key}…`} /> : error ? <Err msg={error} /> : data && (
        <>
          {/* Significance banner */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:8, marginBottom:14 }}>
            {[
              { label:'Sharpe significance', v:si.sharpe_p_value, el:<SigBadge p={si.sharpe_p_value||1}/> },
              { label:'CAGR significance',   v:si.cagr_p_value,   el:<SigBadge p={si.cagr_p_value||1}/> },
              { label:'Alpha vs MSCI World', v:null,              el:<span style={{color:T.text,fontFamily:T.font,fontSize:'0.75rem',fontWeight:700}}>{si.alpha?.alpha_pct?.toFixed(2)||'—'}%/yr</span> },
              { label:'Data quality',        v:null,              el:<span style={{color:si.data_quality==='high'?T.green:si.data_quality==='medium'?T.yellow:T.red,fontFamily:T.font,fontSize:'0.75rem',fontWeight:700}}>{(si.data_quality||'—').toUpperCase()}</span> },
              { label:'Sharpe 95% CI',       v:null,              el:<span style={{color:T.text,fontFamily:T.font,fontSize:'0.72rem'}}>[{si.sharpe_ci95_low?.toFixed(2)||'—'} – {si.sharpe_ci95_high?.toFixed(2)||'—'}]</span> },
              { label:'Overall significance',v:null,              el:<span style={{color:si.overall==='strong'?T.green:si.overall==='moderate'?T.yellow:T.red,fontFamily:T.font,fontSize:'0.75rem',fontWeight:700}}>{(si.overall||'—').toUpperCase()}</span> },
            ].map(item => (
              <Card key={item.label} style={{padding:'10px 14px'}}>
                <div style={{color:T.textMute,fontSize:'0.65rem',fontFamily:T.font,marginBottom:4}}>{item.label}</div>
                {item.el}
              </Card>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            {/* Metrics table */}
            <Card>
              <CardHeader title={`${key} — 20+ Metrics (${period})`} sub={data.source==='live'?'● LIVE DATA':'○ Estimated'}/>
              <div style={{ padding:'0 4px', maxHeight:400, overflowY:'auto' }}>
                {METRICS_GROUPS.map(group => (
                  <div key={group.label}>
                    <div style={{ padding:'8px 12px 4px', color:T.accent, fontSize:'0.62rem', fontFamily:T.font, fontWeight:700, letterSpacing:2 }}>{group.label}</div>
                    {group.items.map(([label,val,suf,good,bad]) => (
                      <div key={label as string} style={{ display:'flex', justifyContent:'space-between', padding:'4px 12px', borderBottom:`1px solid ${T.border}11` }}>
                        <span style={{ color:T.textDim, fontSize:'0.73rem', fontFamily:T.fontSans }}>{label as string}</span>
                        <Val v={typeof val==='number'?val:0} good={good as number} bad={bad as number} suffix={suf as string}/>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

            {/* AI Signals */}
            <Card>
              <CardHeader title="AI Signals" sub={`Composite: ${(sg.composite||'—').toUpperCase()}`}/>
              <div style={{ padding:14 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                  {[
                    { label:'Renaissance Score', v:sg.renaissance_score, color:T.purple },
                    { label:'Buffett Quality',   v:sg.buffett_quality,   color:T.blue },
                  ].map(sc => (
                    <div key={sc.label} style={{ background:T.surface, borderRadius:4, padding:12, border:`1px solid ${sc.color}33`, textAlign:'center' }}>
                      <div style={{ color:T.textMute, fontSize:'0.65rem', fontFamily:T.font, marginBottom:6 }}>{sc.label}</div>
                      <div style={{ color:sc.color, fontFamily:T.font, fontWeight:800, fontSize:'1.8rem' }}>{sc.v||'—'}</div>
                      <div style={{ color:T.textMute, fontSize:'0.65rem' }}>/100</div>
                      <div style={{ background:T.border, height:4, borderRadius:2, marginTop:8 }}>
                        <div style={{ width:`${sc.v||0}%`, height:'100%', background:sc.color, borderRadius:2 }}/>
                      </div>
                    </div>
                  ))}
                </div>
                {[
                  ['RSI 14',         sg.rsi_14?.toFixed(1),    sg.rsi_signal,       '<30 oversold | >70 overbought'],
                  ['Z-Score',        sg.z_score?.toFixed(2),   sg.z_signal,         '<-1.5 mean reversion buy'],
                  ['EMA Cross',      `${sg.ema_cross_pct?.toFixed(1)}%`, sg.ema_signal, 'EMA50 vs EMA200'],
                  ['MACD Hist.',     sg.macd_histogram?.toFixed(4), sg.macd_signal,  'Signal line cross'],
                  ['Momentum 12-1',  `${sg.momentum_12_1?.toFixed(1)}%`, sg.momentum_signal, 'Jegadeesh-Titman'],
                  ['Trend R²',       sg.trend_r2?.toFixed(3),  sg.composite,        'Log-linear quality'],
                ].map(([label,val,signal,hint]) => (
                  <div key={label as string} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ flex:1 }}>
                      <div style={{ color:T.textDim, fontSize:'0.72rem', fontFamily:T.fontSans }}>{label as string}</div>
                      <div style={{ color:T.textMute, fontSize:'0.62rem', fontFamily:T.font }}>{hint as string}</div>
                    </div>
                    <span style={{ color:T.text, fontFamily:T.font, fontSize:'0.75rem' }}>{val||'—'}</span>
                    <SignalDot signal={signal as string}/>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Rolling 1y chart */}
          {rollingData.length > 0 && (
            <Card>
              <CardHeader title={`${key} — Rolling 12-month CAGR`} sub="Each bar = 1yr return ending that month"/>
              <div style={{ padding:14 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={rollingData} margin={{top:5,right:10,bottom:5,left:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false}/>
                    <XAxis dataKey="date" tick={{fill:T.textMute,fontSize:8,fontFamily:T.font}} tickLine={false} interval={5}/>
                    <YAxis tick={{fill:T.textMute,fontSize:8,fontFamily:T.font}} tickLine={false} tickFormatter={v=>`${v}%`}/>
                    <Tooltip content={<BloomTT/>}/>
                    <ReferenceLine y={0} stroke={T.textMute}/>
                    <Bar dataKey="return" name="1yr CAGR %" fill={T.accent} opacity={0.8} radius={[1,1,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 3 — SIMULATE
// ═══════════════════════════════════════════════════════════════════════
function SimulateTab({ registry }: { registry: Record<string,any> }) {
  const allKeys = Object.keys(registry).filter(k => registry[k]?.halal)
  const [keys,   setKeys]   = useState(['ISWD'])
  const [strategy, setStrat] = useState('buy_and_hold')
  const [capital, setCap]   = useState(10000)
  const [period,  setPeriod] = useState('5y')
  const [monthly, setMonthly] = useState(200)
  const [dcaKey,  setDcaKey] = useState('ISWD')
  const [dcaVariant, setDcaVariant] = useState('classic')
  const [loading, setLoading] = useState(false)
  const [result,  setResult] = useState<any>(null)
  const [dcaResult, setDcaResult] = useState<any>(null)
  const [activeView, setActiveView] = useState<'backtest'|'dca'>('dca')

  const runDca = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('/api/dca', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:dcaKey,monthly_amount:monthly,period,variant:dcaVariant})}, 0)
      setDcaResult(d)
    } catch(e:any) { console.error(e) }
    setLoading(false)
  },[dcaKey,monthly,period,dcaVariant])

  const runBacktest = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api('/api/backtest', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({keys,strategy,capital,period})}, 0)
      setResult(d)
    } catch(e:any) { console.error(e) }
    setLoading(false)
  },[keys,strategy,capital,period])

  useEffect(() => { runDca() }, [dcaKey, monthly, period, dcaVariant])

  const STRATEGIES = [
    { id:'buy_and_hold', label:'Buy & Hold', desc:'Invest once, never sell. Simplest strategy.' },
    { id:'adn',          label:'ADN Adaptive', desc:'Reduces exposure when market is volatile.' },
    { id:'renaissance',  label:'Renaissance', desc:'Composite momentum + trend signal.' },
    { id:'momentum',     label:'Momentum',    desc:'Buys past winners, avoids losers.' },
  ]

  const dca_s = dcaResult?.summary || {}
  const eq    = result?.equity_curve || []
  const bench_eq = eq  // would need separate fetch for benchmark

  return (
    <div>
      <div style={{ background:T.accentDim, border:`1px solid ${T.accent}33`, borderRadius:6, padding:'10px 16px', marginBottom:14, fontSize:'0.75rem', color:T.textDim, fontFamily:T.fontSans }}>
        <strong style={{color:T.accent}}>HOW TO USE:</strong>{' '}
        <strong style={{color:T.text}}>DCA</strong> = "If I had invested €X/month, what would I have today?" →{' '}
        <strong style={{color:T.text}}>Backtest</strong> = "How would a trading strategy have performed?"
        Choose your scenario, then run.
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:14 }}>
        <Pill label="💰 DCA Simulation"         active={activeView==='dca'}      color={T.accent}  onClick={()=>setActiveView('dca')}/>
        <Pill label="🔬 Strategy Backtest"       active={activeView==='backtest'} color={T.blue}    onClick={()=>setActiveView('backtest')}/>
      </div>

      {activeView === 'dca' && (
        <>
          {/* DCA Controls */}
          <Card style={{padding:16, marginBottom:14}}>
            <div style={{color:T.accent,fontSize:'0.68rem',fontFamily:T.font,fontWeight:700,marginBottom:10,letterSpacing:2}}>DCA PARAMETERS</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>ETF</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {allKeys.map(k=><Pill key={k} label={k} active={dcaKey===k} color={getColor(k)} onClick={()=>setDcaKey(k)}/>)}
                </div>
              </div>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>Monthly Amount</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[50,100,200,500,1000].map(a=><Pill key={a} label={`€${a}`} active={monthly===a} color={T.accent} onClick={()=>setMonthly(a)}/>)}
                </div>
              </div>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>Period</div>
                <div style={{display:'flex',gap:5}}>
                  {['1y','2y','3y','5y'].map(p=><Pill key={p} label={p} active={period===p} color={T.blue} onClick={()=>setPeriod(p)}/>)}
                </div>
              </div>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>Variant</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[['classic','Classic'],['smart_dca','Smart (2× on dip)'],['momentum_weighted','Momentum-wtd']].map(([id,label])=>(
                    <Pill key={id} label={label} active={dcaVariant===id} color={T.yellow} onClick={()=>setDcaVariant(id)}/>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {loading ? <Loader text={`Running DCA simulation on ${dcaKey}…`}/> : dcaResult && (
            <>
              {/* KPI row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:14}}>
                {[
                  {label:'Total Invested', v:`€${dca_s.total_invested?.toLocaleString()}`,    c:T.textDim},
                  {label:'Final Value',    v:`€${dca_s.final_value?.toLocaleString()}`,        c:getColor(dcaKey)},
                  {label:'Total Gain',     v:`€${dca_s.gain?.toLocaleString()}`,               c:dca_s.gain>0?T.green:T.red},
                  {label:'Return',         v:`${dca_s.return_pct>0?'+':''}${dca_s.return_pct}%`, c:dca_s.return_pct>0?T.green:T.red},
                  {label:'Multiplier',     v:`×${dca_s.multiplier}`,                           c:T.purple},
                  {label:'Months',         v:`${dca_s.n_months}`,                              c:T.textDim},
                ].map(kpi=>(
                  <Card key={kpi.label} style={{padding:'10px 14px'}}>
                    <div style={{color:T.textMute,fontSize:'0.65rem',fontFamily:T.font,marginBottom:3}}>{kpi.label}</div>
                    <div style={{color:kpi.c,fontFamily:T.font,fontWeight:800,fontSize:'1rem'}}>{kpi.v}</div>
                  </Card>
                ))}
              </div>

              {/* DCA Chart */}
              <Card>
                <CardHeader title={`DCA €${monthly}/month on ${dcaKey} — ${period} (${dcaVariant})`} sub={dcaResult.source==='live'?'● LIVE':'○ EST'}/>
                <div style={{padding:14}}>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={dcaResult.records} margin={{top:5,right:10,bottom:5,left:0}}>
                      <defs>
                        <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={getColor(dcaKey)} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={getColor(dcaKey)} stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke={T.border}/>
                      <XAxis dataKey="date" tick={{fill:T.textMute,fontSize:9,fontFamily:T.font}} tickLine={false} interval={5}/>
                      <YAxis tick={{fill:T.textMute,fontSize:9,fontFamily:T.font}} tickLine={false} tickFormatter={v=>`€${(v/1000).toFixed(0)}k`}/>
                      <Tooltip content={<BloomTT/>}/>
                      <Legend wrapperStyle={{fontSize:'0.72rem',fontFamily:T.font}}/>
                      <Area type="monotone" dataKey="invested" name="Invested €" stroke={T.textMute} strokeWidth={1.5} fill="transparent" strokeDasharray="4 2"/>
                      <Area type="monotone" dataKey="value"    name="Portfolio €" stroke={getColor(dcaKey)} strokeWidth={2} fill="url(#gv)"/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {activeView === 'backtest' && (
        <>
          <Card style={{padding:16,marginBottom:14}}>
            <div style={{color:T.blue,fontSize:'0.68rem',fontFamily:T.font,fontWeight:700,marginBottom:10,letterSpacing:2}}>BACKTEST PARAMETERS</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:12}}>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>ETFs (multi-select)</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {allKeys.map(k=><Pill key={k} label={k} active={keys.includes(k)} color={getColor(k)} onClick={()=>setKeys(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k])}/>)}
                </div>
              </div>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>Strategy</div>
                {STRATEGIES.map(s=>(
                  <div key={s.id} onClick={()=>setStrat(s.id)} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'6px 8px',borderRadius:4,cursor:'pointer',background:strategy===s.id?T.blue+'22':'transparent',border:`1px solid ${strategy===s.id?T.blue:T.border}`,marginBottom:4}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:strategy===s.id?T.blue:T.textMute,marginTop:5,flexShrink:0}}/>
                    <div>
                      <div style={{color:strategy===s.id?T.blue:T.text,fontFamily:T.font,fontSize:'0.75rem',fontWeight:700}}>{s.label}</div>
                      <div style={{color:T.textMute,fontFamily:T.fontSans,fontSize:'0.65rem'}}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>Initial Capital</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {[1000,5000,10000,50000].map(c=><Pill key={c} label={`€${c.toLocaleString()}`} active={capital===c} color={T.purple} onClick={()=>setCap(c)}/>)}
                </div>
                <div style={{marginTop:10}}>
                  <div style={{color:T.textDim,fontSize:'0.68rem',fontFamily:T.font,marginBottom:6}}>Period</div>
                  <div style={{display:'flex',gap:5}}>
                    {['2y','3y','5y'].map(p=><Pill key={p} label={p} active={period===p} color={T.blue} onClick={()=>setPeriod(p)}/>)}
                  </div>
                </div>
              </div>
            </div>
            <button onClick={runBacktest} style={{background:T.blue,border:'none',borderRadius:4,padding:'8px 18px',color:'#000',fontWeight:800,cursor:'pointer',fontSize:'0.82rem',fontFamily:T.font}}>
              ▶ RUN BACKTEST
            </button>
          </Card>

          {loading ? <Loader text="Running backtest…"/> : result && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:14}}>
                {[
                  {label:'Strategy',    v:result.strategy,                                                              c:T.blue},
                  {label:'Final Capital',v:`€${result.final_capital?.toLocaleString()}`,                               c:result.final_capital>capital?T.green:T.red},
                  {label:'CAGR',        v:`${result.metrics?.cagr>0?'+':''}${result.metrics?.cagr}%`,                  c:result.metrics?.cagr>8?T.green:T.yellow},
                  {label:'Sharpe',      v:`${result.metrics?.sharpe}`,                                                  c:result.metrics?.sharpe>1?T.green:T.yellow},
                  {label:'Max DD',      v:`${result.metrics?.max_drawdown}%`,                                           c:result.metrics?.max_drawdown>-25?T.green:T.red},
                  {label:'Alpha vs IWDA',v:`${result.alpha_vs_benchmark>0?'+':''}${result.alpha_vs_benchmark}pp`,       c:result.alpha_vs_benchmark>0?T.green:T.red},
                ].map(kpi=>(
                  <Card key={kpi.label} style={{padding:'10px 14px'}}>
                    <div style={{color:T.textMute,fontSize:'0.65rem',fontFamily:T.font,marginBottom:3}}>{kpi.label}</div>
                    <div style={{color:kpi.c,fontFamily:T.font,fontWeight:800,fontSize:'0.88rem'}}>{kpi.v}</div>
                  </Card>
                ))}
              </div>
              {result.regime_stats && (
                <div style={{display:'flex',gap:8,marginBottom:14}}>
                  {[['Bull',result.regime_stats.bull_pct,T.green],['Transition',result.regime_stats.transition_pct,T.yellow],['Bear',result.regime_stats.bear_pct,T.red]].map(([l,v,c])=>(
                    <div key={l as string} style={{background:T.card,border:`1px solid ${c as string}33`,borderRadius:4,padding:'6px 12px',textAlign:'center'}}>
                      <div style={{color:c as string,fontSize:'0.65rem',fontFamily:T.font}}>{l as string} REGIME</div>
                      <div style={{color:c as string,fontFamily:T.font,fontWeight:800}}>{v as string}%</div>
                    </div>
                  ))}
                </div>
              )}
              <Card>
                <CardHeader title="Equity Curve" sub={`${result.strategy} · Initial €${capital.toLocaleString()}`}/>
                <div style={{padding:14}}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={result.equity_curve} margin={{top:5,right:10,bottom:5,left:0}}>
                      <CartesianGrid strokeDasharray="2 4" stroke={T.border}/>
                      <XAxis dataKey="date" tick={{fill:T.textMute,fontSize:9,fontFamily:T.font}} tickLine={false} interval={Math.max(1,Math.floor(result.equity_curve.length/8))}/>
                      <YAxis tick={{fill:T.textMute,fontSize:9,fontFamily:T.font}} tickLine={false} tickFormatter={v=>`€${(v/1000).toFixed(0)}k`}/>
                      <Tooltip content={<BloomTT/>}/>
                      <ReferenceLine y={capital} stroke={T.textMute} strokeDasharray="4 2"/>
                      <Line type="monotone" dataKey="value" name="Portfolio €" stroke={T.blue} strokeWidth={2} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 4 — BUILD
// ═══════════════════════════════════════════════════════════════════════
function BuildTab({ registry }: { registry: Record<string,any> }) {
  const allKeys = Object.keys(registry)
  const halalKeys = allKeys.filter(k => registry[k]?.halal)
  const [allocs, setAllocs]   = useState<Record<string,number>>({ISWD:65,IUSF:35})
  const [monthly, setMonthly] = useState(200)
  const [broker,  setBroker]  = useState('ibkr')
  const [months,  setMonths]  = useState(60)
  const [grossCagr,setGross]  = useState(10)
  const [optMethod, setOpt]   = useState('max_sharpe')
  const [loading, setLoading] = useState(false)
  const [portResult, setPort] = useState<any>(null)
  const [costResult, setCost] = useState<any>(null)
  const [optResult,  setOptR] = useState<any>(null)

  const total = Object.values(allocs).reduce((a,b)=>a+b,0)

  const runAll = useCallback(async () => {
    setLoading(true)
    try {
      const [port, cost] = await Promise.all([
        api('/api/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:'My Portfolio',allocations:allocs,monthly_dca:monthly,period:'5y'})},0),
        api(`/api/costs/compare?etf=ISWD&monthly=${monthly}&months=${months}&gross_cagr=${grossCagr/100}`,undefined,0),
      ])
      setPort(port); setCost(cost)
    } catch(e) { console.error(e) }
    setLoading(false)
  },[allocs,monthly,months,grossCagr])

  const runOpt = useCallback(async () => {
    setLoading(true)
    try {
      const keys = Object.keys(allocs).filter(k=>k in registry)
      if (keys.length < 2) { alert('Select at least 2 ETFs'); setLoading(false); return }
      const opt = await api('/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({keys,method:optMethod,period:'3y'})},0)
      setOptR(opt)
    } catch(e) { console.error(e) }
    setLoading(false)
  },[allocs,optMethod,registry])

  const BROKERS = ['ibkr','boursorama','fortuneo','swissquote','bp','cic','laposte']
  const BROKER_LABELS: Record<string,string> = {ibkr:'IBKR',boursorama:'Boursorama',fortuneo:'Fortuneo',swissquote:'Swissquote',bp:'Banque Pop.',cic:'CIC',laposte:'La Poste'}

  const pm  = portResult?.portfolio_metrics || {}
  const pdca = portResult?.portfolio_dca?.summary || {}
  const ranking = costResult?.ranking || []

  return (
    <div>
      <div style={{background:T.accentDim,border:`1px solid ${T.accent}33`,borderRadius:6,padding:'10px 16px',marginBottom:14,fontSize:'0.75rem',color:T.textDim,fontFamily:T.fontSans}}>
        <strong style={{color:T.accent}}>HOW TO USE:</strong>{' '}
        1. Set your <strong style={{color:T.text}}>allocation %</strong> between ETFs (must total 100%) →
        2. Set your <strong style={{color:T.text}}>monthly DCA amount</strong> →
        3. Click <strong style={{color:T.text}}>Analyze</strong> to see performance + cost comparison →
        4. Or click <strong style={{color:T.text}}>Optimize</strong> to let the algorithm find the best weights.
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        {/* Allocation builder */}
        <Card style={{padding:16}}>
          <div style={{color:T.accent,fontSize:'0.68rem',fontFamily:T.font,fontWeight:700,marginBottom:10,letterSpacing:2}}>PORTFOLIO ALLOCATION</div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            <span style={{color:T.textDim,fontSize:'0.72rem',fontFamily:T.font}}>Total</span>
            <span style={{color:total===100?T.green:T.red,fontFamily:T.font,fontWeight:800}}>{total}%</span>
          </div>
          {allKeys.filter(k=>registry[k]?.halal||k in allocs).map(etf=>(
            <div key={etf} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:getColor(etf),flexShrink:0}}/>
              <span style={{color:getColor(etf),fontFamily:T.font,fontWeight:700,width:44,fontSize:'0.78rem'}}>{etf}</span>
              <input type="range" min={0} max={100} value={allocs[etf]||0}
                onChange={e=>{const v=+e.target.value; if(v===0){const n={...allocs};delete n[etf];setAllocs(n)}else setAllocs(p=>({...p,[etf]:v}))}}
                style={{flex:1,accentColor:getColor(etf)}}/>
              <input type="number" min={0} max={100} value={allocs[etf]||0}
                onChange={e=>{const v=+e.target.value; if(v===0){const n={...allocs};delete n[etf];setAllocs(n)}else setAllocs(p=>({...p,[etf]:v}))}}
                style={{width:44,background:T.surface,border:`1px solid ${T.border}`,borderRadius:3,padding:'3px 6px',color:T.text,fontSize:'0.75rem',fontFamily:T.font,textAlign:'right'}}/>
              <span style={{color:T.textMute,fontSize:'0.72rem'}}>%</span>
            </div>
          ))}
          <div style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap'}}>
            <div>
              <div style={{color:T.textDim,fontSize:'0.65rem',fontFamily:T.font,marginBottom:4}}>Monthly DCA</div>
              <div style={{display:'flex',gap:4}}>
                {[100,200,500,1000].map(a=><Pill key={a} label={`€${a}`} active={monthly===a} color={T.accent} onClick={()=>setMonthly(a)}/>)}
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button onClick={runAll} disabled={total!==100||loading} style={{background:total===100?T.accent:T.textMute,border:'none',borderRadius:3,padding:'7px 14px',color:'#000',fontWeight:800,cursor:total===100?'pointer':'not-allowed',fontSize:'0.78rem',fontFamily:T.font}}>
              ▶ ANALYZE
            </button>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              {['max_sharpe','min_vol','risk_parity'].map(m=><Pill key={m} label={m.replace('_',' ')} active={optMethod===m} color={T.purple} onClick={()=>setOpt(m)}/>)}
              <button onClick={runOpt} disabled={loading} style={{background:T.purple,border:'none',borderRadius:3,padding:'7px 10px',color:'#fff',fontWeight:800,cursor:'pointer',fontSize:'0.75rem',fontFamily:T.font,marginLeft:4}}>
                ⚡ OPTIMIZE
              </button>
            </div>
          </div>
          {optResult && (
            <div style={{marginTop:12,background:T.surface,borderRadius:4,padding:10,border:`1px solid ${T.purple}33`}}>
              <div style={{color:T.purple,fontSize:'0.65rem',fontFamily:T.font,marginBottom:6}}>OPTIMAL WEIGHTS ({optResult.method})</div>
              {Object.entries(optResult.weights).map(([k,w]:any)=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{color:getColor(k),fontFamily:T.font,fontWeight:700,fontSize:'0.72rem'}}>{k}</span>
                  <span style={{color:T.text,fontFamily:T.font,fontSize:'0.72rem'}}>{(w*100).toFixed(1)}%</span>
                </div>
              ))}
              <div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${T.border}`}}>
                <span style={{color:T.textMute,fontSize:'0.65rem',fontFamily:T.font}}>Expected Sharpe: </span>
                <span style={{color:T.purple,fontFamily:T.font,fontWeight:700}}>{optResult.expected_sharpe}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Cost comparison */}
        <Card style={{padding:16}}>
          <div style={{color:T.yellow,fontSize:'0.68rem',fontFamily:T.font,fontWeight:700,marginBottom:10,letterSpacing:2}}>BROKER COST COMPARISON</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
            <div>
              <div style={{color:T.textDim,fontSize:'0.65rem',fontFamily:T.font,marginBottom:4}}>Duration</div>
              <div style={{display:'flex',gap:4}}>
                {[24,36,60,120].map(m=><Pill key={m} label={`${m/12}y`} active={months===m} color={T.yellow} onClick={()=>setMonths(m)}/>)}
              </div>
            </div>
            <div>
              <div style={{color:T.textDim,fontSize:'0.65rem',fontFamily:T.font,marginBottom:4}}>Gross CAGR assumption</div>
              <div style={{display:'flex',gap:4}}>
                {[5,8,10,15].map(g=><Pill key={g} label={`${g}%`} active={grossCagr===g} color={T.green} onClick={()=>setGross(g)}/>)}
              </div>
            </div>
          </div>
          {loading ? <Loader text="Computing net returns…"/> : ranking.length > 0 ? (
            <>
              <div style={{marginBottom:8,padding:'6px 0',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',fontSize:'0.65rem',fontFamily:T.font,color:T.textMute}}>
                <span>BROKER</span><span>NET RETURN</span><span>NET FINAL</span><span>COSTS</span><span>LSE</span>
              </div>
              {ranking.slice(0,7).map((r:any,i:number)=>(
                <div key={r.broker_key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${T.border}22`,fontSize:'0.72rem',fontFamily:T.font}}>
                  <span style={{color:i===0?T.green:i===ranking.length-1?T.red:T.textDim,fontWeight:700,width:90}}>
                    {i===0?'★ ':''}{r.broker_name?.replace('Interactive Brokers','IBKR')}
                  </span>
                  <span style={{color:i===0?T.green:i===ranking.length-1?T.red:T.text,fontWeight:700}}>
                    {r.net_return_pct?.toFixed(1)}%
                  </span>
                  <span style={{color:T.text}}>€{r.net_final?.toLocaleString()}</span>
                  <span style={{color:T.red}}>€{r.tx_costs?.toLocaleString()}</span>
                  <span style={{color:r.lse?T.green:T.red}}>{r.lse?'✓':'✗'}</span>
                </div>
              ))}
              <div style={{marginTop:8,padding:'8px',background:T.surface,borderRadius:3,fontSize:'0.68rem',fontFamily:T.fontSans,color:T.textDim,lineHeight:1.6}}>
                Tax: PFU 30% on capital gains · Irish ETFs: 15% WHT on dividends (creditable) · TTF: exempt · Gap best/worst: <span style={{color:T.yellow,fontWeight:700}}>€{costResult?.gap_eur?.toLocaleString()}</span>
              </div>
            </>
          ) : <div style={{color:T.textMute,fontSize:'0.75rem',padding:16,textAlign:'center'}}>Click ANALYZE to compare brokers</div>}
        </Card>
      </div>

      {/* Portfolio metrics */}
      {portResult && !loading && (
        <Card>
          <CardHeader title="Portfolio Analysis Results" sub={`${Object.keys(allocs).join(' + ')}`}/>
          <div style={{padding:14,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8}}>
            {[
              {label:'CAGR',      v:pm.cagr,           suf:'%', g:8,   b:0},
              {label:'Sharpe',    v:pm.sharpe,          suf:'',  g:1,   b:0},
              {label:'Max DD',    v:pm.max_drawdown,    suf:'%', g:null,b:-40},
              {label:'Sortino',   v:pm.sortino,         suf:'',  g:1.5, b:0},
              {label:'DCA Gain',  v:pdca.gain,          suf:'€', g:0,   b:null},
              {label:'Multiplier',v:pdca.multiplier,    suf:'×', g:null,b:null},
            ].map(kpi=>(
              <div key={kpi.label} style={{background:T.surface,borderRadius:4,padding:10}}>
                <div style={{color:T.textMute,fontSize:'0.65rem',fontFamily:T.font,marginBottom:3}}>{kpi.label}</div>
                <Val v={kpi.v||0} good={kpi.g||undefined} bad={kpi.b||undefined} suffix={kpi.suf}/>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 5 — VERDICT (AI)
// ═══════════════════════════════════════════════════════════════════════
function VerdictTab({ registry }: { registry: Record<string,any> }) {
  const allKeys  = Object.keys(registry)
  const [msgs,   setMsgs]  = useState<{role:'user'|'ai';text:string;tools?:any[];mode?:string}[]>([])
  const [input,  setInput] = useState('')
  const [loading,setLoad]  = useState(false)
  const [keys,   setKeys]  = useState(['ISWD','IUSF','ISDE','AMAL','HIWS'])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}) },[msgs])

  const QUICK = [
    "Which halal ETF should I buy right now and why?",
    "Compare Buy & Hold vs ADN strategy on ISWD over 5 years",
    "What's the cheapest French broker for €200/month DCA?",
    "Is ISWD's performance statistically significant?",
    "Build me an optimal halal portfolio for a beginner",
    "Analyze all 5 halal ETFs and give me a verdict",
  ]

  const send = async (text?: string) => {
    const msg = (text || input).trim(); if (!msg || loading) return
    setInput(''); setLoad(true)
    setMsgs(p=>[...p,{role:'user',text:msg}])
    try {
      const d = await api<any>('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:msg,keys})},0)
      setMsgs(p=>[...p,{role:'ai',text:d.response||'No response',tools:d.tool_calls,mode:d.mode}])
    } catch(e:any) {
      setMsgs(p=>[...p,{role:'ai',text:`Error: ${e.message}`}])
    }
    setLoad(false)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 200px)',minHeight:500}}>
      {/* Info banner */}
      <div style={{background:T.accentDim,border:`1px solid ${T.accent}33`,borderRadius:6,padding:'10px 16px',marginBottom:10,fontSize:'0.75rem',color:T.textDim,fontFamily:T.fontSans}}>
        <strong style={{color:T.accent}}>AI ANALYST</strong> — Powered by Claude. Automatically calls market data tools and computes metrics before answering.
        No API key needed — runs on the server. Set <code style={{color:T.yellow}}>ANTHROPIC_API_KEY</code> in Vercel env vars for full AI, otherwise uses smart rule-based analysis.
      </div>

      {/* Focus ETFs */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
        <span style={{color:T.textMute,fontSize:'0.68rem',fontFamily:T.font,alignSelf:'center'}}>Focus:</span>
        {allKeys.map(k=><Pill key={k} label={k} active={keys.includes(k)} color={getColor(k)} onClick={()=>setKeys(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k])}/>)}
      </div>

      {/* Quick prompts */}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
        {QUICK.map((q,i)=>(
          <button key={i} onClick={()=>send(q)} style={{padding:'3px 9px',borderRadius:2,border:`1px solid ${T.border}`,background:'transparent',color:T.textDim,cursor:'pointer',fontSize:'0.68rem',fontFamily:T.font}}
            onMouseEnter={e=>(e.currentTarget.style.borderColor=T.accent,e.currentTarget.style.color=T.accent)}
            onMouseLeave={e=>(e.currentTarget.style.borderColor=T.border,e.currentTarget.style.color=T.textDim)}>
            {q.length>45?q.slice(0,43)+'…':q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',background:T.bg,borderRadius:6,border:`1px solid ${T.border}`,padding:14,marginBottom:10}}>
        {msgs.length===0 && (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,color:T.textMute}}>
            <div style={{fontSize:'2.5rem'}}>◉</div>
            <div style={{fontFamily:T.fontSans,fontSize:'0.82rem',textAlign:'center',maxWidth:360,lineHeight:1.6}}>
              Ask anything about halal ETF investing. The AI analyst will use live market data to answer.
            </div>
          </div>
        )}
        {msgs.map((msg,i)=>(
          <div key={i} style={{marginBottom:14}}>
            {/* Tool calls badge */}
            {msg.tools && msg.tools.length>0 && (
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:6}}>
                {msg.tools.map((t:any,j:number)=>(
                  <span key={j} style={{background:T.surface,border:`1px solid ${T.blue}44`,borderRadius:2,padding:'2px 7px',color:T.blue,fontSize:'0.63rem',fontFamily:T.font}}>
                    ⚙ {t.tool}
                  </span>
                ))}
                {msg.mode==='rule_based' && <span style={{color:T.yellow,fontSize:'0.63rem',fontFamily:T.font}}>⚡ Rule-based (set ANTHROPIC_API_KEY for full AI)</span>}
              </div>
            )}
            <div style={{
              background:msg.role==='user'?'#0A1A2A':T.card,
              border:`1px solid ${msg.role==='user'?T.blue+'44':T.border}`,
              borderRadius:4,padding:'10px 14px',
              color:msg.role==='user'?T.blue:T.text,
              fontSize:'0.8rem',fontFamily:T.fontSans,lineHeight:1.7,
              maxWidth:msg.role==='user'?'70%':'100%',
              marginLeft:msg.role==='user'?'auto':'0',
              whiteSpace:'pre-wrap',
            }}>
              {msg.role==='ai' && <div style={{color:T.accent,fontFamily:T.font,fontSize:'0.65rem',marginBottom:6,letterSpacing:1}}>◉ AI ANALYST</div>}
              {msg.text.split('\n').map((line,li)=>{
                if(line.startsWith('## '))   return <div key={li} style={{color:T.accent,fontWeight:700,fontSize:'0.88rem',margin:'8px 0 3px'}}>{line.slice(3)}</div>
                if(line.startsWith('### '))  return <div key={li} style={{color:T.blue,fontWeight:700,fontSize:'0.82rem',margin:'6px 0 2px'}}>{line.slice(4)}</div>
                if(line.startsWith('**')&&line.endsWith('**')) return <div key={li} style={{color:T.text,fontWeight:700}}>{line.slice(2,-2)}</div>
                if(line.startsWith('- '))   return <div key={li} style={{paddingLeft:12,color:T.textDim}}>• {line.slice(2)}</div>
                if(line.startsWith('| '))   return <div key={li} style={{fontFamily:T.font,fontSize:'0.72rem',color:T.textDim}}>{line}</div>
                return <div key={li}>{line}</div>
              })}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:4,padding:'10px 14px'}}>
            <Loader text="AI analyst is thinking and calling tools…"/>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* Input */}
      <div style={{display:'flex',gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
          placeholder="Ask about halal ETFs, strategies, costs, recommendations… (Enter to send)"
          disabled={loading}
          style={{flex:1,background:T.card,border:`1px solid ${loading?T.border:T.borderHi}`,borderRadius:4,padding:'10px 14px',color:T.text,fontSize:'0.82rem',fontFamily:T.fontSans,outline:'none'}}/>
        <button onClick={()=>send()} disabled={loading||!input.trim()} style={{background:loading?T.textMute:T.accent,border:'none',borderRadius:4,padding:'10px 18px',color:'#000',fontWeight:800,cursor:loading?'not-allowed':'pointer',fontSize:'0.82rem',fontFamily:T.font}}>
          {loading?'…':'▶'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 6 — SETTINGS (Add ticker in 1 field)
// ═══════════════════════════════════════════════════════════════════════
function SettingsTab({ registry, onRefresh }: { registry: Record<string,any>; onRefresh: ()=>void }) {
  const [symbol, setSymbol] = useState('')
  const [msg,    setMsg]    = useState<{text:string;ok:boolean}|null>(null)
  const [loading,setLoad]   = useState(false)

  const add = async () => {
    if (!symbol.trim()) return
    setLoad(true); setMsg(null)
    try {
      const d = await api<any>('/api/lookup',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({symbol:symbol.trim()})},0)
      setMsg({text:`✓ Added "${d.key}" — ${d.info.name} (${d.status})`,ok:true})
      setSymbol(''); onRefresh()
    } catch(e:any) { setMsg({text:`✗ ${e.message}`,ok:false}) }
    setLoad(false)
  }

  const remove = async (key:string) => {
    if (!confirm(`Remove ${key}?`)) return
    try { await api(`/api/registry/${key}`,{method:'DELETE'},0); onRefresh() }
    catch(e:any) { alert(e.message) }
  }

  return (
    <div>
      {/* Add ticker */}
      <Card style={{padding:20,marginBottom:16}}>
        <div style={{color:T.accent,fontSize:'0.68rem',fontFamily:T.font,fontWeight:700,marginBottom:10,letterSpacing:2}}>ADD A TICKER</div>
        <div style={{color:T.textDim,fontSize:'0.75rem',fontFamily:T.fontSans,marginBottom:12,lineHeight:1.6}}>
          Type any ticker symbol (e.g. <code style={{color:T.yellow}}>AAPL</code>, <code style={{color:T.yellow}}>ISWD</code>, <code style={{color:T.yellow}}>BTC</code>, <code style={{color:T.yellow}}>VOO.L</code>).
          The system auto-detects everything else (name, exchange, currency, GBM parameters).
        </div>
        <div style={{display:'flex',gap:8}}>
          <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==='Enter'&&add()}
            placeholder="e.g. NVDA"
            style={{flex:1,background:T.surface,border:`1px solid ${T.borderHi}`,borderRadius:4,padding:'10px 14px',color:T.text,fontSize:'0.88rem',fontFamily:T.font,outline:'none',letterSpacing:2}}/>
          <button onClick={add} disabled={loading||!symbol.trim()} style={{background:symbol.trim()?T.accent:T.textMute,border:'none',borderRadius:4,padding:'10px 18px',color:'#000',fontWeight:800,cursor:'pointer',fontSize:'0.82rem',fontFamily:T.font}}>
            {loading?'…':'ADD'}
          </button>
        </div>
        {msg && <div style={{marginTop:8,color:msg.ok?T.green:T.red,fontSize:'0.75rem',fontFamily:T.font}}>{msg.text}</div>}
        <div style={{marginTop:10,color:T.textMute,fontSize:'0.68rem',fontFamily:T.font}}>
          Examples: AAPL (Apple) · MSFT · NVDA · BTC (Bitcoin) · GLD · VOO · ISWD (Islamic World) · IWDA (MSCI World benchmark)
        </div>
      </Card>

      {/* Registry table */}
      <Card>
        <CardHeader title={`Current Registry — ${Object.keys(registry).length} tickers`} sub="5 default halal ETFs cannot be removed"/>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.73rem',fontFamily:T.font}}>
            <thead>
              <tr style={{background:T.surface}}>
                {['Key','Name','Ticker (Yahoo)','Currency','TER','Halal','Category','Remove'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',color:T.textDim,fontWeight:600,textAlign:'left',borderBottom:`1px solid ${T.border}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(registry).map(([key,info]:any,i)=>(
                <tr key={key} style={{background:i%2?T.surface:'transparent'}}>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:getColor(key),fontWeight:800}}>{key}</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:T.textDim,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{info.name}</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:T.textMute}}>{info.ticker}</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:T.textMute}}>{info.currency}</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:T.yellow}}>{info.ter}%</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:info.halal?T.green:T.textMute}}>{info.halal?'✓ HALAL':'—'}</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,color:T.textMute,textTransform:'uppercase',fontSize:'0.65rem'}}>{info.category}</td>
                  <td style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`}}>
                    {!['ISWD','IUSF','ISDE','AMAL','HIWS'].includes(key) && (
                      <button onClick={()=>remove(key)} style={{background:'transparent',border:`1px solid ${T.red}44`,color:T.red,borderRadius:3,padding:'2px 8px',cursor:'pointer',fontSize:'0.65rem',fontFamily:T.font}}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════
const TABS = [
  { id:'discover', label:'📡 DISCOVER',   sub:'What are halal ETFs?' },
  { id:'analyze',  label:'🔬 ANALYZE',    sub:'Deep metrics & signals' },
  { id:'simulate', label:'📈 SIMULATE',   sub:'DCA & strategy backtest' },
  { id:'build',    label:'🏗 BUILD',      sub:'Optimize your portfolio' },
  { id:'verdict',  label:'◉ AI VERDICT', sub:'Get a personalized answer' },
  { id:'settings', label:'⚙ SETTINGS',   sub:'Add tickers, configure' },
]

export default function App() {
  const [tab, setTab] = useState('discover')
  const { data: regData, loading: regLoading, error: regError } = useRegistry()
  const [registry, setRegistry] = useState<Record<string,any>>({})

  useEffect(() => { if (regData?.registry) setRegistry(regData.registry) }, [regData])

  const refreshRegistry = useCallback(async () => {
    try { const d = await api<any>('/api/registry',undefined,0); setRegistry(d.registry||{}) } catch{}
  },[])

  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text, fontFamily:T.fontSans }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width: 4px; height: 4px }
        ::-webkit-scrollbar-track { background: ${T.bg} }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px }
        input:focus { outline: 1px solid ${T.accent} !important }
      `}</style>

      {/* Header */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'0 20px' }}>
        <div style={{ maxWidth:1400, margin:'0 auto', display:'flex', alignItems:'stretch', height:48 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, paddingRight:24, borderRight:`1px solid ${T.border}` }}>
            <span style={{ color:T.accent, fontFamily:T.font, fontWeight:800, fontSize:'0.88rem', letterSpacing:2 }}>☪ HALAL ETF</span>
            <span style={{ color:T.textMute, fontFamily:T.font, fontSize:'0.65rem' }}>ANALYTICS v4</span>
          </div>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'0 16px', border:'none', background:'none', cursor:'pointer',
              borderBottom:`2px solid ${tab===t.id?T.accent:'transparent'}`,
              color: tab===t.id ? T.accent : T.textDim,
              fontSize:'0.72rem', fontFamily:T.font, fontWeight:tab===t.id?700:400,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1,
              transition:'all 0.1s',
            }}>
              <span>{t.label}</span>
              <span style={{ fontSize:'0.58rem', color:T.textMute }}>{t.sub}</span>
            </button>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
            {regLoading ? <span style={{color:T.textMute,fontSize:'0.68rem',fontFamily:T.font}}>…</span>
              : <><span style={{color:T.accent,fontSize:'0.65rem',fontFamily:T.font}}>● LIVE</span>
                  <span style={{color:T.textMute,fontSize:'0.65rem',fontFamily:T.font}}>{Object.keys(registry).length} TICKERS</span></>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'16px' }}>
        {regLoading ? <Loader text="Connecting to Python backend…"/> :
         regError   ? <Err msg={`Backend error: ${regError}. Check Vercel logs.`}/> :
         Object.keys(registry).length === 0 ? <Loader text="Loading registry…"/> : (
          <>
            {tab==='discover'  && <DiscoverTab  registry={registry}/>}
            {tab==='analyze'   && <AnalyzeTab   registry={registry}/>}
            {tab==='simulate'  && <SimulateTab  registry={registry}/>}
            {tab==='build'     && <BuildTab     registry={registry}/>}
            {tab==='verdict'   && <VerdictTab   registry={registry}/>}
            {tab==='settings'  && <SettingsTab  registry={registry} onRefresh={refreshRegistry}/>}
          </>
        )}
        <div style={{marginTop:20,color:T.textMute,fontSize:'0.65rem',fontFamily:T.font,textAlign:'center'}}>
          ⚠ EDUCATIONAL ONLY · NOT INVESTMENT ADVICE (AMF) · PAST PERFORMANCE ≠ FUTURE RESULTS
        </div>
      </div>
    </div>
  )
}
