import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line } from 'recharts'

const API = '/api'
const Loader = () => (
  <div style={{ display:'flex', gap:10, padding:24, color:'#475569', alignItems:'center' }}>
    <div style={{ width:14, height:14, border:'2px solid #3B82F6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
    Running significance tests (bootstrap n=1000)…
  </div>
)
const TT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <p style={{ color:'#64748B', marginBottom:6 }}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{ color:p.color, display:'flex', gap:8, marginBottom:2 }}>
          <span style={{ color:'#94A3B8' }}>{p.name}:</span>
          <span style={{ fontWeight:600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const PBadge = ({ p, label }: { p:number; label:string }) => {
  const sig = p < 0.01 ? { color:'#10B981', bg:'#0A2A14', border:'#166534', text:'p<0.01 ★★★' }
            : p < 0.05 ? { color:'#86EFAC', bg:'#0A1F0E', border:'#166534', text:'p<0.05 ★★' }
            : p < 0.10 ? { color:'#F59E0B', bg:'#1A1305', border:'#78350F', text:'p<0.10 ★' }
            : { color:'#EF4444', bg:'#1A0808', border:'#7F1D1D', text:'NS (p='+p.toFixed(3)+')' }
  return (
    <div style={{ background:sig.bg, border:`1px solid ${sig.border}`, borderRadius:8, padding:'8px 12px', marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ color:'#94A3B8', fontSize:'0.75rem' }}>{label}</span>
        <span style={{ color:sig.color, fontFamily:'monospace', fontWeight:700, fontSize:'0.75rem' }}>{sig.text}</span>
      </div>
      <div style={{ background:'#1E293B', height:4, borderRadius:2, marginTop:6 }}>
        <div style={{ width:`${Math.max(2,(1-p)*100)}%`, height:'100%', background:sig.color, borderRadius:2 }}/>
      </div>
    </div>
  )
}

export function SignificancePanel({ registry }: { registry: Record<string,any> }) {
  const allKeys = Object.keys(registry)
  const [key, setKey]       = useState('ISWD')
  const [period, setPeriod] = useState('5y')
  const [nBoot, setNBoot]   = useState(500)
  const [loading, setLoading] = useState(false)
  const [data, setData]     = useState<any>(null)

  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/significance/${key}?period=${period}&benchmark=IWDA&n_boot=${nBoot}`)
      setData(await r.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const sig = data?.significance || {}

  // Bootstrap distribution chart
  const bootChartData = sig.sharpe_ci95_low != null ? [
    { name:'CI 99% Low',  value: sig.sharpe_ci95_low - 0.3 },
    { name:'CI 95% Low',  value: sig.sharpe_ci95_low  },
    { name:'Sharpe',      value: sig.sharpe            },
    { name:'CI 95% High', value: sig.sharpe_ci95_high  },
    { name:'CI 99% High', value: sig.sharpe_ci95_high + 0.3 },
  ] : []

  return (
    <div>
      {/* Controls */}
      <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:20, marginBottom:16 }}>
        <h3 style={{ color:'#F1F5F9', fontSize:'0.9rem', fontWeight:700, marginBottom:14 }}>🔬 Statistical Significance Engine</h3>
        <p style={{ color:'#475569', fontSize:'0.75rem', marginBottom:12, lineHeight:1.5 }}>
          Jobson-Korkie Sharpe t-test · CAGR log-return t-test · Bootstrap 95/99% CI · Jensen's alpha t-test · Max DD Monte Carlo · Ljung-Box autocorrelation · Jarque-Bera normality
        </p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <p style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>ETF</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {allKeys.map(k=>(
                <button key={k} onClick={()=>setKey(k)} style={{ padding:'4px 9px', borderRadius:16, border:`1.5px solid ${key===k?'#3B82F6':'#334155'}`, background:key===k?'#3B82F622':'transparent', color:key===k?'#3B82F6':'#64748B', cursor:'pointer', fontSize:'0.75rem', fontWeight:key===k?700:400 }}>{k}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>Period</p>
            <div style={{ display:'flex', gap:6 }}>
              {['1y','2y','3y','5y'].map(p=>(
                <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${period===p?'#8B5CF6':'#334155'}`, background:period===p?'#8B5CF622':'transparent', color:period===p?'#8B5CF6':'#64748B', cursor:'pointer', fontSize:'0.75rem' }}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>Bootstrap N</p>
            <div style={{ display:'flex', gap:6 }}>
              {[200,500,1000].map(n=>(
                <button key={n} onClick={()=>setNBoot(n)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${nBoot===n?'#F59E0B':'#334155'}`, background:nBoot===n?'#F59E0B22':'transparent', color:nBoot===n?'#F59E0B':'#64748B', cursor:'pointer', fontSize:'0.75rem' }}>{n}</button>
              ))}
            </div>
          </div>
          <button onClick={run} disabled={loading} style={{ background:'#3B82F6', border:'none', borderRadius:8, padding:'9px 18px', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'0.82rem' }}>
            {loading?'⏳ Running…':'▶ Run Tests'}
          </button>
        </div>
      </div>

      {loading && <Loader/>}

      {sig.n_observations && !loading && (
        <>
          {/* Data quality banner */}
          <div style={{ background: sig.data_quality==='high'?'#0A1F0E':sig.data_quality==='medium'?'#1A1305':'#1A0808',
                        border:`1px solid ${sig.data_quality==='high'?'#166534':sig.data_quality==='medium'?'#78350F':'#7F1D1D'}`,
                        borderRadius:8, padding:'10px 16px', marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'#94A3B8', fontSize:'0.78rem' }}>
              <strong style={{ color:'#F1F5F9' }}>Data Quality: </strong>
              <span style={{ color:sig.data_quality==='high'?'#10B981':sig.data_quality==='medium'?'#F59E0B':'#EF4444', fontWeight:700 }}>{sig.data_quality?.toUpperCase()}</span>
              {' '}— {sig.n_observations} observations over {period} | Min reliable: {sig.min_reliable_obs} obs
            </span>
            <span style={{ fontFamily:'monospace', fontSize:'0.78rem', color:'#64748B' }}>Benchmark: MSCI World (IWDA)</span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            {/* Significance Tests */}
            <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18 }}>
              <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:14 }}>Statistical Test Results</h3>

              <PBadge p={sig.sharpe_p_value} label={`Sharpe Ratio (${sig.sharpe?.toFixed(3)}) — Jobson-Korkie`} />
              <PBadge p={sig.cagr_p_value}   label={`CAGR (${sig.cagr_pct?.toFixed(2)}%) — log-return t-test`} />
              {sig.alpha?.p_value != null && (
                <PBadge p={sig.alpha.p_value} label={`Jensen's Alpha (${sig.alpha.alpha_annualized_pct?.toFixed(2)}%/yr) vs IWDA`} />
              )}
              <PBadge p={sig.ljung_box_pval}    label={`Ljung-Box autocorrelation (lag 10)`} />
              <PBadge p={1-sig.jarque_bera_pval} label={`Jarque-Bera normality rejection`} />

              <div style={{ marginTop:14, background:'#0A111C', borderRadius:8, padding:12, border:'1px solid #1E293B' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#64748B', fontSize:'0.75rem' }}>Overall significance</span>
                  <span style={{ color:sig.overall_significance==='strong'?'#10B981':sig.overall_significance==='moderate'?'#F59E0B':'#EF4444', fontWeight:700, fontSize:'0.82rem' }}>
                    {sig.overall_significance?.toUpperCase()}
                  </span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ color:'#64748B', fontSize:'0.75rem' }}>Returns predictable (autocorr)</span>
                  <span style={{ color:sig.return_predictable?'#10B981':'#475569', fontSize:'0.78rem' }}>{sig.return_predictable?'Yes — momentum signal valid':'No — random walk'}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#64748B', fontSize:'0.75rem' }}>Returns normally distributed</span>
                  <span style={{ color:sig.returns_normal?'#10B981':'#F59E0B', fontSize:'0.78rem' }}>{sig.returns_normal?'Yes':'No — fat tails present'}</span>
                </div>
              </div>
            </div>

            {/* Confidence Intervals */}
            <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18 }}>
              <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:14 }}>Bootstrap Confidence Intervals (n={nBoot})</h3>

              {[
                { label:'Sharpe Ratio', val:sig.sharpe, lo:sig.sharpe_ci95_low, hi:sig.sharpe_ci95_high, color:'#3B82F6', fmt:(v:number)=>v?.toFixed(3) },
                { label:'CAGR', val:sig.cagr_pct, lo:sig.cagr_ci95_low, hi:sig.cagr_ci95_high, color:'#10B981', fmt:(v:number)=>v?.toFixed(1)+'%' },
                { label:'Max Drawdown', val:sig.max_dd_pct, lo:sig.max_dd_ci95_low, hi:sig.max_dd_ci95_high, color:'#EF4444', fmt:(v:number)=>v?.toFixed(1)+'%' },
              ].map(ci=>{
                const range = (ci.hi - ci.lo) || 1
                const pos   = ((ci.val - ci.lo) / range) * 100
                return (
                  <div key={ci.label} style={{ marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ color:'#94A3B8', fontSize:'0.78rem' }}>{ci.label}</span>
                      <span style={{ color:ci.color, fontFamily:'monospace', fontWeight:700 }}>{ci.fmt(ci.val)}</span>
                    </div>
                    <div style={{ position:'relative', height:12, background:'#1E293B', borderRadius:6 }}>
                      {/* CI range */}
                      <div style={{ position:'absolute', left:'5%', right:'5%', top:0, bottom:0, background:ci.color+'33', borderRadius:6 }}/>
                      {/* Estimate marker */}
                      <div style={{ position:'absolute', left:`${Math.max(2,Math.min(98,pos))}%`, top:-3, bottom:-3, width:3, background:ci.color, borderRadius:2 }}/>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                      <span style={{ color:'#475569', fontSize:'0.65rem' }}>{ci.fmt(ci.lo)} (5%)</span>
                      <span style={{ color:'#475569', fontSize:'0.65rem' }}>95% CI</span>
                      <span style={{ color:'#475569', fontSize:'0.65rem' }}>(95%) {ci.fmt(ci.hi)}</span>
                    </div>
                  </div>
                )
              })}

              {/* Alpha details */}
              {sig.alpha?.alpha_annualized_pct != null && (
                <div style={{ background:'#0A111C', borderRadius:8, padding:12, border:'1px solid #1E293B', marginTop:8 }}>
                  <div style={{ color:'#64748B', fontSize:'0.68rem', marginBottom:8 }}>JENSEN'S ALPHA vs MSCI World</div>
                  {[
                    ['Alpha (annualized)',`${sig.alpha.alpha_annualized_pct?.toFixed(3)}%`],
                    ['Beta',`${sig.alpha.beta?.toFixed(4)}`],
                    ['R²',`${sig.alpha.r_squared?.toFixed(4)}`],
                    ['t-statistic',`${sig.alpha.t_stat?.toFixed(3)}`],
                    ['p-value',`${sig.alpha.p_value?.toFixed(4)}`],
                    ['Significant 95%',sig.alpha.significant_95?'✅ Yes':'❌ No'],
                  ].map(([k,v])=>(
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ color:'#64748B', fontSize:'0.7rem' }}>{k}</span>
                      <span style={{ color:'#94A3B8', fontFamily:'monospace', fontSize:'0.75rem' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Max DD Monte Carlo */}
          <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18, marginBottom:16 }}>
            <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:6 }}>Max Drawdown Monte Carlo Percentile</h3>
            <p style={{ color:'#475569', fontSize:'0.72rem', marginBottom:12 }}>
              Where does the observed MDD sit relative to random GBM simulations with the same drift and volatility?
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
              {[
                { label:'Observed MDD', v:`${sig.max_dd_pct?.toFixed(2)}%`, c:'#EF4444' },
                { label:'95% CI Low',   v:`${sig.max_dd_ci95_low?.toFixed(2)}%`, c:'#F59E0B' },
                { label:'95% CI High',  v:`${sig.max_dd_ci95_high?.toFixed(2)}%`, c:'#F59E0B' },
                { label:'MC Percentile',v:`${sig.max_dd_mc_percentile?.toFixed(1)}th`, c: sig.max_dd_worse_than_random?'#EF4444':'#10B981' },
                { label:'Worse than random?', v:sig.max_dd_worse_than_random?'Yes ⚠️':'No ✅', c:sig.max_dd_worse_than_random?'#EF4444':'#10B981' },
              ].map(kpi=>(
                <div key={kpi.label} style={{ background:'#0A111C', border:'1px solid #1E293B', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ color:'#475569', fontSize:'0.68rem', marginBottom:3 }}>{kpi.label}</div>
                  <div style={{ color:kpi.c, fontWeight:800, fontFamily:'monospace', fontSize:'0.9rem' }}>{kpi.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Interpretation guide */}
          <div style={{ background:'#0A111C', border:'1px solid #1E293B', borderRadius:12, padding:16 }}>
            <h3 style={{ color:'#F1F5F9', fontSize:'0.82rem', fontWeight:700, marginBottom:10 }}>📖 How to Read These Results</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))', gap:10 }}>
              {[
                { icon:'★★★', color:'#10B981', title:'p < 0.01', text:'Highly significant. Less than 1% chance the result is due to luck. Safe to rely on.' },
                { icon:'★★',  color:'#86EFAC', title:'p < 0.05', text:'Statistically significant at 95% confidence. Standard academic threshold.' },
                { icon:'★',   color:'#F59E0B', title:'p < 0.10', text:'Marginally significant. Treat with caution — could be noise.' },
                { icon:'NS',  color:'#EF4444', title:'p ≥ 0.10', text:'Not significant. Cannot reject the null hypothesis. More data needed.' },
              ].map(item=>(
                <div key={item.title} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ color:item.color, fontWeight:800, fontSize:'0.85rem', minWidth:28 }}>{item.icon}</span>
                  <div>
                    <div style={{ color:item.color, fontWeight:700, fontSize:'0.78rem' }}>{item.title}</div>
                    <div style={{ color:'#64748B', fontSize:'0.72rem', lineHeight:1.5 }}>{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
