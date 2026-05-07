import React, { useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend } from 'recharts'

const API = '/api'
const Loader = () => (
  <div style={{ display:'flex', gap:10, padding:24, color:'#475569', alignItems:'center' }}>
    <div style={{ width:14, height:14, border:'2px solid #3B82F6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
    Running full verdict analysis…
  </div>
)

const SCORE_COLOR = (s:number) => s>=70?'#10B981':s>=50?'#F59E0B':'#EF4444'
const INVEST_COLOR = (v:string) => v==='YES'?'#10B981':v==='WAIT'?'#F59E0B':'#EF4444'

export function VerdictPanel({ registry }: { registry: Record<string,any> }) {
  const allKeys = Object.keys(registry)
  const [keys, setKeys]     = useState(['ISWD','IUSF','ISDE','AMAL','HIWS'])
  const [period, setPeriod] = useState('5y')
  const [loading, setLoading] = useState(false)
  const [data, setData]     = useState<any>(null)

  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/verdict?keys=${keys.join(',')}&period=${period}`)
      setData(await r.json())
    } catch(e){ console.error(e) }
    setLoading(false)
  }

  const verdicts   = data?.verdicts || {}
  const optAlloc   = data?.optimal_allocation || {}
  const taxFw      = data?.tax_framework || {}

  // Radar data
  const radarData = Object.keys(verdicts).length > 0 ? [
    { subject:'Sharpe',    ...Object.fromEntries(Object.entries(verdicts).map(([k,v]:any)=>[k, Math.max(0,Math.min(100,(v.metrics.sharpe+1)*40))]))},
    { subject:'CAGR',      ...Object.fromEntries(Object.entries(verdicts).map(([k,v]:any)=>[k, Math.max(0,Math.min(100,v.metrics.cagr*3))]))},
    { subject:'Low DD',    ...Object.fromEntries(Object.entries(verdicts).map(([k,v]:any)=>[k, Math.max(0,100+v.metrics.max_drawdown*1.5)]))},
    { subject:'Sig.',      ...Object.fromEntries(Object.entries(verdicts).map(([k,v]:any)=>[k, v.significance?.overall_significance==='strong'?90:v.significance?.overall_significance==='moderate'?55:20]))},
    { subject:'Quality',   ...Object.fromEntries(Object.entries(verdicts).map(([k,v]:any)=>[k, v.signals?.buffett_quality||0]))},
    { subject:'Score',     ...Object.fromEntries(Object.entries(verdicts).map(([k,v]:any)=>[k, v.score||0]))},
  ] : []

  const COLORS = ['#3B82F6','#8B5CF6','#F59E0B','#EF4444','#10B981']

  return (
    <div>
      {/* Controls */}
      <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18, marginBottom:16 }}>
        <h3 style={{ color:'#F1F5F9', fontSize:'0.9rem', fontWeight:700, marginBottom:12 }}>🏆 Comprehensive Verdict — Stats + Strategy + Portfolio + Costs</h3>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <p style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>ETFs to evaluate</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {allKeys.map(k=>(
                <button key={k} onClick={()=>setKeys(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k])} style={{ padding:'4px 9px', borderRadius:16, border:`1.5px solid ${keys.includes(k)?'#3B82F6':'#334155'}`, background:keys.includes(k)?'#3B82F622':'transparent', color:keys.includes(k)?'#3B82F6':'#64748B', cursor:'pointer', fontSize:'0.75rem', fontWeight:keys.includes(k)?700:400 }}>{k}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>Period</p>
            <div style={{ display:'flex', gap:6 }}>
              {['2y','3y','5y'].map(p=>(
                <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${period===p?'#8B5CF6':'#334155'}`, background:period===p?'#8B5CF622':'transparent', color:period===p?'#8B5CF6':'#64748B', cursor:'pointer', fontSize:'0.75rem' }}>{p}</button>
              ))}
            </div>
          </div>
          <button onClick={run} disabled={loading||keys.length<1} style={{ background:'#10B981', border:'none', borderRadius:8, padding:'9px 20px', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
            {loading?'⏳ Analyzing…':'🏆 Generate Verdict'}
          </button>
        </div>
      </div>

      {loading && <Loader/>}

      {Object.keys(verdicts).length>0 && !loading && (
        <>
          {/* Verdict cards */}
          <div style={{ display:'grid', gap:12, marginBottom:20 }}>
            {Object.entries(verdicts)
              .sort((a:any,b:any)=>b[1].score-a[1].score)
              .map(([k,v]:any, idx)=>{
                const col = COLORS[idx % COLORS.length]
                const sig = v.significance
                return (
                  <div key={k} style={{ background:'#0F172A', border:`1.5px solid ${INVEST_COLOR(v.invest)}44`, borderRadius:12, padding:18 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:12 }}>
                      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                        <div style={{ width:40, height:40, borderRadius:10, background:col+'22', border:`2px solid ${col}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:col, fontSize:'1rem' }}>{idx+1}</div>
                        <div>
                          <div style={{ fontWeight:800, color:col, fontSize:'1.05rem' }}>{k}</div>
                          <div style={{ color:'#475569', fontSize:'0.72rem' }}>{registry[k]?.name}</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                        <span style={{ background:INVEST_COLOR(v.invest)+'22', border:`1px solid ${INVEST_COLOR(v.invest)}`, color:INVEST_COLOR(v.invest), padding:'4px 12px', borderRadius:16, fontSize:'0.78rem', fontWeight:700 }}>
                          {v.invest==='YES'?'✅ INVEST':v.invest==='WAIT'?'⚠️ WAIT':'❌ AVOID'}
                        </span>
                        <span style={{ background:'#0A111C', border:`1px solid ${SCORE_COLOR(v.score)}44`, color:SCORE_COLOR(v.score), padding:'4px 10px', borderRadius:8, fontFamily:'monospace', fontWeight:800, fontSize:'0.85rem' }}>
                          {v.score}/100
                        </span>
                        {v.halal && <span style={{ background:'#0A2A14', color:'#10B981', border:'1px solid #166534', padding:'2px 8px', borderRadius:4, fontSize:'0.68rem', fontWeight:700 }}>✓ Halal</span>}
                        <span style={{ background:'#0A111C', color:sig?.overall_significance==='strong'?'#10B981':sig?.overall_significance==='moderate'?'#F59E0B':'#EF4444', border:'1px solid #1E293B', padding:'2px 8px', borderRadius:4, fontSize:'0.68rem' }}>
                          Sig: {sig?.overall_significance?.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
                      {/* Metrics */}
                      <div>
                        <div style={{ color:'#475569', fontSize:'0.65rem', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>Key Metrics</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                          {[
                            ['CAGR', `${v.metrics.cagr>0?'+':''}${v.metrics.cagr}%`, v.metrics.cagr>8?'#10B981':v.metrics.cagr>0?'#F59E0B':'#EF4444'],
                            ['Sharpe', `${v.metrics.sharpe}`, v.metrics.sharpe>1?'#10B981':v.metrics.sharpe>0?'#F59E0B':'#EF4444'],
                            ['Max DD', `${v.metrics.max_drawdown}%`, v.metrics.max_drawdown>-25?'#10B981':v.metrics.max_drawdown>-40?'#F59E0B':'#EF4444'],
                            ['Sortino', `${v.metrics.sortino}`, v.metrics.sortino>1.5?'#10B981':'#F59E0B'],
                            ['Log R²', `${v.metrics.log_r_squared}`, v.metrics.log_r_squared>0.85?'#10B981':'#94A3B8'],
                            ['Omega', `${v.metrics.omega}`, v.metrics.omega>1.5?'#10B981':'#94A3B8'],
                          ].map(([label,val,color])=>(
                            <div key={label as string} style={{ background:'#0A111C', borderRadius:6, padding:'6px 8px' }}>
                              <div style={{ color:'#475569', fontSize:'0.65rem' }}>{label as string}</div>
                              <div style={{ color:color as string, fontWeight:700, fontFamily:'monospace', fontSize:'0.82rem' }}>{val as string}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strategy + Net returns */}
                      <div>
                        <div style={{ color:'#475569', fontSize:'0.65rem', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>Recommended Strategy</div>
                        <div style={{ background:'#0A111C', borderRadius:8, padding:10, marginBottom:8, border:`1px solid ${col}33` }}>
                          <div style={{ color:col, fontWeight:700, fontSize:'0.82rem', marginBottom:4 }}>{v.best_strategy}</div>
                          <div style={{ color:'#64748B', fontSize:'0.72rem', lineHeight:1.5 }}>{v.strategy_note}</div>
                        </div>
                        <div style={{ color:'#475569', fontSize:'0.65rem', fontWeight:600, marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Net Return (200€/mo, 5y)</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                          <div style={{ background:'#0A2A14', border:'1px solid #166534', borderRadius:6, padding:'6px 8px' }}>
                            <div style={{ color:'#475569', fontSize:'0.62rem' }}>IBKR (best)</div>
                            <div style={{ color:'#10B981', fontWeight:700, fontFamily:'monospace' }}>{v.net_return_ibkr_5y?.toFixed(1)}%</div>
                          </div>
                          <div style={{ background:'#1A0808', border:'1px solid #7F1D1D', borderRadius:6, padding:'6px 8px' }}>
                            <div style={{ color:'#475569', fontSize:'0.62rem' }}>La Poste (worst)</div>
                            <div style={{ color:'#EF4444', fontWeight:700, fontFamily:'monospace' }}>{v.net_return_laposte_5y?.toFixed(1)}%</div>
                          </div>
                          <div style={{ background:'#0A111C', border:'1px solid #1E293B', borderRadius:6, padding:'6px 8px', gridColumn:'1/-1' }}>
                            <div style={{ color:'#475569', fontSize:'0.62rem' }}>Broker advantage (pp)</div>
                            <div style={{ color:'#F59E0B', fontWeight:700, fontFamily:'monospace' }}>+{v.broker_advantage_pp} pp choosing IBKR</div>
                          </div>
                        </div>
                      </div>

                      {/* Signals summary */}
                      <div>
                        <div style={{ color:'#475569', fontSize:'0.65rem', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>AI Signals</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                          {['rsi_signal','ema_signal','macd_signal','momentum_signal','z_signal'].map(sk=>{
                            const sv = v.signals?.[sk]
                            return sv ? (
                              <span key={sk} style={{ background:sv==='bullish'?'#0A2A14':sv==='bearish'?'#1A0808':'#1A1305', color:sv==='bullish'?'#10B981':sv==='bearish'?'#EF4444':'#F59E0B', border:`1px solid ${sv==='bullish'?'#166534':sv==='bearish'?'#7F1D1D':'#78350F'}`, padding:'2px 7px', borderRadius:4, fontSize:'0.65rem', fontWeight:700 }}>
                                {sk.replace('_signal','').replace('_',' ').toUpperCase()}: {sv.toUpperCase()}
                              </span>
                            ) : null
                          })}
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                          <div style={{ background:'#0A111C', borderRadius:6, padding:'6px 8px' }}>
                            <div style={{ color:'#475569', fontSize:'0.62rem' }}>Renaissance Score</div>
                            <div style={{ color:'#8B5CF6', fontWeight:800, fontFamily:'monospace' }}>{v.signals?.renaissance_score}/100</div>
                          </div>
                          <div style={{ background:'#0A111C', borderRadius:6, padding:'6px 8px' }}>
                            <div style={{ color:'#475569', fontSize:'0.62rem' }}>Buffett Quality</div>
                            <div style={{ color:'#3B82F6', fontWeight:800, fontFamily:'monospace' }}>{v.signals?.buffett_quality}/100</div>
                          </div>
                        </div>
                        <div style={{ marginTop:6, background:'#0A111C', borderRadius:6, padding:'6px 8px' }}>
                          <div style={{ color:'#475569', fontSize:'0.62rem' }}>Stat significance (Sharpe p-val)</div>
                          <div style={{ color:sig?.sharpe_significant_95?'#10B981':'#F59E0B', fontFamily:'monospace', fontWeight:700, fontSize:'0.78rem' }}>
                            p={sig?.sharpe_p_value?.toFixed(4)} {sig?.sharpe_significant_95?'✅ sig.':'⚠️ marginal'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
            })}
          </div>

          {/* Optimal portfolio */}
          {Object.keys(optAlloc).length > 0 && (
            <div style={{ background:'#0A1F0E', border:'1px solid #166534', borderRadius:12, padding:20, marginBottom:16 }}>
              <h3 style={{ color:'#86EFAC', fontWeight:700, marginBottom:14 }}>📐 Statistically Optimal Allocation (Max Sharpe)</h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:14 }}>
                {Object.entries(optAlloc).map(([k,w]:any)=>(
                  <div key={k} style={{ background:'#0F2A14', border:'1px solid #166534', borderRadius:8, padding:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontWeight:700, color:'#86EFAC' }}>{k}</span>
                      <span style={{ fontWeight:800, fontFamily:'monospace', color:'#10B981', fontSize:'1.1rem' }}>{(w*100).toFixed(1)}%</span>
                    </div>
                    <div style={{ background:'#1E3A1E', height:5, borderRadius:3 }}>
                      <div style={{ width:`${w*100}%`, height:'100%', background:'#10B981', borderRadius:3 }}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))', gap:12 }}>
                <div style={{ background:'#0F172A', borderRadius:8, padding:12, border:'1px solid #1E293B' }}>
                  <div style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>Recommended Broker</div>
                  <div style={{ color:'#10B981', fontWeight:700 }}>{data.recommended_broker}</div>
                  <div style={{ color:'#475569', fontSize:'0.7rem' }}>{data.recommended_account}</div>
                </div>
                <div style={{ background:'#0F172A', borderRadius:8, padding:12, border:'1px solid #1E293B' }}>
                  <div style={{ color:'#64748B', fontSize:'0.72rem', marginBottom:6 }}>Tax Framework</div>
                  <div style={{ color:'#F59E0B', fontSize:'0.75rem', lineHeight:1.5 }}>{taxFw.notes?.slice(0,120)}…</div>
                </div>
              </div>
            </div>
          )}

          {/* Radar chart */}
          {radarData.length > 0 && (
            <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18 }}>
              <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:12 }}>Multi-dimensional Comparison Radar</h3>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1E293B"/>
                  <PolarAngleAxis dataKey="subject" tick={{ fill:'#64748B', fontSize:11 }}/>
                  {Object.keys(verdicts).map((k,i)=>(
                    <Radar key={k} name={k} dataKey={k} stroke={COLORS[i%COLORS.length]} fill={COLORS[i%COLORS.length]} fillOpacity={0.1} strokeWidth={2}/>
                  ))}
                  <Legend/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
