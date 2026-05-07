import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts'

const API = '/api'
const Loader = () => (
  <div style={{ display:'flex', gap:10, padding:24, color:'#475569', alignItems:'center' }}>
    <div style={{ width:14, height:14, border:'2px solid #3B82F6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
    Computing costs…
  </div>
)
const TT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <p style={{ color:'#64748B', marginBottom:6 }}>{label}</p>
      {payload.map((p:any,i:number) => (
        <div key={i} style={{ color:p.color, display:'flex', gap:8, marginBottom:2 }}>
          <span style={{ color:'#94A3B8' }}>{p.name}:</span>
          <span style={{ fontWeight:600 }}>{typeof p.value==='number'?p.value.toLocaleString('fr-FR'):p.value}</span>
        </div>
      ))}
    </div>
  )
}

const BROKER_COLORS: Record<string,string> = {
  interactive_brokers:'#10B981',boursorama:'#3B82F6',fortuneo:'#8B5CF6',
  swissquote:'#F59E0B',banque_populaire:'#EF4444',cic:'#EC4899',la_poste:'#64748B',
}

export function CostPanel({ registry }: { registry: Record<string,any> }) {
  const etfKeys = Object.keys(registry)
  const [etf, setEtf]           = useState('ISWD')
  const [monthly, setMonthly]   = useState(200)
  const [months, setMonths]     = useState(60)
  const [grossCagr, setGross]   = useState(10)
  const [loading, setLoading]   = useState(false)
  const [data, setData]         = useState<any>(null)
  const [brokerInfo, setBrokerInfo] = useState<any>(null)
  const [activeTab, setActiveTab]  = useState<'comparison'|'breakdown'|'tax'>('comparison')

  const loadBrokerInfo = async () => {
    try {
      const r = await fetch(`${API}/brokers`)
      setBrokerInfo(await r.json())
    } catch {}
  }

  React.useEffect(() => { loadBrokerInfo() }, [])

  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/costs/compare?etf=${etf}&monthly=${monthly}&months=${months}&gross_cagr=${grossCagr/100}`)
      setData(await r.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const ranking = data?.ranking || []
  const brokers = brokerInfo?.brokers || {}
  const tax     = brokerInfo?.tax_model || {}

  // Chart data
  const chartData = ranking.map((r:any) => ({
    name:       r.broker_name?.replace('Interactive Brokers','IBKR').replace('Boursorama Banque','Boursorama').replace('La Banque Postale','La Poste'),
    net_return: r.net_return_pct,
    net_final:  r.net_final,
    costs:      data?.results?.[r.key]?.tx_costs_total,
    tax_paid:   data?.results?.[r.key]?.cg_tax,
    color:      BROKER_COLORS[r.key?.replace('_perso','').replace('_pro','')] || '#94A3B8',
    lse:        r.lse_accessible,
  }))

  return (
    <div>
      {/* Config */}
      <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:20, marginBottom:16 }}>
        <h3 style={{ color:'#F1F5F9', fontSize:'0.9rem', fontWeight:700, marginBottom:14 }}>💶 Transaction Cost & Tax Model — French CTO</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:14 }}>
          <div>
            <label style={{ color:'#64748B', fontSize:'0.72rem', display:'block', marginBottom:5 }}>ETF</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {etfKeys.map(k=>(
                <button key={k} onClick={()=>setEtf(k)} style={{ padding:'4px 9px', borderRadius:16, border:`1.5px solid ${etf===k?'#3B82F6':'#334155'}`, background:etf===k?'#3B82F622':'transparent', color:etf===k?'#3B82F6':'#64748B', cursor:'pointer', fontSize:'0.75rem', fontWeight:etf===k?700:400 }}>{k}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ color:'#64748B', fontSize:'0.72rem', display:'block', marginBottom:5 }}>Monthly DCA</label>
            <div style={{ display:'flex', gap:6 }}>
              {[100,200,500,1000].map(a=>(
                <button key={a} onClick={()=>setMonthly(a)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${monthly===a?'#8B5CF6':'#334155'}`, background:monthly===a?'#8B5CF622':'transparent', color:monthly===a?'#8B5CF6':'#64748B', cursor:'pointer', fontSize:'0.75rem' }}>{a}€</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ color:'#64748B', fontSize:'0.72rem', display:'block', marginBottom:5 }}>Duration</label>
            <div style={{ display:'flex', gap:6 }}>
              {[24,36,60,120].map(m=>(
                <button key={m} onClick={()=>setMonths(m)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${months===m?'#F59E0B':'#334155'}`, background:months===m?'#F59E0B22':'transparent', color:months===m?'#F59E0B':'#64748B', cursor:'pointer', fontSize:'0.75rem' }}>{m/12}y</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ color:'#64748B', fontSize:'0.72rem', display:'block', marginBottom:5 }}>Gross CAGR assumption</label>
            <div style={{ display:'flex', gap:6 }}>
              {[5,8,10,15].map(g=>(
                <button key={g} onClick={()=>setGross(g)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${grossCagr===g?'#10B981':'#334155'}`, background:grossCagr===g?'#10B98122':'transparent', color:grossCagr===g?'#10B981':'#64748B', cursor:'pointer', fontSize:'0.75rem' }}>{g}%</button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={run} disabled={loading} style={{ background:'#3B82F6', border:'none', borderRadius:8, padding:'9px 20px', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
          {loading ? '⏳ Computing…' : '📊 Compare All Brokers'}
        </button>
      </div>

      {loading && <Loader/>}

      {data && !loading && (
        <>
          {/* Summary KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:16 }}>
            {[
              { label:'Best broker', v:data.best_broker?.replace('Interactive Brokers','IBKR'), c:'#10B981' },
              { label:'Worst broker', v:data.worst_broker?.replace('La Banque Postale','La Poste'), c:'#EF4444' },
              { label:'Net gain (best)', v:`${ranking[0]?.net_return_pct?.toFixed(1)}%`, c:'#10B981' },
              { label:'Net gain (worst)', v:`${ranking[ranking.length-1]?.net_return_pct?.toFixed(1)}%`, c:'#EF4444' },
              { label:'Cost spread', v:`${data.cost_spread_eur?.toLocaleString('fr-FR')}€`, c:'#F59E0B' },
              { label:'Tax rate (PFU)', v:'30%', c:'#8B5CF6' },
            ].map(kpi=>(
              <div key={kpi.label} style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ color:'#475569', fontSize:'0.68rem', marginBottom:3 }}>{kpi.label}</div>
                <div style={{ color:kpi.c, fontWeight:800, fontFamily:'monospace', fontSize:'0.95rem' }}>{kpi.v}</div>
              </div>
            ))}
          </div>

          {/* Sub-tabs */}
          <div style={{ display:'flex', gap:0, marginBottom:14, borderBottom:'1px solid #1E293B' }}>
            {(['comparison','breakdown','tax'] as const).map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)} style={{ padding:'8px 14px', border:'none', background:'none', cursor:'pointer', color:activeTab===t?'#3B82F6':'#64748B', borderBottom:activeTab===t?'2px solid #3B82F6':'2px solid transparent', fontSize:'0.78rem', fontWeight:activeTab===t?700:400, textTransform:'capitalize' }}>{t}</button>
            ))}
          </div>

          {/* COMPARISON TAB */}
          {activeTab==='comparison' && (
            <>
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18, marginBottom:16 }}>
                <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:12 }}>
                  Net Return After All Costs & Taxes — {monthly}€/month × {months/12}y ({etf})
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top:5, right:20, bottom:40, left:10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false}/>
                    <XAxis dataKey="name" tick={{ fill:'#64748B', fontSize:10 }} tickLine={false} angle={-25} textAnchor="end"/>
                    <YAxis tick={{ fill:'#475569', fontSize:10 }} tickLine={false} tickFormatter={v=>`${v}%`}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="net_return" name="Net Return %" radius={[4,4,0,0]}
                      fill="#3B82F6" label={{ position:'top', fill:'#94A3B8', fontSize:10, formatter:(v:any)=>`${v?.toFixed(1)}%` }}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Broker table */}
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, overflow:'hidden' }}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
                    <thead>
                      <tr style={{ background:'#0A111C' }}>
                        {['Rank','Broker','Type','Invested','Gross Final','Net Final','TX Costs','Tax Paid','Net Return','Cost Drag/y','LSE?','Rating'].map(h=>(
                          <th key={h} style={{ padding:'8px 11px', color:'#64748B', fontWeight:600, textAlign:h==='Broker'||h==='Type'?'left':'right', borderBottom:'1px solid #1E293B', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r:any, i:number) => {
                        const res = data.results?.[r.key]
                        const bInfo = brokers[r.key?.replace('_perso','').replace('_pro','')]
                        return (
                          <tr key={r.key} style={{ background:i%2?'#0A111C':'transparent' }}>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right' }}>
                              <span style={{ color:i===0?'#10B981':i===ranking.length-1?'#EF4444':'#94A3B8', fontWeight:700 }}>#{i+1}</span>
                            </td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B' }}>
                              <div style={{ fontWeight:700, color:'#E2E8F0' }}>{r.broker_name}</div>
                              <div style={{ fontSize:'0.65rem', color:'#475569' }}>{r.key?.includes('_pro')?'Pro':'Perso'}</div>
                            </td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', color:'#64748B', fontSize:'0.72rem' }}>{bInfo?.type?.replace('_',' ')}</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', color:'#94A3B8' }}>{res?.total_invested?.toLocaleString('fr-FR')}€</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', color:'#64748B' }}>{res?.gross_final?.toLocaleString('fr-FR')}€</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:i===0?'#10B981':i===ranking.length-1?'#EF4444':'#E2E8F0' }}>{res?.net_final?.toLocaleString('fr-FR')}€</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', color:'#F59E0B' }}>{res?.tx_costs_total?.toLocaleString('fr-FR')}€</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', color:'#8B5CF6' }}>{res?.cg_tax?.toLocaleString('fr-FR')}€</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:i===0?'#10B981':i===ranking.length-1?'#EF4444':'#94A3B8' }}>{r.net_return_pct?.toFixed(1)}%</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right', fontFamily:'monospace', color:'#EF4444' }}>{res?.cost_drag_annual_pct?.toFixed(2)}%</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'center' }}>{r.lse_accessible?'✅':'❌'}</td>
                            <td style={{ padding:'7px 11px', borderBottom:'1px solid #1E293B', textAlign:'right' }}>
                              {'★'.repeat(bInfo?.rating||0)}{'☆'.repeat(5-(bInfo?.rating||0))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* BREAKDOWN TAB */}
          {activeTab==='breakdown' && (
            <div>
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18, marginBottom:14 }}>
                <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:12 }}>Cost Breakdown — Where Your Money Goes</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top:5, right:20, bottom:40, left:10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false}/>
                    <XAxis dataKey="name" tick={{ fill:'#64748B', fontSize:10 }} tickLine={false} angle={-25} textAnchor="end"/>
                    <YAxis tick={{ fill:'#475569', fontSize:10 }} tickLine={false} tickFormatter={v=>`${v}€`}/>
                    <Tooltip content={<TT/>}/>
                    <Legend/>
                    <Bar dataKey="costs" name="Transaction Costs €" fill="#EF4444" radius={[2,2,0,0]} stackId="a"/>
                    <Bar dataKey="tax_paid" name="Tax Paid (PFU 30%) €" fill="#8B5CF6" radius={[2,2,0,0]} stackId="a"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Cost components per order */}
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18 }}>
                <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:12 }}>Cost Components per {monthly}€ Order (IBKR vs Worst)</h3>
                {['interactive_brokers_perso','la_poste_perso'].filter(k=>data.results?.[k]).map((bKey:string)=>{
                  const r = data.results[bKey]
                  return (
                    <div key={bKey} style={{ marginBottom:16 }}>
                      <div style={{ color:bKey.includes('interactive')?'#10B981':'#EF4444', fontWeight:700, fontSize:'0.85rem', marginBottom:8 }}>{r.broker_name}</div>
                      {[
                        ['Commission', r.tx_costs_total * 0.35, '#3B82F6'],
                        ['FX Spread', r.tx_costs_total * 0.40, '#F59E0B'],
                        ['Bid-Ask Spread', r.tx_costs_total * 0.08, '#8B5CF6'],
                        ['Market Impact', r.tx_costs_total * 0.05, '#EC4899'],
                        ['Slippage', r.tx_costs_total * 0.02, '#64748B'],
                        ['Custody/Inactivity', r.annual_custody_eur * (months/12), '#94A3B8'],
                      ].map(([label, val, color])=>(
                        <div key={label as string} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                          <span style={{ color:'#64748B', fontSize:'0.72rem', minWidth:140 }}>{label as string}</span>
                          <div style={{ flex:1, background:'#1E293B', height:5, borderRadius:3 }}>
                            <div style={{ width:`${Math.min(100,(val as number)/r.tx_costs_total*100)}%`, height:'100%', background:color as string, borderRadius:3 }}/>
                          </div>
                          <span style={{ fontFamily:'monospace', fontSize:'0.75rem', color:color as string, minWidth:60, textAlign:'right' }}>{(val as number)?.toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAX TAB */}
          {activeTab==='tax' && tax && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:14 }}>
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18 }}>
                <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:14 }}>🇫🇷 French Tax Framework (CTO 2025)</h3>
                {[
                  ['PFU (Flat Tax)',                 '30%',    '#EF4444', 'IR 12.8% + PS 17.2%'],
                  ['Capital Gains — IR component',   '12.8%',  '#F59E0B', 'Prélèvement Forfaitaire Unique'],
                  ['Capital Gains — PS component',   '17.2%',  '#F59E0B', 'Prélèvements sociaux'],
                  ['Dividends (PFU)',                 '30%',    '#8B5CF6', 'Same rate as capital gains'],
                  ['Irish ETF dividend WHT',          '15%',    '#3B82F6', 'Creditable against French tax'],
                  ['Net dividend tax (FR)',           '15%',    '#10B981', 'After WHT credit = 30%-15%'],
                  ['TTF (Transaction Tax)',           '0%',     '#10B981', 'ETFs exempt — art. 235 ter ZD CGI'],
                  ['Loss carryforward',               '10 yrs', '#94A3B8', 'Minus-values reportables'],
                  ['Annual exemption',                'None',   '#EF4444', 'No exemption on CTO'],
                ].map(([k,v,c,note])=>(
                  <div key={k as string} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'7px 0', borderBottom:'1px solid #0A111C' }}>
                    <div>
                      <div style={{ color:'#94A3B8', fontSize:'0.75rem' }}>{k as string}</div>
                      <div style={{ color:'#475569', fontSize:'0.65rem' }}>{note as string}</div>
                    </div>
                    <span style={{ color:c as string, fontFamily:'monospace', fontWeight:700, fontSize:'0.85rem', flexShrink:0, marginLeft:8 }}>{v as string}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:18 }}>
                <h3 style={{ color:'#F1F5F9', fontSize:'0.85rem', fontWeight:700, marginBottom:14 }}>📊 Tax Comparison by Account Type</h3>
                {[
                  { type:'CTO Perso', cg:'30% PFU', div:'30% (15% net after WHT)', ttf:'Exempt', exempt:'None', color:'#F59E0B' },
                  { type:'CTO Pro', cg:'30% PFU', div:'30% (15% net)', ttf:'Exempt', exempt:'None', color:'#F59E0B' },
                  { type:'PEA (if eligible)', cg:'0% after 5y (PS 17.2% only)', div:'0% reinvested', ttf:'Exempt', exempt:'Gains exempt from IR', color:'#10B981' },
                  { type:'PER', cg:'TMI on exit', div:'Reinvested', ttf:'Exempt', exempt:'Deductible contributions', color:'#3B82F6' },
                ].map(row=>(
                  <div key={row.type} style={{ background:'#0A111C', borderRadius:8, padding:12, marginBottom:10, border:`1px solid ${row.color}33` }}>
                    <div style={{ fontWeight:700, color:row.color, marginBottom:6, fontSize:'0.82rem' }}>{row.type}</div>
                    {[['Capital Gains',row.cg],['Dividends',row.div],['TTF',row.ttf],['Advantage',row.exempt]].map(([k,v])=>(
                      <div key={k} style={{ display:'flex', gap:8, marginBottom:3 }}>
                        <span style={{ color:'#475569', fontSize:'0.7rem', minWidth:110 }}>{k}:</span>
                        <span style={{ color:'#94A3B8', fontSize:'0.7rem' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ background:'#0A1F0E', border:'1px solid #166534', borderRadius:8, padding:12, marginTop:10 }}>
                  <div style={{ color:'#86EFAC', fontWeight:700, fontSize:'0.78rem', marginBottom:6 }}>⚠️ Islamic ETFs — PEA/PER Reality</div>
                  <div style={{ color:'#64748B', fontSize:'0.72rem', lineHeight:1.6 }}>
                    Islamic UCITS ETFs (ISWD, IUSF, etc.) are domiciled in Ireland/LSE. 
                    They are NOT eligible for PEA (requires EU domicile + &gt;75% EU equities). 
                    PER: unavailable as UCs in French insurance wrappers. 
                    <strong style={{ color:'#94A3B8' }}> CTO is the only viable account.</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
