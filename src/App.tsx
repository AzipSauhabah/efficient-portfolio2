import React, { useState, useCallback } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import { useCompare, useDCA, usePortfolioAnalysis, useLivePrices } from './hooks/useApi'
import { exportToPDF } from './utils/pdfExport'
import type { Portfolio, Period, TabId } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────
const ETF_COLORS: Record<string, string> = {
  ISWD: '#3B82F6', IUSF: '#8B5CF6', ISDE: '#F59E0B',
  AMAL: '#EF4444', HIWS: '#10B981', IWDA: '#94A3B8', CSPX: '#CBD5E1',
}
const ALL_ETFS = ['ISWD', 'IUSF', 'ISDE', 'AMAL', 'HIWS']
const BENCH = ['IWDA', 'CSPX']

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',   label: '📊 Live Prix' },
  { id: 'compare',    label: '📈 Comparer' },
  { id: 'dca',        label: '💰 DCA' },
  { id: 'portfolio',  label: '🗂 Portefeuilles' },
  { id: 'risk',       label: '⚠️ Risque' },
  { id: 'halal',      label: '☪️ Halal' },
  { id: 'verdict',    label: '🏆 Verdict' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────
const Tooltip_ = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#64748B', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', marginTop: 3, flexShrink: 0 }} />
          <span style={{ color: '#94A3B8' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const Badge = ({ ok, label }: { ok: boolean; label: string }) => (
  <span style={{
    background: ok ? '#0A2A14' : '#2A0A0A',
    color: ok ? '#10B981' : '#EF4444',
    border: `1px solid ${ok ? '#166534' : '#7F1D1D'}`,
    borderRadius: 4, padding: '2px 7px', fontSize: '0.68rem', fontWeight: 700
  }}>{label}</span>
)

const MetricVal = ({ v, metric, suffix = '' }: { v: number; metric: string; suffix?: string }) => {
  const color = metric === 'cagr' ? (v > 10 ? '#10B981' : v > 0 ? '#F59E0B' : '#EF4444')
    : metric === 'sharpe' ? (v > 1 ? '#10B981' : v > 0 ? '#F59E0B' : '#EF4444')
    : metric === 'mdd' ? (v > -25 ? '#10B981' : v > -40 ? '#F59E0B' : '#EF4444')
    : '#94A3B8'
  return <span style={{ color, fontWeight: 700, fontFamily: 'monospace' }}>{v > 0 && metric !== 'mdd' ? '+' : ''}{v}{suffix}</span>
}

const Loader = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: '#475569' }}>
    <div style={{ width: 16, height: 16, border: '2px solid #3B82F6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    Chargement depuis le backend Python…
  </div>
)

// ─── Portfolio Builder ────────────────────────────────────────────────────────
function PortfolioBuilder({ onAdd }: { onAdd: (p: Portfolio) => void }) {
  const [name, setName] = useState('Mon Portefeuille Halal')
  const [allocs, setAllocs] = useState<Record<string, number>>({ ISWD: 65, IUSF: 35 })
  const [monthly, setMonthly] = useState(200)
  const [period, setPeriod] = useState<Period>('5y')
  const total = Object.values(allocs).reduce((a, b) => a + b, 0)

  const setAlloc = (etf: string, val: number) => {
    if (val === 0) { const next = { ...allocs }; delete next[etf]; setAllocs(next) }
    else setAllocs(prev => ({ ...prev, [etf]: val }))
  }

  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 16 }}>➕ Créer un portefeuille</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Nom</label>
          <input value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
        </div>
        <div>
          <label style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>DCA mensuel (€)</label>
          <input type="number" value={monthly} onChange={e => setMonthly(+e.target.value)} min={50} step={50} style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
        </div>
        <div>
          <label style={{ color: '#64748B', fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Période</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['1y','2y','3y','5y'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${period === p ? '#3B82F6' : '#334155'}`, background: period === p ? '#3B82F622' : 'transparent', color: period === p ? '#3B82F6' : '#64748B', cursor: 'pointer', fontSize: '0.78rem' }}>{p}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>Allocations</span>
          <span style={{ color: total === 100 ? '#10B981' : '#EF4444', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700 }}>Total: {total}%</span>
        </div>
        {ALL_ETFS.map(etf => (
          <div key={etf} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: ETF_COLORS[etf], flexShrink: 0 }} />
            <span style={{ color: '#E2E8F0', fontWeight: 700, width: 50, fontSize: '0.82rem' }}>{etf}</span>
            <input type="range" min={0} max={100} value={allocs[etf] || 0} onChange={e => setAlloc(etf, +e.target.value)} style={{ flex: 1, accentColor: ETF_COLORS[etf] }} />
            <input type="number" min={0} max={100} value={allocs[etf] || 0} onChange={e => setAlloc(etf, +e.target.value)} style={{ width: 55, background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', color: '#E2E8F0', fontSize: '0.82rem', textAlign: 'right' }} />
            <span style={{ color: '#475569', fontSize: '0.78rem' }}>%</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          if (total !== 100) return alert('Les allocations doivent totaliser 100%')
          onAdd({ id: Date.now().toString(), name, allocations: allocs, monthly_dca: monthly, period, color: '#3B82F6' })
        }}
        style={{ background: total === 100 ? '#3B82F6' : '#334155', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: total === 100 ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.85rem' }}
      >
        🔬 Analyser ce portefeuille
      </button>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<TabId>('overview')
  const [compareEtfs, setCompareEtfs] = useState<string[]>(['ISWD', 'IUSF', 'IWDA'])
  const [period, setPeriod] = useState<Period>('5y')
  const [dcaEtf, setDcaEtf] = useState('ISWD')
  const [dcaMonthly, setDcaMonthly] = useState(200)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])

  const { prices, loading: pricesLoading, refresh: refreshPrices } = useLivePrices()
  const { data: compareData, loading: compareLoading } = useCompare(compareEtfs, period)
  const { data: dcaData, loading: dcaLoading } = useDCA(dcaEtf, dcaMonthly, period)
  const { results: portResults, loading: portLoading, analyze } = usePortfolioAnalysis()

  const addPortfolio = useCallback((p: Portfolio) => {
    setPortfolios(prev => {
      const next = [...prev.filter(x => x.id !== p.id), p]
      analyze(p)
      return next
    })
  }, [analyze])

  // Build normalized performance chart data
  const perfChartData = (() => {
    if (!Object.keys(compareData).length) return []
    const allDates = new Set<string>()
    Object.values(compareData).forEach(d => d.normalized.dates.forEach(dt => allDates.add(dt)))
    const dates = [...allDates].sort()
    return dates.map(date => {
      const row: Record<string, any> = { date }
      Object.entries(compareData).forEach(([k, v]) => {
        const idx = v.normalized.dates.indexOf(date)
        if (idx !== -1) row[k] = v.normalized.prices[idx]
      })
      return row
    })
  })()

  return (
    <div style={{ background: '#060B14', minHeight: '100vh', color: '#E2E8F0', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0F172A,#0D1B2E)', borderBottom: '1px solid #1E293B', padding: '18px 24px' }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', borderRadius: 10, padding: '6px 10px', fontSize: 20 }}>☪️</div>
              <div>
                <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#F1F5F9', margin: 0 }}>Halal ETF Analytics</h1>
                <p style={{ color: '#475569', fontSize: '0.75rem', margin: 0 }}>Backend Python · yfinance · FastAPI · Multi-portefeuille · Export PDF</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s infinite' }} />
            <span style={{ color: '#10B981', fontSize: '0.75rem', fontWeight: 600 }}>API Live</span>
            <button onClick={refreshPrices} style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 6, padding: '5px 12px', color: '#94A3B8', cursor: 'pointer', fontSize: '0.75rem' }}>↻ Refresh</button>
            <button
              onClick={() => {
                const res = Object.values(portResults)
                if (!res.length) return alert('Ajoutez et analysez d\'abord un portefeuille')
                exportToPDF(res, 'Analyse ETF Halal — Multi-Portefeuille')
              }}
              style={{ background: '#3B82F6', border: 'none', borderRadius: 6, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
            >📄 Export PDF</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#0A111C', borderBottom: '1px solid #1E293B', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap', color: tab === t.id ? '#3B82F6' : '#64748B', borderBottom: tab === t.id ? '2px solid #3B82F6' : '2px solid transparent', fontSize: '0.8rem', fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── OVERVIEW: Live Prices ── */}
        {tab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[...ALL_ETFS, ...BENCH].map(key => {
                const lp = prices[key]
                const info = compareData[key]?.info
                return (
                  <div key={key} style={{ background: '#0F172A', border: `1px solid ${ETF_COLORS[key] || '#1E293B'}33`, borderRadius: 12, padding: 16, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: ETF_COLORS[key] || '#334155' }} />
                    <div style={{ fontWeight: 800, color: ETF_COLORS[key] || '#94A3B8', fontSize: '1rem', marginBottom: 4 }}>{key}</div>
                    <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 10 }}>{info?.name || key}</div>
                    {pricesLoading ? (
                      <div style={{ color: '#334155', fontSize: '0.8rem' }}>Chargement…</div>
                    ) : lp?.price ? (
                      <>
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.3rem', color: '#F1F5F9' }}>{lp.price.toFixed(2)}</div>
                        <div style={{ color: (lp.change_pct || 0) >= 0 ? '#10B981' : '#EF4444', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem' }}>
                          {(lp.change_pct || 0) >= 0 ? '▲' : '▼'} {Math.abs(lp.change_pct || 0)}%
                        </div>
                        <div style={{ color: '#334155', fontSize: '0.65rem', marginTop: 4 }}>{lp.source === 'live' ? '🟢 Live' : '🟡 Simulé'}</div>
                      </>
                    ) : (
                      <div style={{ color: '#475569', fontSize: '0.78rem' }}>Indisponible</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Quick metrics table from compare */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1E293B' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#F1F5F9' }}>Métriques Clés — Données Backend Python</span>
              </div>
              {compareLoading ? <Loader /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#0A111C' }}>
                        {['ETF','CAGR','Volatilité','Max DD','Sharpe','Sortino','Calmar','VaR 95%','Source'].map(h => (
                          <th key={h} style={{ padding: '9px 14px', color: '#64748B', fontWeight: 600, textAlign: h === 'ETF' ? 'left' : 'right', borderBottom: '1px solid #1E293B', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(compareData).map(([key, d], i) => {
                        const m = d.metrics
                        return (
                          <tr key={key} style={{ background: i % 2 ? '#0A111C' : 'transparent' }}>
                            <td style={{ padding: '9px 14px', borderBottom: '1px solid #1E293B' }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ETF_COLORS[key] || '#94A3B8' }} />
                                <span style={{ fontWeight: 700 }}>{key}</span>
                              </div>
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricVal v={m.cagr} metric="cagr" suffix="%" /></td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#94A3B8' }}>{m.volatility}%</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricVal v={m.max_drawdown} metric="mdd" suffix="%" /></td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricVal v={m.sharpe} metric="sharpe" /></td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: m.sortino > 1 ? '#10B981' : '#F59E0B' }}>{m.sortino}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: m.calmar > 0.5 ? '#10B981' : '#EF4444' }}>{m.calmar}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#F59E0B' }}>{m.var_95}%</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}>
                              <span style={{ fontSize: '0.68rem', color: d.source === 'live' ? '#10B981' : '#F59E0B' }}>{d.source === 'live' ? '🟢 Live' : '🟡 Sim.'}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMPARE ── */}
        {tab === 'compare' && (
          <div>
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {[...ALL_ETFS, ...BENCH].map(key => (
                  <button key={key} onClick={() => setCompareEtfs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${compareEtfs.includes(key) ? ETF_COLORS[key] : '#334155'}`, background: compareEtfs.includes(key) ? (ETF_COLORS[key] + '22') : 'transparent', color: compareEtfs.includes(key) ? ETF_COLORS[key] : '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: compareEtfs.includes(key) ? 700 : 400 }}>{key}</button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {(['1y','2y','3y','5y'] as Period[]).map(p => (
                    <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${period === p ? '#3B82F6' : '#334155'}`, background: period === p ? '#3B82F622' : 'transparent', color: period === p ? '#3B82F6' : '#64748B', cursor: 'pointer', fontSize: '0.75rem' }}>{p}</button>
                  ))}
                </div>
              </div>
              {compareLoading ? <Loader /> : (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={perfChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} interval={Math.floor(perfChartData.length / 8)} />
                    <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} />
                    <Tooltip content={<Tooltip_ />} />
                    <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
                    {compareEtfs.map(key => (
                      <Line key={key} type="monotone" dataKey={key} stroke={ETF_COLORS[key] || '#94A3B8'} strokeWidth={BENCH.includes(key) ? 1.5 : 2} dot={false} strokeDasharray={BENCH.includes(key) ? '5 3' : undefined} />
                    ))}
                    <Legend />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ── DCA ── */}
        {tab === 'dca' && (
          <div>
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 6 }}>ETF</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ALL_ETFS.map(k => (
                      <button key={k} onClick={() => setDcaEtf(k)} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${dcaEtf === k ? ETF_COLORS[k] : '#334155'}`, background: dcaEtf === k ? ETF_COLORS[k] + '22' : 'transparent', color: dcaEtf === k ? ETF_COLORS[k] : '#64748B', cursor: 'pointer', fontSize: '0.78rem', fontWeight: dcaEtf === k ? 700 : 400 }}>{k}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 6 }}>Montant mensuel</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[50, 100, 200, 500, 1000].map(a => (
                      <button key={a} onClick={() => setDcaMonthly(a)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${dcaMonthly === a ? '#3B82F6' : '#334155'}`, background: dcaMonthly === a ? '#3B82F622' : 'transparent', color: dcaMonthly === a ? '#3B82F6' : '#64748B', cursor: 'pointer', fontSize: '0.78rem' }}>{a}€</button>
                    ))}
                  </div>
                </div>
              </div>
              {dcaLoading ? <Loader /> : dcaData && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                    {[
                      { label: 'Investi', v: `${dcaData.summary?.total_invested?.toLocaleString('fr-FR')}€`, c: '#94A3B8' },
                      { label: 'Valeur finale', v: `${dcaData.summary?.final_value?.toLocaleString('fr-FR')}€`, c: ETF_COLORS[dcaEtf] },
                      { label: 'Gain', v: `${dcaData.summary?.total_gain > 0 ? '+' : ''}${dcaData.summary?.total_gain?.toLocaleString('fr-FR')}€`, c: dcaData.summary?.total_gain > 0 ? '#10B981' : '#EF4444' },
                      { label: 'Performance', v: `${dcaData.summary?.total_return_pct > 0 ? '+' : ''}${dcaData.summary?.total_return_pct}%`, c: dcaData.summary?.total_return_pct > 0 ? '#10B981' : '#EF4444' },
                      { label: 'Multiplicateur', v: `×${dcaData.summary?.multiplier}`, c: '#8B5CF6' },
                      { label: 'Mois', v: `${dcaData.summary?.n_months}`, c: '#F59E0B' },
                    ].map(kpi => (
                      <div key={kpi.label} style={{ background: '#0A111C', border: '1px solid #1E293B', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ color: '#475569', fontSize: '0.7rem', marginBottom: 4 }}>{kpi.label}</div>
                        <div style={{ color: kpi.c, fontWeight: 800, fontFamily: 'monospace', fontSize: '1.1rem' }}>{kpi.v}</div>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dcaData.records} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <defs>
                        <linearGradient id="gVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ETF_COLORS[dcaEtf]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={ETF_COLORS[dcaEtf]} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} interval={5} />
                      <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<Tooltip_ />} />
                      <Legend />
                      <Area type="monotone" dataKey="invested" name="Investi €" stroke="#475569" strokeWidth={2} fill="#47556922" />
                      <Area type="monotone" dataKey="value" name="Valeur €" stroke={ETF_COLORS[dcaEtf]} strokeWidth={2.5} fill="url(#gVal)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── PORTFOLIOS ── */}
        {tab === 'portfolio' && (
          <div>
            <PortfolioBuilder onAdd={addPortfolio} />
            {portfolios.map(p => {
              const res = portResults[p.id]
              const loading = portLoading[p.id]
              return (
                <div key={p.id} style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', margin: 0 }}>{p.name}</h3>
                      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '4px 0 0' }}>
                        {Object.entries(p.allocations).map(([k, v]) => `${k} ${v}%`).join(' · ')} · DCA {p.monthly_dca}€/mois
                      </p>
                    </div>
                    <button onClick={() => exportToPDF(res ? [res] : [], p.name)} style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 6, padding: '6px 12px', color: '#94A3B8', cursor: 'pointer', fontSize: '0.75rem' }}>📄 PDF</button>
                  </div>
                  {loading ? <Loader /> : res && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {[
                          { label: 'CAGR', v: res.portfolio_metrics.cagr, m: 'cagr', s: '%' },
                          { label: 'Sharpe', v: res.portfolio_metrics.sharpe, m: 'sharpe', s: '' },
                          { label: 'Max DD', v: res.portfolio_metrics.max_drawdown, m: 'mdd', s: '%' },
                          { label: 'Sortino', v: res.portfolio_metrics.sortino, m: 'sharpe', s: '' },
                          { label: 'Gain DCA', v: res.portfolio_dca.summary.total_gain, m: 'cagr', s: '€' },
                          { label: '×', v: res.portfolio_dca.summary.multiplier, m: '', s: 'x' },
                        ].map(kpi => (
                          <div key={kpi.label} style={{ background: '#0A111C', borderRadius: 8, padding: '10px 12px', border: '1px solid #1E293B' }}>
                            <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 3 }}>{kpi.label}</div>
                            <MetricVal v={kpi.v} metric={kpi.m} suffix={kpi.s} />
                          </div>
                        ))}
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={res.portfolio_dca.records.slice(-60)} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                          <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval={5} />
                          <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                          <Tooltip content={<Tooltip_ />} />
                          <Area type="monotone" dataKey="invested" name="Investi €" stroke="#475569" strokeWidth={1.5} fill="#47556911" />
                          <Area type="monotone" dataKey="value" name="Valeur €" stroke="#3B82F6" strokeWidth={2} fill="#3B82F622" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </div>
              )
            })}
            {!portfolios.length && (
              <div style={{ textAlign: 'center', color: '#334155', padding: 40, fontSize: '0.9rem' }}>
                Créez votre premier portefeuille ci-dessus ↑
              </div>
            )}
          </div>
        )}

        {/* ── HALAL ── */}
        {tab === 'halal' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {ALL_ETFS.map(key => {
              const info = compareData[key]?.info
              return (
                <div key={key} style={{ background: '#0A1F0E', border: '1px solid #166534', borderRadius: 12, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, color: ETF_COLORS[key], fontSize: '1.1rem' }}>{key}</span>
                    <Badge ok label="✓ HALAL" />
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.75rem', marginBottom: 12 }}>{info?.name}</div>
                  {[
                    ['Shariah Board', info?.board || '—'],
                    ['ISIN', info?.isin || '—'],
                    ['TER', `${info?.ter || '—'}%`],
                    ['Filtres', 'Alcool, tabac, armes, banques conv., jeux'],
                    ['Filtre fin.', 'Dette ≤ 33% | Intérêts ≤ 5% revenus'],
                    ['PEA', '❌ Non éligible'],
                    ['PER', '❌ Non disponible'],
                    ['CTO', '✅ Accessible (DEGIRO, IBKR)'],
                  ].map(([k, v]) => (
                    <div key={k as string} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                      <span style={{ color: '#475569', fontSize: '0.72rem', minWidth: 80 }}>{k}:</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ── VERDICT ── */}
        {tab === 'verdict' && (
          <div>
            {[
              { rank: 1, etf: 'ISWD', verdict: 'INVESTIR ✅', color: '#10B981', bg: '#0A1F0E', score: '9.1/10', text: 'Meilleur ratio risque/rendement halal. Sharpe ~1.15, CAGR ~11%, Max DD contenu. Cœur de portefeuille recommandé à 60-70%.' },
              { rank: 2, etf: 'IUSF', verdict: 'COMPLÉMENTAIRE ✅', color: '#3B82F6', bg: '#0A111F', score: '7.4/10', text: 'Exposition USA pure, TER le plus bas (0.30%). Complète ISWD mais chevauchement ~60% des titres. Limiter à 20-30%.' },
              { rank: 3, etf: 'AMAL', verdict: 'ATTENDRE ⚠️', color: '#F59E0B', bg: '#1A1305', score: '4.8/10', text: 'Gestion active, AUM trop faible (15M€). Risque de fermeture. Surveiller si AUM dépasse 100M€.' },
              { rank: 4, etf: 'ISDE', verdict: 'ÉVITER ❌', color: '#EF4444', bg: '#1A0808', score: '2.1/10', text: 'CAGR négatif, Max DD -65%, TER 0.85%. Double pénalité EM + filtres islamiques. À éviter catégoriquement.' },
              { rank: 5, etf: 'HIWS', verdict: 'ÉVITER ❌', color: '#EF4444', bg: '#1A0808', score: '1.8/10', text: 'Pire CAGR des 5 ETFs. Historique trop court (2022). Même problématique qu\'ISDE sans historique suffisant.' },
            ].map(item => (
              <div key={item.etf} style={{ background: item.bg, border: `1.5px solid ${item.color}44`, borderRadius: 12, padding: 18, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: item.color + '22', border: `2px solid ${item.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: item.color, fontSize: '1.1rem', flexShrink: 0 }}>#{item.rank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: item.color, fontSize: '1.05rem' }}>{item.etf}</span>
                    <span style={{ background: item.color + '22', border: `1px solid ${item.color}`, color: item.color, padding: '3px 10px', borderRadius: 16, fontSize: '0.75rem', fontWeight: 700 }}>{item.verdict}</span>
                    <span style={{ color: '#475569', fontSize: '0.78rem' }}>Score: <span style={{ color: item.color, fontWeight: 700 }}>{item.score}</span></span>
                  </div>
                  <p style={{ color: '#94A3B8', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>{item.text}</p>
                </div>
              </div>
            ))}
            <div style={{ background: '#0A1F0E', border: '1px solid #166534', borderRadius: 12, padding: 20, marginTop: 8 }}>
              <h3 style={{ color: '#86EFAC', fontWeight: 700, marginBottom: 12 }}>📐 Allocation Optimale Recommandée</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {[{ l: 'ISWD', p: 65, c: '#3B82F6' }, { l: 'IUSF', p: 25, c: '#8B5CF6' }, { l: 'Cash/Or', p: 10, c: '#F59E0B' }].map(a => (
                  <div key={a.l} style={{ background: '#0F2A14', border: `1px solid ${a.c}33`, borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: a.c }}>{a.l}</span>
                      <span style={{ fontWeight: 800, color: a.c, fontFamily: 'monospace', fontSize: '1.2rem' }}>{a.p}%</span>
                    </div>
                    <div style={{ background: '#1E293B', height: 5, borderRadius: 3 }}>
                      <div style={{ width: `${a.p}%`, height: '100%', background: a.c, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: 24, padding: '12px 16px', background: '#0A0A0A', borderRadius: 8, fontSize: '0.7rem', color: '#334155', lineHeight: 1.6 }}>
          ⚠️ Analyse éducative uniquement — pas un conseil en investissement (AMF). Performances passées ≠ performances futures. Données via yfinance (live) ou simulation GBM calibrée.
        </div>
      </div>
    </div>
  )
}
