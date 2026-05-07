import React, { useState, useCallback, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { useRegistry, useCompare, useDCA, usePortfolioAnalysis, useLivePrices } from './hooks/useApi'
import { exportToPDF }       from './utils/pdfExport'
import { TickerManager, SignalsPanel, StrategyPanel, OptimizerPanel } from './components/QuantPanels'
import { CostPanel }         from './components/CostPanel'
import { SignificancePanel } from './components/SignificancePanel'
import { VerdictPanel }      from './components/VerdictPanel'
import { AgentPanel }        from './components/AgentPanel'
import type { Portfolio, Period } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hashColor(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return '#' + ((Math.abs(h) * 0x1f1f1f) & 0xFFFFFF).toString(16).padStart(6, '0')
}
const PRESET_COLORS: Record<string, string> = {
  ISWD: '#3B82F6', IUSF: '#8B5CF6', ISDE: '#F59E0B',
  AMAL: '#EF4444', HIWS: '#10B981', IWDA: '#94A3B8',
  CSPX: '#CBD5E1', GLD:  '#F59E0B',
}
const getColor = (k: string) => PRESET_COLORS[k] || hashColor(k)

const TABS = [
  { id: 'overview',     label: '📊 Live Prices'    },
  { id: 'compare',      label: '📈 Compare'         },
  { id: 'dca',          label: '💰 DCA'             },
  { id: 'portfolio',    label: '🗂 Portfolios'      },
  { id: 'signals',      label: '🎯 AI Signals'      },
  { id: 'strategy',     label: '🔬 Strategies'      },
  { id: 'optimize',     label: '📐 Optimize'        },
  { id: 'significance', label: '📏 Significance'    },
  { id: 'costs',        label: '💶 Costs & Tax'     },
  { id: 'verdict',      label: '🏆 Verdict'         },
  { id: 'agent',        label: '🤖 AI Agent'        },
  { id: 'tickers',      label: '⚙️ Tickers'         },
  { id: 'halal',        label: '☪️ Halal'           },
]

// ─── Shared UI ────────────────────────────────────────────────────────────────
const TT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#64748B', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
          <span style={{ color: '#94A3B8' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const MVal = ({ v, metric, suffix = '' }: { v: number; metric: string; suffix?: string }) => {
  const c = metric === 'cagr'   ? (v > 10 ? '#10B981' : v > 0 ? '#F59E0B' : '#EF4444')
          : metric === 'sharpe' ? (v > 1  ? '#10B981' : v > 0 ? '#F59E0B' : '#EF4444')
          : metric === 'mdd'    ? (v > -25 ? '#10B981' : v > -40 ? '#F59E0B' : '#EF4444')
          : '#94A3B8'
  return <span style={{ color: c, fontWeight: 700, fontFamily: 'monospace' }}>{v > 0 && metric !== 'mdd' ? '+' : ''}{v}{suffix}</span>
}

const Loader = ({ text = 'Loading from Python backend…' }: { text?: string }) => (
  <div style={{ display: 'flex', gap: 10, padding: 32, color: '#475569', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 16, height: 16, border: '2px solid #3B82F6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    {text}
  </div>
)

const ErrorBox = ({ msg }: { msg: string }) => (
  <div style={{ background: '#1A0808', border: '1px solid #7F1D1D', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: '0.82rem' }}>
    ❌ {msg}
  </div>
)

// ─── Portfolio Builder ────────────────────────────────────────────────────────
function PortfolioBuilder({ onAdd, availableKeys }: { onAdd: (p: Portfolio) => void; availableKeys: string[] }) {
  const [name, setName]       = useState('My Halal Portfolio')
  const [allocs, setAllocs]   = useState<Record<string, number>>({ ISWD: 65, IUSF: 35 })
  const [monthly, setMonthly] = useState(200)
  const [period, setPeriod]   = useState<Period>('5y')
  const total = Object.values(allocs).reduce((a, b) => a + b, 0)

  const setAlloc = (etf: string, val: number) => {
    if (val === 0) { const n = { ...allocs }; delete n[etf]; setAllocs(n) }
    else setAllocs(p => ({ ...p, [etf]: val }))
  }

  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 16 }}>➕ Create Portfolio</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
        </div>
        <div>
          <label style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Monthly DCA (€)</label>
          <input type="number" value={monthly} onChange={e => setMonthly(+e.target.value)} min={10} step={50}
            style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
        </div>
        <div>
          <label style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Period</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['1y', '2y', '3y', '5y'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${period === p ? '#3B82F6' : '#334155'}`, background: period === p ? '#3B82F622' : 'transparent', color: period === p ? '#3B82F6' : '#64748B', cursor: 'pointer', fontSize: '0.78rem' }}>{p}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Allocations</span>
          <span style={{ color: total === 100 ? '#10B981' : '#EF4444', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem' }}>Total: {total}%</span>
        </div>
        {availableKeys.map(etf => (
          <div key={etf} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: getColor(etf), flexShrink: 0 }} />
            <span style={{ color: '#E2E8F0', fontWeight: 700, width: 52, fontSize: '0.82rem' }}>{etf}</span>
            <input type="range" min={0} max={100} value={allocs[etf] || 0} onChange={e => setAlloc(etf, +e.target.value)} style={{ flex: 1, accentColor: getColor(etf) }} />
            <input type="number" min={0} max={100} value={allocs[etf] || 0} onChange={e => setAlloc(etf, +e.target.value)}
              style={{ width: 52, background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', color: '#E2E8F0', fontSize: '0.82rem', textAlign: 'right' }} />
            <span style={{ color: '#475569', fontSize: '0.78rem' }}>%</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => { if (total !== 100) return alert('Allocations must total 100%'); onAdd({ id: Date.now().toString(), name, allocations: allocs, monthly_dca: monthly, period, color: '#3B82F6' }) }}
        style={{ background: total === 100 ? '#3B82F6' : '#334155', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: total === 100 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.85rem' }}>
        🔬 Analyze Portfolio
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]             = useState('overview')
  const [period, setPeriod]       = useState<Period>('5y')
  const [dcaEtf, setDcaEtf]       = useState('ISWD')
  const [dcaMonthly, setDcaMonthly] = useState(200)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])

  // ── Registry (source of truth for all ETF keys) ────────────────────
  const { registry, loading: regLoading, refresh: refreshRegistry } = useRegistry()
  const allKeys = Object.keys(registry)

  // ── Compare: auto-loads when registry is ready ────────────────────
  const [compareEtfs, setCompareEtfs] = useState<string[]>([])
  useEffect(() => {
    if (allKeys.length > 0 && compareEtfs.length === 0) {
      // Default: all halal ETFs + IWDA benchmark
      const defaults = allKeys.filter(k => registry[k]?.halal || k === 'IWDA').slice(0, 5)
      setCompareEtfs(defaults.length > 0 ? defaults : allKeys.slice(0, 4))
    }
  }, [allKeys.join(',')])

  const { data: compareData, loading: compareLoading, error: compareError } = useCompare(compareEtfs, period)
  const { data: dcaData,     loading: dcaLoading }   = useDCA(dcaEtf, dcaMonthly, period)
  const { results: portResults, loading: portLoading, analyze } = usePortfolioAnalysis()
  const { prices, loading: pricesLoading, refresh: refreshPrices } = useLivePrices()

  const addPortfolio = useCallback((p: Portfolio) => {
    setPortfolios(prev => [...prev.filter(x => x.id !== p.id), p])
    analyze(p)
  }, [analyze])

  // ── Performance chart data (normalized to 100) ─────────────────────
  const perfData = (() => {
    if (!Object.keys(compareData).length) return []
    const allDates = new Set<string>()
    Object.values(compareData).forEach(d => (d as any).normalized?.dates?.forEach((dt: string) => allDates.add(dt)))
    return [...allDates].sort().map(date => {
      const row: Record<string, any> = { date }
      Object.entries(compareData).forEach(([k, v]) => {
        const idx = (v as any).normalized?.dates?.indexOf(date)
        if (idx != null && idx !== -1) row[k] = (v as any).normalized.prices[idx]
      })
      return row
    })
  })()

  // ── DCA data shape (backend returns { key, info, variant, records, summary })
  const dcaRecords = dcaData?.records || []
  const dcaSummary = dcaData?.summary || {}

  return (
    <div style={{ background: '#060B14', minHeight: '100vh', color: '#E2E8F0', fontFamily: "'IBM Plex Sans','Segoe UI',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#0F172A,#0D1B2E)', borderBottom: '1px solid #1E293B', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', borderRadius: 10, padding: '6px 10px', fontSize: 20 }}>☪️</div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F1F5F9', margin: 0 }}>Halal ETF Analytics</h1>
              <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>
                Python · FastAPI · yfinance · 20+ metrics · Buy&Hold · ADN · Renaissance · Stat Significance · Cost Model · AI Agent
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {regLoading
              ? <span style={{ color: '#475569', fontSize: '0.72rem' }}>⏳ Loading registry…</span>
              : <><div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s infinite' }} /><span style={{ color: '#10B981', fontSize: '0.72rem', fontWeight: 600 }}>API Live</span><span style={{ color: '#334155', fontSize: '0.72rem' }}>{allKeys.length} tickers</span></>
            }
            <button onClick={refreshPrices} style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem' }}>↻ Refresh</button>
            <button onClick={() => { const res = Object.values(portResults); if (!res.length) return alert('Analyze a portfolio first'); exportToPDF(res as any) }}
              style={{ background: '#3B82F6', border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>📄 PDF</button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: '#0A111C', borderBottom: '1px solid #1E293B', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '11px 14px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', color: tab === t.id ? '#3B82F6' : '#64748B', borderBottom: tab === t.id ? '2px solid #3B82F6' : '2px solid transparent', fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px' }}>

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div>
            {regLoading ? <Loader text="Loading registry…" /> : (
              <>
                {/* Live price cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
                  {allKeys.map(key => {
                    const lp = prices[key]
                    const info = registry[key]
                    return (
                      <div key={key} style={{ background: '#0F172A', border: `1px solid ${getColor(key)}33`, borderRadius: 12, padding: 14, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: getColor(key) }} />
                        <div style={{ fontWeight: 800, color: getColor(key), fontSize: '0.95rem' }}>{key}</div>
                        <div style={{ color: '#475569', fontSize: '0.62rem', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info?.name}</div>
                        {pricesLoading ? (
                          <div style={{ color: '#334155', fontSize: '0.75rem' }}>…</div>
                        ) : lp?.price ? (
                          <>
                            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.2rem', color: '#F1F5F9' }}>{lp.price.toFixed(2)}</div>
                            <div style={{ color: (lp.change_pct || 0) >= 0 ? '#10B981' : '#EF4444', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem' }}>
                              {(lp.change_pct || 0) >= 0 ? '▲' : '▼'} {Math.abs(lp.change_pct || 0).toFixed(2)}%
                            </div>
                            <div style={{ color: '#334155', fontSize: '0.58rem', marginTop: 3 }}>
                              {lp.source === 'live' ? '🟢 Live' : '🟡 Estimated'} · {lp.currency}
                            </div>
                            {info?.halal && <div style={{ fontSize: '0.58rem', color: '#10B981', marginTop: 2 }}>✓ Halal</div>}
                          </>
                        ) : (
                          <div style={{ color: '#334155', fontSize: '0.75rem' }}>Unavailable</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Metrics table */}
                <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#F1F5F9' }}>Metrics — Python backend</span>
                    <span style={{ fontSize: '0.7rem', color: '#475569' }}>{Object.keys(compareData).length} ETFs loaded</span>
                  </div>
                  {compareLoading ? <Loader /> : compareError ? <ErrorBox msg={compareError} /> : Object.keys(compareData).length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#334155' }}>Waiting for data… (registry must load first)</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ background: '#0A111C' }}>
                            {['ETF', 'CAGR', 'Vol.', 'Max DD', 'Sharpe', 'Sortino', 'Calmar', 'Omega', 'VaR 95%', 'Log R²', 'Source'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', color: '#64748B', fontWeight: 600, textAlign: h === 'ETF' ? 'left' : 'right', borderBottom: '1px solid #1E293B', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(compareData).map(([key, d]: any, i) => {
                            const m = d.metrics || {}
                            return (
                              <tr key={key} style={{ background: i % 2 ? '#0A111C' : 'transparent' }}>
                                <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B' }}>
                                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: getColor(key) }} />
                                    <span style={{ fontWeight: 700 }}>{key}</span>
                                    {registry[key]?.halal && <span style={{ fontSize: '0.6rem', color: '#10B981' }}>✓</span>}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MVal v={m.cagr} metric="cagr" suffix="%" /></td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#94A3B8' }}>{m.volatility}%</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MVal v={m.max_drawdown} metric="mdd" suffix="%" /></td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MVal v={m.sharpe} metric="sharpe" /></td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: m.sortino > 1 ? '#10B981' : '#F59E0B' }}>{m.sortino}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: m.calmar > 0.5 ? '#10B981' : '#EF4444' }}>{m.calmar}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#8B5CF6' }}>{m.omega}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#F59E0B' }}>{m.var_95}%</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: m.log_r_squared > 0.85 ? '#10B981' : '#94A3B8' }}>{m.log_r_squared}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><span style={{ fontSize: '0.65rem', color: d.source === 'live' ? '#10B981' : '#F59E0B' }}>{d.source === 'live' ? '🟢 Live' : '🟡 Sim.'}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ COMPARE ══ */}
        {tab === 'compare' && (
          <div>
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                {allKeys.map(key => (
                  <button key={key} onClick={() => setCompareEtfs(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])} style={{ padding: '4px 10px', borderRadius: 16, border: `1.5px solid ${compareEtfs.includes(key) ? getColor(key) : '#334155'}`, background: compareEtfs.includes(key) ? getColor(key) + '22' : 'transparent', color: compareEtfs.includes(key) ? getColor(key) : '#64748B', cursor: 'pointer', fontSize: '0.75rem', fontWeight: compareEtfs.includes(key) ? 700 : 400 }}>{key}</button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {(['1y', '2y', '3y', '5y'] as Period[]).map(p => (
                    <button key={p} onClick={() => setPeriod(p)} style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${period === p ? '#3B82F6' : '#334155'}`, background: period === p ? '#3B82F622' : 'transparent', color: period === p ? '#3B82F6' : '#64748B', cursor: 'pointer', fontSize: '0.75rem' }}>{p}</button>
                  ))}
                </div>
              </div>
              {compareLoading ? <Loader /> : compareError ? <ErrorBox msg={compareError} /> : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={perfData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} interval={Math.max(1, Math.floor(perfData.length / 8))} />
                    <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} />
                    <Tooltip content={<TT />} />
                    <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
                    {compareEtfs.map(key => (
                      <Line key={key} type="monotone" dataKey={key} stroke={getColor(key)} strokeWidth={2} dot={false} strokeDasharray={['IWDA', 'CSPX'].includes(key) ? '5 3' : undefined} />
                    ))}
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ══ DCA ══ */}
        {tab === 'dca' && (
          <div>
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <p style={{ color: '#64748B', fontSize: '0.72rem', marginBottom: 6 }}>ETF</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {allKeys.map(k => (
                      <button key={k} onClick={() => setDcaEtf(k)} style={{ padding: '4px 10px', borderRadius: 16, border: `1.5px solid ${dcaEtf === k ? getColor(k) : '#334155'}`, background: dcaEtf === k ? getColor(k) + '22' : 'transparent', color: dcaEtf === k ? getColor(k) : '#64748B', cursor: 'pointer', fontSize: '0.75rem', fontWeight: dcaEtf === k ? 700 : 400 }}>{k}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p style={{ color: '#64748B', fontSize: '0.72rem', marginBottom: 6 }}>Monthly amount</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[50, 100, 200, 500, 1000].map(a => (
                      <button key={a} onClick={() => setDcaMonthly(a)} style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${dcaMonthly === a ? '#3B82F6' : '#334155'}`, background: dcaMonthly === a ? '#3B82F622' : 'transparent', color: dcaMonthly === a ? '#3B82F6' : '#64748B', cursor: 'pointer', fontSize: '0.75rem' }}>{a}€</button>
                    ))}
                  </div>
                </div>
              </div>
              {dcaLoading ? <Loader /> : dcaData && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'Invested',    v: `${dcaSummary.total_invested?.toLocaleString()}€`,       c: '#94A3B8' },
                      { label: 'Final Value', v: `${dcaSummary.final_value?.toLocaleString()}€`,          c: getColor(dcaEtf) },
                      { label: 'Gain',        v: `${dcaSummary.total_gain > 0 ? '+' : ''}${dcaSummary.total_gain?.toLocaleString()}€`, c: dcaSummary.total_gain > 0 ? '#10B981' : '#EF4444' },
                      { label: 'Return',      v: `${dcaSummary.total_return_pct > 0 ? '+' : ''}${dcaSummary.total_return_pct}%`,       c: dcaSummary.total_return_pct > 0 ? '#10B981' : '#EF4444' },
                      { label: 'Multiplier',  v: `×${dcaSummary.multiplier}`,                             c: '#8B5CF6' },
                      { label: 'Months',      v: `${dcaSummary.n_months}`,                                c: '#F59E0B' },
                    ].map(kpi => (
                      <div key={kpi.label} style={{ background: '#0A111C', border: '1px solid #1E293B', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 3 }}>{kpi.label}</div>
                        <div style={{ color: kpi.c, fontWeight: 800, fontFamily: 'monospace', fontSize: '1rem' }}>{kpi.v}</div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={dcaRecords} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={getColor(dcaEtf)} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={getColor(dcaEtf)} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval={5} />
                      <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<TT />} />
                      <Legend />
                      <Area type="monotone" dataKey="invested" name="Invested €" stroke="#475569" strokeWidth={2} fill="#47556922" />
                      <Area type="monotone" dataKey="value"    name="Value €"    stroke={getColor(dcaEtf)} strokeWidth={2.5} fill="url(#gv)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ PORTFOLIOS ══ */}
        {tab === 'portfolio' && (
          <div>
            <PortfolioBuilder onAdd={addPortfolio} availableKeys={allKeys} />
            {portfolios.map(p => {
              const res = portResults[p.id]
              const loading_ = portLoading[p.id]
              const pm = (res as any)?.portfolio_metrics || {}
              const pdca = (res as any)?.portfolio_dca?.summary || {}
              return (
                <div key={p.id} style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>{p.name}</h3>
                      <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>{Object.entries(p.allocations).map(([k, v]) => `${k} ${v}%`).join(' · ')} · DCA {p.monthly_dca}€/mo</p>
                    </div>
                    <button onClick={() => res && exportToPDF([res as any], p.name)} style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 6, padding: '5px 10px', color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem' }}>📄 PDF</button>
                  </div>
                  {loading_ ? <Loader /> : res && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 14 }}>
                        {[
                          { label: 'CAGR',    v: pm.cagr,              m: 'cagr',   s: '%' },
                          { label: 'Sharpe',  v: pm.sharpe,            m: 'sharpe', s: '' },
                          { label: 'Max DD',  v: pm.max_drawdown,      m: 'mdd',    s: '%' },
                          { label: 'Sortino', v: pm.sortino,           m: 'sharpe', s: '' },
                          { label: 'DCA Gain',v: pdca.total_gain,      m: 'cagr',   s: '€' },
                          { label: '×',       v: pdca.multiplier,      m: '',       s: 'x' },
                        ].map(kpi => (
                          <div key={kpi.label} style={{ background: '#0A111C', borderRadius: 8, padding: '9px 11px', border: '1px solid #1E293B' }}>
                            <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: 3 }}>{kpi.label}</div>
                            <MVal v={kpi.v} metric={kpi.m} suffix={kpi.s} />
                          </div>
                        ))}
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={(res as any).portfolio_dca?.records?.slice(-60)} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                          <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 8 }} tickLine={false} interval={5} />
                          <YAxis tick={{ fill: '#475569', fontSize: 8 }} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<TT />} />
                          <Area type="monotone" dataKey="invested" name="Invested €" stroke="#475569" strokeWidth={1.5} fill="#47556911" />
                          <Area type="monotone" dataKey="value"    name="Value €"    stroke="#3B82F6" strokeWidth={2} fill="#3B82F622" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </div>
              )
            })}
            {!portfolios.length && <div style={{ textAlign: 'center', color: '#334155', padding: 40 }}>Create your first portfolio above ↑</div>}
          </div>
        )}

        {/* ══ Delegated panels ══ */}
        {tab === 'signals'      && <SignalsPanel      registry={registry} />}
        {tab === 'strategy'     && <StrategyPanel     registry={registry} />}
        {tab === 'optimize'     && <OptimizerPanel    registry={registry} />}
        {tab === 'significance' && <SignificancePanel  registry={registry} />}
        {tab === 'costs'        && <CostPanel          registry={registry} />}
        {tab === 'verdict'      && <VerdictPanel       registry={registry} />}
        {tab === 'agent'        && <AgentPanel         registry={registry} />}
        {tab === 'tickers'      && <TickerManager      registry={registry} onRefresh={refreshRegistry} />}

        {/* ══ HALAL ══ */}
        {tab === 'halal' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 14 }}>
            {allKeys.filter(k => registry[k]?.halal).map(key => {
              const info = registry[key]
              return (
                <div key={key} style={{ background: '#0A1F0E', border: '1px solid #166534', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, color: getColor(key), fontSize: '1rem' }}>{key}</span>
                    <span style={{ background: '#14532D', color: '#86EFAC', padding: '2px 7px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700 }}>✓ HALAL</span>
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.73rem', marginBottom: 10 }}>{info.name}</div>
                  {[
                    ['Shariah Board', info.board || '—'],
                    ['ISIN', info.isin || '—'],
                    ['TER', `${info.ter}%`],
                    ['Screens', 'Alcohol, tobacco, weapons, conv. banks, gambling'],
                    ['Financial filter', 'Debt ≤ 33% | Interest ≤ 5% revenue'],
                    ['PEA', '❌ Not eligible'],
                    ['PER', '❌ Not available'],
                    ['CTO', '✅ DEGIRO, IBKR, Boursorama'],
                  ].map(([k, v]) => (
                    <div key={k as string} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: '#475569', fontSize: '0.7rem', minWidth: 110 }}>{k}:</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.7rem' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 20, padding: '10px 14px', background: '#0A0A0A', borderRadius: 7, fontSize: '0.68rem', color: '#334155' }}>
          ⚠️ Educational analysis only — not investment advice (AMF). Past performance ≠ future results. Data via yfinance (live) or GBM calibrated simulation.
        </div>
      </div>
    </div>
  )
}
