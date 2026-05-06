import React, { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'

const API = '/api'

const SIGNAL_COLOR = (s: string) =>
  s === 'bullish' ? '#10B981' : s === 'bearish' ? '#EF4444' : '#F59E0B'

const METRIC_GROUPS = [
  { label: 'Performance', keys: ['cagr','total_return','annualized_slope'], suffix: '%' },
  { label: 'Risque ajusté', keys: ['sharpe','sortino','calmar','omega','martin'], suffix: '' },
  { label: 'Drawdown', keys: ['max_drawdown','ulcer_index','pain_index'], suffix: '%' },
  { label: 'Tail Risk', keys: ['var_95','cvar_95','var_99','cvar_99'], suffix: '%' },
  { label: 'Distribution', keys: ['skewness','excess_kurtosis','win_rate','profit_factor'], suffix: '' },
  { label: 'Structure', keys: ['autocorr_lag1','log_r_squared','tail_ratio'], suffix: '' },
]

const PRESETS = [
  { id: 'buffett_quality',      label: '🧠 Buffett Quality',       color: '#3B82F6' },
  { id: 'renaissance_composite',label: '🔬 Renaissance Composite', color: '#8B5CF6' },
  { id: 'dual_momentum',        label: '🚀 Dual Momentum',         color: '#10B981' },
  { id: 'trend_following',      label: '📈 Trend EMA',             color: '#F59E0B' },
  { id: 'mean_reversion',       label: '🔄 Mean Reversion',        color: '#EF4444' },
  { id: 'rsi_contrarian',       label: '⚡ RSI Contrarian',        color: '#EC4899' },
]

const Chip = ({ label, color, active, onClick }: any) => (
  <button onClick={onClick} style={{
    padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${active ? color : '#334155'}`,
    background: active ? color + '22' : 'transparent', color: active ? color : '#64748B',
    cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 400, transition: 'all 0.15s'
  }}>{label}</button>
)

const Loader = () => (
  <div style={{ display: 'flex', gap: 10, padding: 24, color: '#475569', alignItems: 'center' }}>
    <div style={{ width: 14, height: 14, border: '2px solid #3B82F6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    Calcul backend Python…
  </div>
)

const TT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ color: '#64748B', marginBottom: 6 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, marginBottom: 2 }}>
          <span style={{ color: '#94A3B8' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Ticker Manager ──────────────────────────────────────────────────────────
export function TickerManager({ registry, onRefresh }: { registry: Record<string, any>; onRefresh: () => void }) {
  const [form, setForm] = useState({ key: '', ticker: '', name: '', ter: 0, halal: false, category: 'custom', gbm_mu: 0.08, gbm_sigma: 0.18 })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const addTicker = async () => {
    if (!form.key || !form.ticker) return setMsg('Clé et ticker requis')
    setLoading(true)
    try {
      const r = await fetch(`${API}/registry/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, key: form.key.toUpperCase() })
      })
      const d = await r.json()
      setMsg(`✅ ${d.added} ajouté. Registry: ${d.registry_size} tickers`)
      onRefresh()
    } catch (e) { setMsg('❌ Erreur') }
    setLoading(false)
  }

  const removeTicker = async (key: string) => {
    if (!confirm(`Supprimer ${key} ?`)) return
    await fetch(`${API}/registry/${key}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div>
      {/* Add form */}
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>➕ Ajouter un ticker</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'Clé courte (ex: MSFT)', field: 'key' },
            { label: 'Ticker Yahoo (ex: MSFT)', field: 'ticker' },
            { label: 'Nom complet', field: 'name' },
          ].map(f => (
            <div key={f.field}>
              <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>{f.label}</label>
              <input value={(form as any)[f.field]} onChange={e => setForm(p => ({ ...p, [f.field]: e.target.value }))}
                style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
            </div>
          ))}
          <div>
            <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>TER (%)</label>
            <input type="number" value={form.ter} step={0.05} onChange={e => setForm(p => ({ ...p, ter: +e.target.value }))}
              style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
          </div>
          <div>
            <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>μ GBM (drift annuel)</label>
            <input type="number" value={form.gbm_mu} step={0.01} onChange={e => setForm(p => ({ ...p, gbm_mu: +e.target.value }))}
              style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
          </div>
          <div>
            <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: 4 }}>σ GBM (vol annuelle)</label>
            <input type="number" value={form.gbm_sigma} step={0.01} onChange={e => setForm(p => ({ ...p, gbm_sigma: +e.target.value }))}
              style={{ width: '100%', background: '#0A111C', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', color: '#E2E8F0', fontSize: '0.82rem' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
            <input type="checkbox" checked={form.halal} onChange={e => setForm(p => ({ ...p, halal: e.target.checked }))} id="halal-cb" />
            <label htmlFor="halal-cb" style={{ color: '#94A3B8', fontSize: '0.82rem', cursor: 'pointer' }}>Halal certifié</label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={addTicker} disabled={loading} style={{ background: '#3B82F6', border: 'none', borderRadius: 8, padding: '9px 18px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
            {loading ? 'Ajout…' : '➕ Ajouter'}
          </button>
          {msg && <span style={{ fontSize: '0.78rem', color: msg.startsWith('✅') ? '#10B981' : '#EF4444' }}>{msg}</span>}
        </div>
      </div>

      {/* Registry table */}
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1E293B' }}>
          <span style={{ fontWeight: 700, color: '#F1F5F9', fontSize: '0.88rem' }}>Registry actuel — {Object.keys(registry).length} tickers</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#0A111C' }}>
                {['Clé','Ticker Yahoo','Nom','ISIN','TER','Halal','Catégorie','Action'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', color: '#64748B', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #1E293B', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(registry).map(([key, info]: [string, any], i) => (
                <tr key={key} style={{ background: i % 2 ? '#0A111C' : 'transparent' }}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B', fontWeight: 700, color: '#3B82F6' }}>{key}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#94A3B8' }}>{info.ticker}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B', color: '#E2E8F0', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#475569', fontSize: '0.68rem' }}>{info.isin || '—'}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B', color: '#94A3B8' }}>{info.ter}%</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B' }}>
                    <span style={{ background: info.halal ? '#0A2A14' : '#1A1A1A', color: info.halal ? '#10B981' : '#475569', padding: '2px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700 }}>
                      {info.halal ? '✓ Halal' : '✗'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B', color: '#64748B' }}>{info.category}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #1E293B' }}>
                    <button onClick={() => removeTicker(key)} style={{ background: 'transparent', border: '1px solid #3B1515', color: '#EF4444', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Signals Panel ───────────────────────────────────────────────────────────
export function SignalsPanel({ registry }: { registry: Record<string, any> }) {
  const [selectedKey, setSelectedKey] = useState('ISWD')
  const [signals, setSignals] = useState<any>(null)
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState('5y')

  const load = async (key: string) => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/metrics/${key}?period=${period}`)
      const d = await r.json()
      setSignals(d.signals)
      setMetrics(d.metrics)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const allKeys = Object.keys(registry)

  return (
    <div>
      {/* Selector */}
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {allKeys.map(k => (
            <Chip key={k} label={k} color={(registry[k] as any)?.halal ? '#10B981' : '#94A3B8'} active={selectedKey === k} onClick={() => setSelectedKey(k)} />
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {['1y','2y','3y','5y'].map(p => (
              <Chip key={p} label={p} color="#3B82F6" active={period === p} onClick={() => setPeriod(p)} />
            ))}
          </div>
        </div>
        <button onClick={() => load(selectedKey)} style={{ background: '#3B82F6', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
          🔍 Analyser {selectedKey}
        </button>
      </div>

      {loading && <Loader />}

      {signals && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Signals grid */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 14 }}>🎯 Signaux IA / Stat</h3>
            {[
              { label: 'RSI 14', value: `${signals.rsi_14}`, signal: signals.rsi_signal, hint: '<30 oversold | >70 overbought' },
              { label: 'Z-Score', value: `${signals.z_score}`, signal: signals.z_signal, hint: '<-1.5 mean reversion buy' },
              { label: 'BB Percentile', value: `${signals.bb_percentile}%`, signal: signals.bb_signal, hint: '<10% band lower' },
              { label: 'EMA Cross', value: `${signals.ema_cross_pct}%`, signal: signals.ema_signal, hint: 'EMA50 vs EMA200' },
              { label: 'MACD Hist.', value: `${signals.macd_histogram}`, signal: signals.macd_signal, hint: 'Signal line cross' },
              { label: 'Momentum 12-1', value: `${signals.momentum_12_1}%`, signal: signals.momentum_signal, hint: 'Jegadeesh-Titman' },
              { label: 'Trend R²', value: `${signals.trend_r2}`, signal: signals.trend_direction, hint: 'Log-lin R² quality' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 8px', background: '#0A111C', borderRadius: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: SIGNAL_COLOR(s.signal), flexShrink: 0 }} />
                <span style={{ color: '#94A3B8', fontSize: '0.78rem', flex: 1 }}>{s.label}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: SIGNAL_COLOR(s.signal), fontSize: '0.82rem' }}>{s.value}</span>
                <span style={{ fontSize: '0.65rem', color: '#475569' }}>{s.hint}</span>
              </div>
            ))}
            {/* Composite scores */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Renaissance Score', value: signals.renaissance_score, color: '#8B5CF6', max: 100 },
                { label: 'Buffett Quality', value: signals.buffett_quality, color: '#3B82F6', max: 100 },
              ].map(sc => (
                <div key={sc.label} style={{ background: '#0A111C', borderRadius: 8, padding: 12, border: `1px solid ${sc.color}33` }}>
                  <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 6 }}>{sc.label}</div>
                  <div style={{ color: sc.color, fontWeight: 800, fontFamily: 'monospace', fontSize: '1.4rem', marginBottom: 6 }}>{sc.value}/100</div>
                  <div style={{ background: '#1E293B', height: 6, borderRadius: 3 }}>
                    <div style={{ width: `${sc.value}%`, height: '100%', background: sc.color, borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics deep dive */}
          {metrics && (
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18, overflow: 'auto', maxHeight: 500 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 14 }}>📊 20+ Métriques</h3>
              {METRIC_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: 14 }}>
                  <div style={{ color: '#475569', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{group.label}</div>
                  {group.keys.map(k => {
                    const v = metrics[k]
                    if (v === null || v === undefined) return null
                    const isGood = k === 'cagr' ? v > 10 : k === 'sharpe' ? v > 1 : k === 'max_drawdown' ? v > -25 : null
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #0A111C' }}>
                        <span style={{ color: '#64748B', fontSize: '0.75rem' }}>{k.replace(/_/g,' ')}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem',
                          color: isGood === true ? '#10B981' : isGood === false ? '#EF4444' : '#94A3B8' }}>
                          {typeof v === 'number' ? v.toFixed(3) : v}{group.suffix}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rolling returns chart */}
      {metrics?.rolling_1y?.length > 0 && !loading && (
        <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18, marginTop: 16 }}>
          <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>CAGR Glissant 1 an — {selectedKey}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.rolling_1y} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <ReferenceLine y={0} stroke="#475569" />
              <Bar dataKey="return" name="CAGR 1an %" fill="#3B82F6" opacity={0.8} radius={[2, 2, 0, 0]}
                label={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Strategy Backtester Panel ────────────────────────────────────────────────
export function StrategyPanel({ registry }: { registry: Record<string, any> }) {
  const allKeys = Object.keys(registry)
  const [selectedKeys, setSelectedKeys] = useState<string[]>(['ISWD', 'IUSF'])
  const [preset, setPreset] = useState('renaissance_composite')
  const [capital, setCapital] = useState(10000)
  const [period, setPeriod] = useState('5y')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [presets, setPresets] = useState<any>({})

  React.useEffect(() => {
    fetch(`${API}/strategies/presets`).then(r => r.json()).then(d => setPresets(d.presets || {})).catch(() => {})
  }, [])

  const runBacktest = async () => {
    if (!selectedKeys.length) return
    setLoading(true)
    try {
      const p = presets[preset] || {}
      const body = {
        keys: selectedKeys,
        strategy: { ...p, name: p.name || preset },
        initial_capital: capital,
        period,
        benchmark_key: 'IWDA',
      }
      const r = await fetch(`${API}/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      setResult(await r.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const m = result?.metrics
  const bm = result?.benchmark_metrics

  return (
    <div>
      {/* Config */}
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>⚙️ Configuration Stratégie</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 8 }}>Stratégie</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRESETS.map(p => <Chip key={p.id} label={p.label} color={p.color} active={preset === p.id} onClick={() => setPreset(p.id)} />)}
            </div>
            {presets[preset] && <p style={{ color: '#475569', fontSize: '0.72rem', marginTop: 6 }}>{presets[preset].description}</p>}
          </div>
          <div>
            <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 8 }}>ETFs à backtester</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {allKeys.map(k => (
                <Chip key={k} label={k} color="#3B82F6"
                  active={selectedKeys.includes(k)}
                  onClick={() => setSelectedKeys(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 6 }}>Capital initial</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {[5000,10000,50000,100000].map(c => (
                  <Chip key={c} label={`${c.toLocaleString()}€`} color="#8B5CF6" active={capital === c} onClick={() => setCapital(c)} />
                ))}
              </div>
            </div>
            <div>
              <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 6 }}>Période</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {['1y','2y','3y','5y'].map(p => <Chip key={p} label={p} color="#F59E0B" active={period === p} onClick={() => setPeriod(p)} />)}
              </div>
            </div>
            <button onClick={runBacktest} disabled={loading} style={{ background: '#8B5CF6', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
              {loading ? '⏳ Calcul…' : '▶ Lancer Backtest'}
            </button>
          </div>
        </div>
      </div>

      {loading && <Loader />}

      {result && !loading && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Capital final', v: `${result.final_capital?.toLocaleString('fr-FR')}€`, c: result.final_capital > capital ? '#10B981' : '#EF4444' },
              { label: 'CAGR strat.', v: `${m?.cagr > 0 ? '+' : ''}${m?.cagr}%`, c: m?.cagr > 10 ? '#10B981' : m?.cagr > 0 ? '#F59E0B' : '#EF4444' },
              { label: 'CAGR bench.', v: `${bm?.cagr > 0 ? '+' : ''}${bm?.cagr}%`, c: '#94A3B8' },
              { label: 'Alpha', v: `${result.alpha > 0 ? '+' : ''}${result.alpha}%`, c: result.alpha > 0 ? '#10B981' : '#EF4444' },
              { label: 'Sharpe', v: `${m?.sharpe}`, c: m?.sharpe > 1 ? '#10B981' : m?.sharpe > 0 ? '#F59E0B' : '#EF4444' },
              { label: 'Max DD', v: `${m?.max_drawdown}%`, c: m?.max_drawdown > -20 ? '#10B981' : m?.max_drawdown > -35 ? '#F59E0B' : '#EF4444' },
              { label: 'Sortino', v: `${m?.sortino}`, c: m?.sortino > 1.5 ? '#10B981' : '#F59E0B' },
              { label: 'N Trades', v: `${result.n_trades}`, c: '#94A3B8' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 3 }}>{kpi.label}</div>
                <div style={{ color: kpi.c, fontWeight: 800, fontFamily: 'monospace', fontSize: '1rem' }}>{kpi.v}</div>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>
              Courbe d'équité — {result.strategy_name}
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={result.equity_curve} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} interval={Math.floor(result.equity_curve.length / 8)} />
                <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<TT />} />
                <Line type="monotone" dataKey="value" name="Portefeuille €" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                <ReferenceLine y={capital} stroke="#334155" strokeDasharray="4 4" label={{ value: 'Capital initial', fill: '#475569', fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Trades log */}
          {result.trades?.length > 0 && (
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>
                📋 Derniers trades ({result.n_trades} total)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#0A111C' }}>
                      <th style={{ padding: '7px 12px', color: '#64748B', textAlign: 'left', borderBottom: '1px solid #1E293B' }}>Date</th>
                      {selectedKeys.map(k => (
                        <th key={k} style={{ padding: '7px 12px', color: '#64748B', textAlign: 'right', borderBottom: '1px solid #1E293B' }}>{k}</th>
                      ))}
                      <th style={{ padding: '7px 12px', color: '#64748B', textAlign: 'right', borderBottom: '1px solid #1E293B' }}>Turnover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(-15).map((t: any, i: number) => (
                      <tr key={i} style={{ background: i % 2 ? '#0A111C' : 'transparent' }}>
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#94A3B8' }}>{t.date}</td>
                        {selectedKeys.map(k => (
                          <td key={k} style={{ padding: '6px 12px', borderBottom: '1px solid #1E293B', textAlign: 'right', fontFamily: 'monospace', color: t.weights?.[k] > 0.3 ? '#10B981' : '#94A3B8' }}>
                            {t.weights?.[k] !== undefined ? `${(t.weights[k]*100).toFixed(0)}%` : '—'}
                          </td>
                        ))}
                        <td style={{ padding: '6px 12px', borderBottom: '1px solid #1E293B', textAlign: 'right', fontFamily: 'monospace', color: '#F59E0B' }}>{(t.turnover*100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Optimizer Panel ──────────────────────────────────────────────────────────
export function OptimizerPanel({ registry }: { registry: Record<string, any> }) {
  const allKeys = Object.keys(registry)
  const [keys, setKeys] = useState<string[]>(['ISWD', 'IUSF', 'ISDE'])
  const [method, setMethod] = useState('max_sharpe')
  const [period, setPeriod] = useState('3y')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const METHODS = [
    { id: 'max_sharpe', label: '🏆 Max Sharpe', color: '#3B82F6' },
    { id: 'min_vol', label: '🛡 Min Volatilité', color: '#10B981' },
    { id: 'risk_parity', label: '⚖️ Risk Parity', color: '#8B5CF6' },
    { id: 'equal_weight', label: '= Equal Weight', color: '#F59E0B' },
    { id: 'max_diversification', label: '🌐 Max Diversif.', color: '#EC4899' },
  ]

  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/optimize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, method, period, risk_free_rate: 0.03 })
      })
      setResult(await r.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>📐 Optimisation de Portefeuille (Markowitz)</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 8 }}>Méthode</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {METHODS.map(m => <Chip key={m.id} label={m.label} color={m.color} active={method === m.id} onClick={() => setMethod(m.id)} />)}
            </div>
          </div>
          <div>
            <p style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: 8 }}>ETFs à optimiser (min 2)</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {allKeys.map(k => <Chip key={k} label={k} color="#3B82F6" active={keys.includes(k)} onClick={() => setKeys(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])} />)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['1y','2y','3y','5y'].map(p => <Chip key={p} label={p} color="#F59E0B" active={period === p} onClick={() => setPeriod(p)} />)}
            </div>
            <button onClick={run} disabled={loading || keys.length < 2} style={{ background: '#3B82F6', border: 'none', borderRadius: 8, padding: '9px 18px', color: '#fff', fontWeight: 700, cursor: keys.length < 2 ? 'not-allowed' : 'pointer', fontSize: '0.82rem', opacity: keys.length < 2 ? 0.5 : 1 }}>
              {loading ? '⏳…' : '⚡ Optimiser'}
            </button>
          </div>
        </div>
      </div>

      {loading && <Loader />}

      {result && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Weights */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 14 }}>Poids optimaux</h3>
            <div style={{ marginBottom: 14 }}>
              {Object.entries(result.weights).map(([k, w]: [string, any]) => (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#94A3B8', fontWeight: 700 }}>{k}</span>
                    <span style={{ color: '#3B82F6', fontFamily: 'monospace', fontWeight: 800 }}>{(w*100).toFixed(1)}%</span>
                  </div>
                  <div style={{ background: '#1E293B', height: 6, borderRadius: 3 }}>
                    <div style={{ width: `${w*100}%`, height: '100%', background: '#3B82F6', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: '#0A111C', borderRadius: 8, padding: 12, border: '1px solid #1E3A5F' }}>
              {[
                { label: 'Rendement attendu', v: `${result.expected_return}%`, c: '#10B981' },
                { label: 'Volatilité attendue', v: `${result.expected_vol}%`, c: '#F59E0B' },
                { label: 'Sharpe attendu', v: `${result.expected_sharpe}`, c: '#3B82F6' },
              ].map(kpi => (
                <div key={kpi.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748B', fontSize: '0.78rem' }}>{kpi.label}</span>
                  <span style={{ color: kpi.c, fontFamily: 'monospace', fontWeight: 700 }}>{kpi.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Efficient Frontier */}
          <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 18 }}>
            <h3 style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>Frontière Efficiente</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={result.efficient_frontier} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="vol" name="Volatilité %" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}%`} label={{ value: 'Vol %', fill: '#475569', fontSize: 10, position: 'insideBottom', offset: -3 }} />
                <YAxis dataKey="ret" name="Rendement %" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip content={<TT />} formatter={(v: any) => `${v}%`} />
                <Line type="monotone" dataKey="ret" name="Rendement %" stroke="#3B82F6" strokeWidth={2} dot={{ r: 2, fill: '#3B82F6' }} />
              </LineChart>
            </ResponsiveContainer>
            {/* Correlation matrix */}
            {result.correlation && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 6 }}>MATRICE DE CORRÉLATION</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '4px 8px', color: '#475569' }}></th>
                        {Object.keys(result.correlation).map(k => <th key={k} style={{ padding: '4px 8px', color: '#64748B' }}>{k}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.correlation).map(([k, row]: [string, any]) => (
                        <tr key={k}>
                          <td style={{ padding: '4px 8px', fontWeight: 700, color: '#64748B' }}>{k}</td>
                          {Object.entries(row).map(([k2, v]: [string, any]) => {
                            const corr = +v
                            const bg = corr > 0.8 ? '#3B1A1A' : corr > 0.5 ? '#1A2A1A' : '#0A111C'
                            return <td key={k2} style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace', background: bg, color: corr > 0.8 ? '#EF4444' : corr > 0.5 ? '#F59E0B' : '#94A3B8' }}>{corr.toFixed(2)}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
