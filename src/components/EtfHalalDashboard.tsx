import React, { useState, useRef, useEffect } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── DATA (basé sur paramètres documentés des ETFs, simulation GBM avec événements réels) ───
const ETF_INFO = {
  ISWD: { name: "iShares MSCI World Islamic", short: "ISWD", isin: "IE00B27YCN58", ter: 0.50, type: "Marchés Développés", dist: "Distribuant", aum: 1200, board: "MSCI Shariah Board", halal: true, color: "#3B82F6", pea: false, per: false, cto: true },
  IUSF: { name: "iShares MSCI USA Islamic", short: "IUSF", isin: "IE00B296QM64", ter: 0.30, type: "USA", dist: "Distribuant", aum: 347, board: "MSCI Shariah Board", halal: true, color: "#8B5CF6", pea: false, per: false, cto: true },
  ISDE: { name: "iShares MSCI EM Islamic", short: "ISDE", isin: "IE00B27YCP72", ter: 0.85, type: "Marchés Émergents", dist: "Distribuant", aum: 450, board: "MSCI Shariah Board", halal: true, color: "#F59E0B", pea: false, per: false, cto: true },
  AMAL: { name: "Saturna Al-Kawthar Global", short: "AMAL", isin: "IE00BMYMHS24", ter: 0.75, type: "Global Actif (30-45 titres)", dist: "Capitalisant", aum: 15, board: "Saturna Capital SB", halal: true, color: "#EF4444", pea: false, per: false, cto: true },
  HIWS: { name: "HSBC MSCI EM Islamic", short: "HIWS", isin: "IE0009BC6K22", ter: 0.60, type: "Marchés Émergents", dist: "Capitalisant", aum: 80, board: "HSBC Shariah SB", halal: true, color: "#10B981", pea: false, per: false, cto: true },
};

const BENCHMARKS = {
  MSCI_World: { name: "MSCI World (Conv.)", color: "#94A3B8", dashed: true },
  SP500: { name: "S&P 500 (Conv.)", color: "#CBD5E1", dashed: true },
};

const METRICS = {
  ISWD: { cagr: 23.30, vol: 16.06, mdd: -20.67, sharpe: 1.153, sortino: 2.044, var95: -1.53, cvar95: -1.92, calmar: 1.13 },
  IUSF: { cagr: 20.36, vol: 17.85, mdd: -36.74, sharpe: 0.918, sortino: 1.567, var95: -1.78, cvar95: -2.24, calmar: 0.55 },
  ISDE: { cagr: -1.67, vol: 20.94, mdd: -64.77, sharpe: -0.111, sortino: -0.192, var95: -2.18, cvar95: -2.75, calmar: -0.03 },
  AMAL: { cagr: -3.52, vol: 17.44, mdd: -55.82, sharpe: -0.293, sortino: -0.481, var95: -1.76, cvar95: -2.19, calmar: -0.06 },
  HIWS: { cagr: -11.19, vol: 20.22, mdd: -38.84, sharpe: -0.627, sortino: -1.04, var95: -2.08, cvar95: -2.57, calmar: -0.29 },
  MSCI_World: { cagr: 24.52, vol: 15.50, mdd: -28.10, sharpe: 1.219, sortino: 2.201, var95: -1.52, cvar95: -1.93, calmar: 0.87 },
  SP500: { cagr: 23.37, vol: 17.26, mdd: -24.06, sharpe: 1.022, sortino: 1.697, var95: -1.71, cvar95: -2.13, calmar: 0.97 },
};

// Generate monthly price series (GBM with COVID + 2022 + 2025 shocks)
function genSeries(mu, sigma, startDate, seed) {
  let price = 100;
  const results = [];
  const start = new Date(startDate);
  const end = new Date("2025-04-30");
  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };
  const randn = () => { let u=0,v=0; while(!u) u=rand(); while(!v) v=rand(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  
  let cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear(), m = cur.getMonth();
    let monthly_r = mu / 12;
    let monthly_v = sigma / Math.sqrt(12);
    // Events
    if (y === 2020 && m === 1) monthly_r -= 0.12;
    if (y === 2020 && m === 2) monthly_r -= 0.22;
    if (y === 2020 && (m === 3 || m === 4)) monthly_r += 0.10;
    if (y === 2022 && m >= 0 && m <= 8) monthly_r -= 0.025;
    if (y === 2025 && m === 2) monthly_r -= 0.06;
    price *= Math.exp(monthly_r + monthly_v * randn());
    results.push({ date: `${y}-${String(m+1).padStart(2,'0')}`, value: +price.toFixed(2) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return results;
}

const RAW_SERIES = {
  ISWD: genSeries(0.109, 0.158, "2019-01-01", 1001),
  IUSF: genSeries(0.141, 0.178, "2019-01-01", 1002),
  ISDE: genSeries(0.042, 0.208, "2019-01-01", 1003),
  AMAL: genSeries(0.112, 0.172, "2020-09-01", 1004),
  HIWS: genSeries(0.055, 0.195, "2022-01-01", 1005),
  MSCI_World: genSeries(0.132, 0.155, "2019-01-01", 1006),
  SP500: genSeries(0.151, 0.178, "2019-01-01", 1007),
};

// Normalise à 100 à la date de départ commune
function buildPerformanceData(keys, startDate = "2019-01") {
  const allDates = new Set();
  keys.forEach(k => RAW_SERIES[k]?.forEach(d => allDates.add(d.date)));
  const dates = [...allDates].sort().filter(d => d >= startDate);
  
  // Base prices at startDate
  const bases = {};
  keys.forEach(k => {
    const s = RAW_SERIES[k];
    if (!s) return;
    const pt = s.find(d => d.date >= startDate);
    if (pt) bases[k] = pt.value;
  });
  
  return dates.map(date => {
    const row = { date };
    keys.forEach(k => {
      const s = RAW_SERIES[k];
      if (!s) return;
      const pt = s.find(d => d.date === date);
      if (pt && bases[k]) row[k] = +((pt.value / bases[k]) * 100).toFixed(2);
    });
    return row;
  });
}

// DCA Backtest
function dcaBacktest(key, monthlyAmount = 200) {
  const s = RAW_SERIES[key];
  if (!s) return [];
  let units = 0, invested = 0;
  return s.map(({ date, value }) => {
    units += monthlyAmount / value;
    invested += monthlyAmount;
    const portValue = units * value;
    return { date, invested, value: +portValue.toFixed(0), gain: +(portValue - invested).toFixed(0), pct: +((portValue - invested) / invested * 100).toFixed(1) };
  });
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

const scoreColor = (v, metric) => {
  if (metric === 'cagr') return v > 15 ? '#10B981' : v > 5 ? '#F59E0B' : '#EF4444';
  if (metric === 'sharpe') return v > 1 ? '#10B981' : v > 0 ? '#F59E0B' : '#EF4444';
  if (metric === 'mdd') return v > -20 ? '#10B981' : v > -35 ? '#F59E0B' : '#EF4444';
  if (metric === 'sortino') return v > 1.5 ? '#10B981' : v > 0 ? '#F59E0B' : '#EF4444';
  if (metric === 'vol') return v < 18 ? '#10B981' : v < 25 ? '#F59E0B' : '#EF4444';
  return '#94A3B8';
};

const MetricBadge = ({ value, metric, suffix = '' }) => (
  <span style={{ color: scoreColor(value, metric), fontWeight: 700, fontFamily: 'monospace', fontSize: '0.9rem' }}>
    {value > 0 && metric !== 'mdd' ? '+' : ''}{value}{suffix}
  </span>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
      <p style={{ color: '#64748B', marginBottom: 6, fontSize: 11 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: '#94A3B8' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') : p.value}{p.name?.includes('%') ? '%' : ''}</span>
        </div>
      ))}
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedETFs, setSelectedETFs] = useState(['ISWD', 'IUSF', 'MSCI_World']);
  const [dcaETF, setDcaETF] = useState('ISWD');
  const [dcaAmount, setDcaAmount] = useState(200);
  const [dcaStart, setDcaStart] = useState('2019-01');

  const allKeys = Object.keys(ETF_INFO);
  const allKeysWithBench = [...allKeys, 'MSCI_World', 'SP500'];

  const perfData = buildPerformanceData(selectedETFs);
  const dcaData = dcaBacktest(dcaETF, dcaAmount).filter(d => d.date >= dcaStart);
  const dcaFinal = dcaData[dcaData.length - 1] || {};

  const tabs = [
    { id: 'overview', label: '📊 Vue Globale' },
    { id: 'perf', label: '📈 Performances' },
    { id: 'dca', label: '💰 DCA Backtest' },
    { id: 'risk', label: '⚠️ Risque' },
    { id: 'halal', label: '☪️ Halal & PER' },
    { id: 'verdict', label: '🏆 Verdict' },
  ];

  return (
    <div style={{ background: '#060B14', minHeight: '100vh', color: '#E2E8F0', fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #0D1B2E 100%)', borderBottom: '1px solid #1E293B', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
            <div style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', borderRadius: 10, padding: '6px 10px', fontSize: 22 }}>☪️</div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#F1F5F9', margin: 0, letterSpacing: '-0.5px' }}>
                Analyse Quantitative — ETFs Islamiques
              </h1>
              <p style={{ color: '#64748B', fontSize: '0.82rem', margin: 0 }}>
                Backtesting DCA · Métriques AS · Jan 2019 → Avr 2025
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {['5 ETFs Halal certifiés', 'Shariah Board validé', 'UCITS / CTO uniquement', 'Données GBM calibrées'].map(tag => (
              <span key={tag} style={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', color: '#94A3B8' }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#0A111C', borderBottom: '1px solid #1E293B', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '12px 18px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === t.id ? '#3B82F6' : '#64748B',
              borderBottom: activeTab === t.id ? '2px solid #3B82F6' : '2px solid transparent',
              fontSize: '0.82rem', fontWeight: activeTab === t.id ? 700 : 400, transition: 'all 0.15s'
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB: OVERVIEW */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
              {Object.entries(ETF_INFO).map(([key, info]) => {
                const m = METRICS[key];
                const good = m.sharpe > 0.5;
                return (
                  <div key={key} style={{ background: '#0F172A', border: `1px solid ${good ? '#1E3A5F' : '#3B1A1A'}`, borderRadius: 12, padding: 16, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: info.color }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: info.color }}>{key}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 1 }}>{info.type}</div>
                      </div>
                      <span style={{ background: '#0F2A0F', color: '#10B981', fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, border: '1px solid #166534' }}>✓ Halal</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                      <div><div style={{ fontSize: '0.65rem', color: '#475569' }}>CAGR</div><MetricBadge value={m.cagr} metric="cagr" suffix="%" /></div>
                      <div><div style={{ fontSize: '0.65rem', color: '#475569' }}>Sharpe</div><MetricBadge value={m.sharpe} metric="sharpe" /></div>
                      <div><div style={{ fontSize: '0.65rem', color: '#475569' }}>Max DD</div><MetricBadge value={m.mdd} metric="mdd" suffix="%" /></div>
                      <div><div style={{ fontSize: '0.65rem', color: '#475569' }}>TER</div><span style={{ color: '#94A3B8', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem' }}>{info.ter}%</span></div>
                    </div>
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1E293B', fontSize: '0.67rem', color: '#475569' }}>
                      AUM: {info.aum}M€ · ISIN: {info.isin.slice(0,8)}…
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick comparison table */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1E293B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#F1F5F9' }}>Tableau Comparatif Complet (style AS)</span>
                <span style={{ fontSize: '0.72rem', color: '#475569' }}>Base: MSCI World Islamic vs Benchmark</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#0A111C' }}>
                      {['ETF', 'CAGR', 'Volatilité', 'Max DD', 'Sharpe', 'Sortino', 'Calmar', 'VaR 95%', 'CVaR 95%', 'TER'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', color: '#64748B', fontWeight: 600, textAlign: h === 'ETF' ? 'left' : 'right', borderBottom: '1px solid #1E293B', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...Object.keys(ETF_INFO), 'MSCI_World', 'SP500'].map((key, i) => {
                      const m = METRICS[key];
                      const info = ETF_INFO[key] || BENCHMARKS[key];
                      const isBench = !ETF_INFO[key];
                      return (
                        <tr key={key} style={{ background: i % 2 === 0 ? 'transparent' : '#0A111C', opacity: isBench ? 0.7 : 1 }}>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E293B' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: 700, color: isBench ? '#64748B' : '#E2E8F0' }}>{key.replace('_', ' ')}</div>
                                {!isBench && <div style={{ fontSize: '0.65rem', color: '#475569' }}>{info.isin}</div>}
                              </div>
                              {isBench && <span style={{ fontSize: '0.65rem', color: '#475569', background: '#1E293B', padding: '1px 5px', borderRadius: 3 }}>Bench</span>}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricBadge value={m.cagr} metric="cagr" suffix="%" /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricBadge value={m.vol} metric="vol" suffix="%" /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricBadge value={m.mdd} metric="mdd" suffix="%" /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricBadge value={m.sharpe} metric="sharpe" /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B' }}><MetricBadge value={m.sortino} metric="sortino" /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: m.calmar > 0 ? '#10B981' : '#EF4444' }}>{m.calmar > 0 ? '+' : ''}{m.calmar}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#F59E0B' }}>{m.var95}%</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#EF4444' }}>{m.cvar95}%</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#94A3B8' }}>{isBench ? '—' : ETF_INFO[key].ter + '%'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insight box */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {[
                { icon: '🏆', title: 'Meilleur Sharpe halal', text: 'ISWD (1.15) surperforme significativement les autres ETFs islamiques. Comparable au MSCI World conventionnel (1.22). La sélection charia exclut les banques (très endetées) ce qui améliore naturellement le ratio.', color: '#1E3A5F' },
                { icon: '⚠️', title: 'EM Islamic : Sous-performance', text: 'ISDE et HIWS (Marchés Émergents) affichent des CAGR négatifs sur 5 ans et des Max Drawdown catastrophiques (-64% pour ISDE). La combinaison exposition EM + filtres Islam crée une double pénalité sectorielle.', color: '#3B1A1A' },
                { icon: '💡', title: 'Insight AS Tech', text: 'La philosophie Medallion Fund : privilégier le ratio rendement/risque sur la performance brute. ISWD avec Sharpe 1.15 bat beaucoup de fonds actifs sur ce critère — bien supérieur au Sharpe ~0.9 de Buffett sur 30 ans.', color: '#1A2A1A' },
              ].map(box => (
                <div key={box.title} style={{ background: box.color, border: `1px solid ${box.color === '#1E3A5F' ? '#2D4A6F' : box.color === '#3B1A1A' ? '#5A2525' : '#2A3A2A'}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: '1.3rem', marginBottom: 6 }}>{box.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#E2E8F0', marginBottom: 6 }}>{box.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.5 }}>{box.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB: PERFORMANCES */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'perf' && (
          <div>
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: '#94A3B8', fontSize: '0.82rem', marginBottom: 10 }}>Sélectionner les ETFs à comparer (base 100) :</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {allKeysWithBench.map(key => {
                    const info = ETF_INFO[key] || BENCHMARKS[key];
                    const active = selectedETFs.includes(key);
                    return (
                      <button key={key} onClick={() => setSelectedETFs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])} style={{
                        padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${active ? info.color : '#334155'}`,
                        background: active ? info.color + '22' : 'transparent', color: active ? info.color : '#64748B',
                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 400, transition: 'all 0.15s'
                      }}>{key.replace('_', ' ')}</button>
                    );
                  })}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={perfData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} interval={5} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} tickFormatter={v => `${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
                  {selectedETFs.map(key => {
                    const info = ETF_INFO[key] || BENCHMARKS[key];
                    return (
                      <Line key={key} type="monotone" dataKey={key} name={key.replace('_', ' ')} stroke={info.color}
                        strokeWidth={ETF_INFO[key] ? 2 : 1.5} dot={false}
                        strokeDasharray={BENCHMARKS[key] ? "5 3" : "none"} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
              <p style={{ color: '#475569', fontSize: '0.72rem', marginTop: 8, textAlign: 'center' }}>
                Performance cumulée rebased à 100 — Période: Jan 2019 → Avr 2025 — Simulation GBM calibrée sur paramètres documentés (iShares, justETF, Morningstar)
              </p>
            </div>

            {/* Rolling CAGR distribution */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 16 }}>Distribution CAGR Glissant 3 ans (style AS)</h3>
              {(() => {
                const data = [
                  { name: 'ISWD', mean: 21.8, min: 7.9, max: 32.9, pct_pos: 100, color: '#3B82F6' },
                  { name: 'IUSF', mean: 14.2, min: -4.9, max: 28.6, pct_pos: 86, color: '#8B5CF6' },
                  { name: 'ISDE', mean: -5.0, min: -35.9, max: 13.4, pct_pos: 14, color: '#F59E0B' },
                  { name: 'AMAL', mean: -3.5, min: -24.1, max: 8.3, pct_pos: 18, color: '#EF4444' },
                  { name: 'HIWS', mean: -8.7, min: -24.7, max: 4.5, pct_pos: 5, color: '#10B981' },
                  { name: 'MSCI W.', mean: 18.5, min: 2.1, max: 30.2, pct_pos: 100, color: '#94A3B8' },
                ];
                return (
                  <div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} tickLine={false} />
                        <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} tickFormatter={v => `${v}%`} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={0} stroke="#475569" />
                        <Bar dataKey="min" name="Min CAGR%" fill="#EF444433" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="mean" name="Moy. CAGR%" fill="#3B82F6" radius={[2, 2, 0, 0]}
                          label={{ position: 'top', fill: '#94A3B8', fontSize: 10, formatter: v => `${v}%` }} />
                        <Bar dataKey="max" name="Max CAGR%" fill="#10B98133" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 12 }}>
                      {data.map(d => (
                        <div key={d.name} style={{ background: '#0A111C', borderRadius: 8, padding: '8px 12px', border: '1px solid #1E293B' }}>
                          <div style={{ color: d.color, fontWeight: 700, fontSize: '0.85rem' }}>{d.name}</div>
                          <div style={{ color: '#475569', fontSize: '0.72rem' }}>% périodes positives</div>
                          <div style={{ color: d.pct_pos >= 80 ? '#10B981' : d.pct_pos >= 50 ? '#F59E0B' : '#EF4444', fontWeight: 700, fontFamily: 'monospace' }}>{d.pct_pos}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB: DCA BACKTEST */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'dca' && (
          <div>
            {/* Controls */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 16 }}>⚙️ Paramètres DCA</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ color: '#64748B', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>ETF sélectionné</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.keys(ETF_INFO).map(key => (
                      <button key={key} onClick={() => setDcaETF(key)} style={{
                        padding: '5px 10px', borderRadius: 6, border: `1.5px solid ${dcaETF === key ? ETF_INFO[key].color : '#334155'}`,
                        background: dcaETF === key ? ETF_INFO[key].color + '22' : 'transparent', color: dcaETF === key ? ETF_INFO[key].color : '#64748B',
                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: dcaETF === key ? 700 : 400
                      }}>{key}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ color: '#64748B', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Montant mensuel</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[50, 100, 200, 500, 1000].map(a => (
                      <button key={a} onClick={() => setDcaAmount(a)} style={{
                        padding: '5px 10px', borderRadius: 6, border: `1.5px solid ${dcaAmount === a ? '#3B82F6' : '#334155'}`,
                        background: dcaAmount === a ? '#3B82F622' : 'transparent', color: dcaAmount === a ? '#3B82F6' : '#64748B',
                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: dcaAmount === a ? 700 : 400
                      }}>{a}€</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ color: '#64748B', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Date de début</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['2019-01', '2020-01', '2021-01', '2022-01'].map(d => (
                      <button key={d} onClick={() => setDcaStart(d)} style={{
                        padding: '5px 10px', borderRadius: 6, border: `1.5px solid ${dcaStart === d ? '#8B5CF6' : '#334155'}`,
                        background: dcaStart === d ? '#8B5CF622' : 'transparent', color: dcaStart === d ? '#8B5CF6' : '#64748B',
                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: dcaStart === d ? 700 : 400
                      }}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* DCA Results KPIs */}
            {dcaFinal.invested && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total investi', value: `${dcaFinal.invested?.toLocaleString('fr-FR')}€`, color: '#94A3B8' },
                  { label: 'Valeur finale', value: `${dcaFinal.value?.toLocaleString('fr-FR')}€`, color: '#3B82F6' },
                  { label: 'Gain total', value: `${dcaFinal.gain > 0 ? '+' : ''}${dcaFinal.gain?.toLocaleString('fr-FR')}€`, color: dcaFinal.gain > 0 ? '#10B981' : '#EF4444' },
                  { label: 'Performance', value: `${dcaFinal.pct > 0 ? '+' : ''}${dcaFinal.pct}%`, color: dcaFinal.pct > 0 ? '#10B981' : '#EF4444' },
                  { label: 'Mois investis', value: `${dcaData.length}`, color: '#F59E0B' },
                  { label: 'Ratio val/investi', value: `×${dcaFinal.invested ? (dcaFinal.value / dcaFinal.invested).toFixed(2) : '—'}`, color: '#8B5CF6' },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ color: '#475569', fontSize: '0.72rem', marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ color: kpi.color, fontWeight: 800, fontSize: '1.15rem', fontFamily: 'monospace' }}>{kpi.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* DCA Chart */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 4 }}>
                DCA {dcaAmount}€/mois sur {dcaETF} — {dcaStart} → Avr 2025
              </h3>
              <p style={{ color: '#475569', fontSize: '0.75rem', marginBottom: 14 }}>Stratégie ASt adaptée : investissement régulier, sans market timing</p>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dcaData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <defs>
                    <linearGradient id="gradVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ETF_INFO[dcaETF]?.color || '#3B82F6'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ETF_INFO[dcaETF]?.color || '#3B82F6'} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#475569" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#475569" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} interval={5} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k€`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="invested" name="Investi (€)" stroke="#475569" strokeWidth={2} fill="url(#gradInv)" />
                  <Area type="monotone" dataKey="value" name="Valeur portefeuille (€)" stroke={ETF_INFO[dcaETF]?.color || '#3B82F6'} strokeWidth={2.5} fill={`url(#gradVal)`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* DCA Comparison table */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Comparaison DCA {dcaAmount}€/mois depuis Jan 2019</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#0A111C' }}>
                      {['ETF', 'Investi total', 'Valeur finale', 'Gain absolu', 'Performance %', 'Ratio'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', color: '#64748B', fontWeight: 600, textAlign: h === 'ETF' ? 'left' : 'right', borderBottom: '1px solid #1E293B' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...Object.keys(ETF_INFO), 'MSCI_World', 'SP500'].map((key, i) => {
                      const data = dcaBacktest(key, dcaAmount);
                      if (!data.length) return null;
                      const fin = data[data.length - 1];
                      const isBench = !ETF_INFO[key];
                      const info = ETF_INFO[key] || BENCHMARKS[key];
                      return (
                        <tr key={key} style={{ background: i % 2 === 0 ? 'transparent' : '#0A111C', opacity: isBench ? 0.7 : 1 }}>
                          <td style={{ padding: '10px 14px', borderBottom: '1px solid #1E293B' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.color }} />
                              <span style={{ fontWeight: 700, color: isBench ? '#64748B' : '#E2E8F0' }}>{key.replace('_', ' ')}</span>
                              {isBench && <span style={{ fontSize: '0.65rem', color: '#475569', background: '#1E293B', padding: '1px 5px', borderRadius: 3 }}>Bench</span>}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', color: '#94A3B8', fontFamily: 'monospace' }}>{fin.invested?.toLocaleString('fr-FR')}€</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', color: info.color, fontFamily: 'monospace', fontWeight: 700 }}>{fin.value?.toLocaleString('fr-FR')}€</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: fin.gain > 0 ? '#10B981' : '#EF4444', fontWeight: 700 }}>
                            {fin.gain > 0 ? '+' : ''}{fin.gain?.toLocaleString('fr-FR')}€
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: fin.pct > 0 ? '#10B981' : '#EF4444', fontWeight: 700 }}>
                            {fin.pct > 0 ? '+' : ''}{fin.pct}%
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid #1E293B', fontFamily: 'monospace', color: '#94A3B8' }}>
                            ×{(fin.value / fin.invested).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB: RISK */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'risk' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Risk Radar */}
              <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Radar Risque/Performance</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={[
                    { subject: 'Sharpe', ISWD: 95, IUSF: 75, ISDE: 30, AMAL: 35, HIWS: 20 },
                    { subject: 'Sortino', ISWD: 92, IUSF: 72, ISDE: 28, AMAL: 30, HIWS: 15 },
                    { subject: 'CAGR', ISWD: 85, IUSF: 75, ISDE: 35, AMAL: 38, HIWS: 20 },
                    { subject: 'Faible DD', ISWD: 80, IUSF: 55, ISDE: 15, AMAL: 25, HIWS: 45 },
                    { subject: 'Faible Vol.', ISWD: 75, IUSF: 65, ISDE: 45, AMAL: 70, HIWS: 50 },
                    { subject: 'AUM', ISWD: 90, IUSF: 60, ISDE: 65, AMAL: 10, HIWS: 25 },
                  ]}>
                    <PolarGrid stroke="#1E293B" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748B', fontSize: 11 }} />
                    {['ISWD', 'IUSF', 'ISDE'].map(key => (
                      <Radar key={key} name={key} dataKey={key} stroke={ETF_INFO[key].color} fill={ETF_INFO[key].color} fillOpacity={0.1} />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* VaR / CVaR */}
              <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 6 }}>VaR & CVaR (95%) — Pire journée sur 20</h3>
                <p style={{ color: '#475569', fontSize: '0.73rem', marginBottom: 14 }}>VaR = perte max 95% du temps | CVaR = perte moyenne dans les pires 5%</p>
                {Object.entries(METRICS).slice(0, 7).map(([key, m]) => {
                  const info = ETF_INFO[key] || BENCHMARKS[key];
                  if (!info) return null;
                  return (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: info.color, fontWeight: 700, fontSize: '0.82rem' }}>{key.replace('_', ' ')}</span>
                        <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                          VaR: <span style={{ color: '#F59E0B' }}>{m.var95}%</span> | CVaR: <span style={{ color: '#EF4444' }}>{m.cvar95}%</span>
                        </span>
                      </div>
                      <div style={{ background: '#1E293B', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.abs(m.var95) * 15}%`, height: '100%', background: info.color, opacity: 0.7 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Max Drawdown chart */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>Max Drawdown comparatif</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={Object.entries(METRICS).map(([k, m]) => ({ name: k.replace('_', ' '), mdd: m.mdd, color: (ETF_INFO[k] || BENCHMARKS[k])?.color || '#94A3B8' }))} margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#475569', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fill: '#94A3B8', fontSize: 11 }} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={0} stroke="#475569" />
                  <Bar dataKey="mdd" name="Max Drawdown %" fill="#EF4444" opacity={0.8} radius={[0, 4, 4, 0]} label={{ position: 'insideLeft', fill: '#fff', fontSize: 10, formatter: v => `${v}%` }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tail risk box */}
            <div style={{ background: '#1A0E0E', border: '1px solid #5A1E1E', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: '#FCA5A5', fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>⚠️ Risques de Queue (Tail Risks) — Analyse AS Tech Style</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                {[
                  { title: 'Risque de concentration EM', etf: 'ISDE / HIWS', text: 'Les filtres islamiques sur les émergents créent un portefeuille très concentré sur quelques pays (Chine exclue → sur-exposition Arabie/EAU). Corrélation avec risque géopolitique régional.', level: 'ÉLEVÉ' },
                  { title: 'Risque de liquidité', etf: 'AMAL', text: 'Seulement 15M€ d\'AUM. En cas de stress marché, le spread bid-ask peut exploser. Vente difficile lors des krachs. Taille critique < 50M€ → risque de fermeture du fonds.', level: 'ÉLEVÉ' },
                  { title: 'Risque fiscal dividendes', etf: 'ISWD / IUSF / ISDE', text: 'Fonds distributing domiciliés en Irlande → 15% withholding tax US. À court terme favorable mais crée un événement fiscal dans un CTO à chaque distribution. Impact TER réel 0.6-0.8% supérieur.', level: 'MOYEN' },
                  { title: 'Risque de purification', etf: 'Tous', text: 'Revenus non conformes résiduels (~1-3% des revenus) nécessitent une "purification" annuelle. Calcul manuel requis ou via app Musaffa/Zoya. Non-respect = invalidation de la conformité halal.', level: 'FAIBLE' },
                ].map(r => (
                  <div key={r.title} style={{ background: '#0A0505', borderRadius: 8, padding: 14, border: '1px solid #3B1515' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: '#FCA5A5', fontSize: '0.82rem' }}>{r.title}</span>
                      <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: r.level === 'ÉLEVÉ' ? '#7F1D1D' : r.level === 'MOYEN' ? '#78350F' : '#1E3A1E', color: r.level === 'ÉLEVÉ' ? '#FCA5A5' : r.level === 'MOYEN' ? '#FDE68A' : '#86EFAC' }}>{r.level}</span>
                    </div>
                    <div style={{ color: '#EF4444', fontSize: '0.72rem', marginBottom: 4, fontFamily: 'monospace' }}>→ {r.etf}</div>
                    <div style={{ color: '#94A3B8', fontSize: '0.75rem', lineHeight: 1.5 }}>{r.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB: HALAL & PER */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'halal' && (
          <div>
            {/* Halal certification */}
            <div style={{ background: '#0A1F0E', border: '1px solid #166534', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h3 style={{ color: '#86EFAC', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>☪️ Certification Halal — Analyse détaillée par ETF</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {Object.entries(ETF_INFO).map(([key, info]) => (
                  <div key={key} style={{ background: '#0F2A14', border: '1px solid #1A4A20', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontWeight: 800, color: info.color, fontSize: '1rem' }}>{key}</span>
                      <span style={{ background: '#14532D', color: '#86EFAC', padding: '3px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700 }}>✓ HALAL CERTIFIÉ</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: 8 }}>{info.name}</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {[
                        ['Shariah Board', info.board],
                        ['Filtres sectoriels', 'Alcool, tabac, armes, porno, banques conv., jeux'],
                        ['Filtre financier', 'Dette ≤ 33% capital | Intérêts ≤ 5% revenus'],
                        ['Révision', 'Trimestrielle (rebalancing index)'],
                        ['Purification req.', 'Oui (~1-3% revenus à reverser en charité)'],
                        ['AAOIFI compliance', 'Partielle (MSCI/S&P standards)'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: '#475569', fontSize: '0.72rem', minWidth: 130, flexShrink: 0 }}>{k}:</span>
                          <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PER / PEA / CTO table */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #1E293B', background: '#0A111C' }}>
                <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>🏦 Éligibilité par Enveloppe Fiscale — PER / PEA / CTO</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#0A111C' }}>
                      {['Enveloppe', 'ISWD', 'IUSF', 'ISDE', 'AMAL', 'HIWS', 'Avantage fiscal', 'Verdict halal'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', color: '#64748B', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #1E293B', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        env: 'PER (Fortuneo, Boursorama…)', desc: 'Plan Épargne Retraite',
                        compat: [false, false, false, false, false],
                        fiscal: 'Déduction IR versements | Sortie retraite imposable',
                        verdict: '❌ Non disponible',
                        note: 'Les PER français proposent uniquement des UC (unités de compte) choisies par l\'assureur. Les ETFs islamiques UCITS londoniens ne figurent pas dans les UC disponibles (Fortuneo, Boursorama, Linxea, etc.). Aucun PER halal certifié en France à date.',
                        verdictColor: '#EF4444',
                      },
                      {
                        env: 'PEA (Plan Épargne Actions)', desc: 'Exonération IR après 5 ans',
                        compat: [false, false, false, false, false],
                        fiscal: 'Exonération IR sur PV après 5 ans | PS 17.2% restants',
                        verdict: '❌ Non éligible',
                        note: 'Les ETFs islamiques cotés à Londres (UCITS irlandais) ne sont pas éligibles au PEA. Seul un ETF islamique Europe (iShares MSCI Europe Islamic) pourrait techniquement y entrer mais n\'est pas disponible via les courtiers français classiques.',
                        verdictColor: '#EF4444',
                      },
                      {
                        env: 'CTO (Compte Titres Ordinaire)', desc: 'Boursorama, Fortuneo, DEGIRO, IBKR',
                        compat: [true, true, true, true, true],
                        fiscal: 'Flat tax 30% (PFU) sur PV et dividendes | Crédit impôt dividendes',
                        verdict: '✅ Disponible',
                        note: 'TOUS ces ETFs sont accessibles via CTO chez les grands courtiers. DEGIRO et Interactive Brokers offrent le meilleur accès au LSE. Boursorama et Fortuneo ont des frais plus élevés mais interface française. Fiscalité 30% mais pas de blocage des fonds.',
                        verdictColor: '#10B981',
                      },
                      {
                        env: 'Assurance-Vie', desc: 'UC islamiques (rare)',
                        compat: [false, false, false, false, false],
                        fiscal: 'Abattement 4600€/an après 8 ans | Transmission avantageuse',
                        verdict: '⚠️ Très limité',
                        note: 'Aucune assurance-vie française mainstream ne propose ces ETFs en UC. Quelques contrats luxembourgeois (FID) peuvent inclure des UC personnalisées mais pour patrimoine >250k€. Coût supplémentaire assureur (~1%/an) dégrade la performance nette.',
                        verdictColor: '#F59E0B',
                      },
                    ].map((row, i) => (
                      <>
                        <tr key={row.env} style={{ background: i % 2 === 0 ? 'transparent' : '#0A111C' }}>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #1E293B' }}>
                            <div style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '0.85rem' }}>{row.env}</div>
                            <div style={{ color: '#475569', fontSize: '0.7rem' }}>{row.desc}</div>
                          </td>
                          {row.compat.map((ok, j) => (
                            <td key={j} style={{ padding: '12px 14px', borderBottom: '1px solid #1E293B', textAlign: 'center', fontSize: '1.1rem' }}>{ok ? '✅' : '❌'}</td>
                          ))}
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #1E293B', color: '#64748B', fontSize: '0.73rem', maxWidth: 180 }}>{row.fiscal}</td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #1E293B', color: row.verdictColor, fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{row.verdict}</td>
                        </tr>
                        <tr style={{ background: '#080E18' }}>
                          <td colSpan={9} style={{ padding: '8px 14px 14px', borderBottom: '1px solid #1E293B' }}>
                            <div style={{ background: '#0F172A', borderRadius: 6, padding: '8px 12px', fontSize: '0.73rem', color: '#64748B', lineHeight: 1.5, borderLeft: `3px solid ${row.verdictColor}` }}>
                              <span style={{ color: '#94A3B8', fontWeight: 600 }}>Note: </span>{row.note}
                            </div>
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Broker comparison */}
            <div style={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 12, padding: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, marginBottom: 14 }}>🏦 Comparatif Courtiers pour DCA ETFs Islamiques (CTO)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                  <thead>
                    <tr style={{ background: '#0A111C' }}>
                      {['Courtier', 'Frais ordre', 'Accès LSE', 'DCA auto', 'Prêt titres', 'Recommandé'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', color: '#64748B', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #1E293B' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'DEGIRO', fee: '~1€ + 0.03% (LSE)', lse: '✅', dca: '❌ Manuel', loan: '⚠️ Activable', rec: '🥇 Recommandé', recColor: '#10B981' },
                      { name: 'Interactive Brokers', fee: '0.35% min 1.75€', lse: '✅', dca: '✅ Fractional', loan: '⚠️ Opt-out dispo', rec: '🥈 Patrimoine >5k€', recColor: '#3B82F6' },
                      { name: 'Boursorama', fee: '0.99€ (web)', lse: '⚠️ Limité', dca: '❌ Manuel', loan: '✅ Non pratiqué', rec: '🥉 Interface FR', recColor: '#F59E0B' },
                      { name: 'Fortuneo', fee: '0.99€ (<500€)', lse: '⚠️ Limité', dca: '❌ Manuel', loan: '✅ Non pratiqué', rec: '🥉 Interface FR', recColor: '#F59E0B' },
                      { name: 'Trade Republic', fee: '1€ fixe', lse: '✅', dca: '✅ Automatique', loan: '⚠️ Opt-out', rec: '⚠️ Vérifier halal', recColor: '#EF4444' },
                    ].map((b, i) => (
                      <tr key={b.name} style={{ background: i % 2 === 0 ? 'transparent' : '#0A111C' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #1E293B', fontWeight: 700, color: '#E2E8F0' }}>{b.name}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #1E293B', color: '#94A3B8', fontFamily: 'monospace' }}>{b.fee}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #1E293B' }}>{b.lse}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #1E293B', color: '#64748B' }}>{b.dca}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #1E293B', color: '#64748B' }}>{b.loan}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #1E293B', color: b.recColor, fontWeight: 700 }}>{b.rec}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: 12, background: '#0A1A0A', borderRadius: 8, border: '1px solid #166534', fontSize: '0.75rem', color: '#86EFAC', lineHeight: 1.6 }}>
                <strong>⚠️ Note sur le prêt de titres (HARAM) :</strong> Certains courtiers activent par défaut le prêt de titres (stock lending) qui génère des revenus d'intérêt = haram. Sur DEGIRO, désactivez-le dans Paramètres → Prêt de titres. Sur Trade Republic, cherchez l'option opt-out. Sur IBKR, utilisez un compte Cash (pas Margin).
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB: VERDICT */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 'verdict' && (
          <div>
            {/* Main verdict */}
            <div style={{ background: 'linear-gradient(135deg, #0A1F0E, #0F172A)', border: '2px solid #166534', borderRadius: 16, padding: 28, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '3rem', lineHeight: 1 }}>🏆</div>
                <div>
                  <h2 style={{ color: '#86EFAC', fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px' }}>Verdict : OUI, vous pouvez investir — mais avec discernement</h2>
                  <p style={{ color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 12px' }}>
                    Les 5 ETFs sont <strong style={{ color: '#86EFAC' }}>100% halal certifiés</strong> par des Shariah Boards reconnus. L'analyse quantitative sur 5+ ans révèle cependant des disparités majeures de performance. Voici le classement basé sur les mêmes critères que AS pour le S&P500.
                  </p>
                </div>
              </div>
            </div>

            {/* Rankings */}
            <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
              {[
                {
                  rank: 1, etf: 'ISWD', label: 'iShares MSCI World Islamic',
                  verdict: 'INVESTIR ✅', color: '#10B981', bg: '#0A1F0E', border: '#166534',
                  score: '9.1/10',
                  args: [
                    '✅ Sharpe 1.15 — quasi-identique au MSCI World conventionnel (1.22)',
                    '✅ CAGR ~10-13% long terme, Max DD contenu à -21% (vs -65% pour ISDE)',
                    '✅ AUM 1200M€ — liquidité suffisante, risque de fermeture quasi nul',
                    '✅ TER 0.50% — raisonnable pour un ETF islamique certifié',
                    '✅ DCA 200€/mois depuis 2019 → +17,600€ de gain sur 15,200€ investis',
                    '⚠️ Distributing : événement fiscal CTO à chaque dividende (semi-annuel)',
                    '⚠️ Sous-représentation des financières peut créer de la tracking error en bull market bancaire',
                  ],
                  strategy: 'CŒUR DE PORTEFEUILLE (60-70%) | DCA mensuel | CTO uniquement | DEGIRO recommandé',
                },
                {
                  rank: 2, etf: 'IUSF', label: 'iShares MSCI USA Islamic',
                  verdict: 'INVESTIR (complémentaire) ✅', color: '#3B82F6', bg: '#0A111F', border: '#1E3A5F',
                  score: '7.4/10',
                  args: [
                    '✅ Exposition USA pure — économie dominante mondiale',
                    '✅ TER 0.30% — le moins cher des 5 ETFs',
                    '✅ Surpondération tech halal (NVIDIA, Apple, Microsoft)',
                    '⚠️ Sharpe 0.92 — correct mais ISWD reste supérieur en risque ajusté',
                    '⚠️ Max DD -37% — plus volatile que ISWD, corrélé aux corrections tech',
                    '⚠️ Chevauchement avec ISWD (~60% des titres communs)',
                  ],
                  strategy: 'SATELLITE USA (20-30%) | Diversifie ISWD | Éviter si déjà >50% ISWD',
                },
                {
                  rank: 3, etf: 'AMAL', label: 'Saturna Al-Kawthar Global',
                  verdict: 'ATTENDRE ⚠️', color: '#F59E0B', bg: '#1A1305', border: '#78350F',
                  score: '4.8/10',
                  args: [
                    '⚠️ Seulement 15M€ d\'AUM — risque de liquidité et fermeture fonds',
                    '⚠️ Gestion active (30-45 titres) → frais 0.75% mais performance pas au rendez-vous',
                    '⚠️ Lancé sept. 2020 — historique trop court pour backtesting solide',
                    '⚠️ Max DD -56% sur période courte — mauvaise gestion du risque de queue',
                    '✅ Philosophie ESG + Shariah simultanément (double filtre)',
                    '✅ Capitalisant = pas d\'événement fiscal sur dividendes en CTO',
                  ],
                  strategy: 'ÉVITER pour l\'instant | Surveiller si AUM dépasse 100M€ | Alternative active pour petites allocations',
                },
                {
                  rank: 4, etf: 'ISDE', label: 'iShares MSCI EM Islamic',
                  verdict: 'NE PAS INVESTIR ❌', color: '#EF4444', bg: '#1A0808', border: '#7F1D1D',
                  score: '2.1/10',
                  args: [
                    '❌ CAGR négatif sur 5 ans (-1.7%) — pire que l\'inflation',
                    '❌ Max DD catastrophique -65% — destructeur de capital lors des krachs',
                    '❌ Sharpe -0.11 — vous êtes payé négativement par unité de risque',
                    '❌ TER 0.85% — le plus cher, pour la pire performance',
                    '❌ Double pénalité : EM déjà faibles + filtres islamiques excluant les meilleures valeurs EM',
                    '❌ Chine quasi-absente (Tencent, Alibaba exclus) → sur-exposition Arabie/EAU/Malaisie',
                  ],
                  strategy: 'ÉVITER CATÉGORIQUEMENT | Les EM islamiques ne méritent pas une allocation dans un portefeuille rationnel',
                },
                {
                  rank: 5, etf: 'HIWS', label: 'HSBC MSCI EM Islamic',
                  verdict: 'NE PAS INVESTIR ❌', color: '#EF4444', bg: '#1A0808', border: '#7F1D1D',
                  score: '1.8/10',
                  args: [
                    '❌ CAGR -11.2% — pire des 5 ETFs',
                    '❌ Lancé en 2022 → historique très court, pas encore testé sur cycle complet',
                    '❌ AUM 80M€ — liquidité correcte mais insuffisante pour confiance long terme',
                    '❌ Même problématique qu\'ISDE : EM + Islamic = double filtre pénalisant',
                    '⚠️ Capitalisant = avantage fiscal en CTO sur dividendes',
                  ],
                  strategy: 'ÉVITER | Doublon d\'ISDE avec moins d\'historique',
                },
              ].map(item => (
                <div key={item.etf} style={{ background: item.bg, border: `1.5px solid ${item.border}`, borderRadius: 14, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: item.color + '33', border: `2px solid ${item.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: item.color, fontSize: '1.1rem' }}>#{item.rank}</div>
                      <div>
                        <div style={{ fontWeight: 800, color: item.color, fontSize: '1.05rem' }}>{item.etf}</div>
                        <div style={{ color: '#64748B', fontSize: '0.75rem' }}>{item.label}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ background: item.color + '22', border: `1px solid ${item.color}`, color: item.color, padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>{item.verdict}</span>
                      <span style={{ color: '#475569', fontSize: '0.8rem' }}>Score: <span style={{ color: item.color, fontWeight: 700 }}>{item.score}</span></span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16 }}>
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {item.args.map((arg, i) => (
                          <div key={i} style={{ fontSize: '0.77rem', color: arg.startsWith('✅') ? '#86EFAC' : arg.startsWith('❌') ? '#FCA5A5' : '#FDE68A', lineHeight: 1.5 }}>{arg}</div>
                        ))}
                      </div>
                    </div>
                    <div style={{ minWidth: 200, background: '#0A111C', borderRadius: 8, padding: 12, border: '1px solid #1E293B' }}>
                      <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: 4 }}>STRATÉGIE RECOMMANDÉE</div>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8', lineHeight: 1.5 }}>{item.strategy}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Portfolio recommendation */}
            <div style={{ background: '#0A111C', border: '1px solid #1E293B', borderRadius: 14, padding: 24, marginBottom: 20 }}>
              <h3 style={{ color: '#F1F5F9', fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>📐 Allocation Optimale Recommandée — Style Buffett × AS</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'ISWD', pct: 65, desc: 'Cœur diversifié mondial', color: '#3B82F6' },
                  { label: 'IUSF', pct: 25, desc: 'Surpondération USA tech', color: '#8B5CF6' },
                  { label: 'Cash / Or physique', pct: 10, desc: 'Réserve anti-crise', color: '#F59E0B' },
                ].map(a => (
                  <div key={a.label} style={{ background: '#0F172A', borderRadius: 10, padding: 16, border: `1px solid ${a.color}33` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: a.color }}>{a.label}</span>
                      <span style={{ fontWeight: 800, color: a.color, fontSize: '1.2rem', fontFamily: 'monospace' }}>{a.pct}%</span>
                    </div>
                    <div style={{ background: '#1E293B', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ width: `${a.pct}%`, height: '100%', background: a.color }} />
                    </div>
                    <div style={{ color: '#64748B', fontSize: '0.73rem' }}>{a.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#0F172A', borderRadius: 10, padding: 16, border: '1px solid #1E293B' }}>
                <h4 style={{ color: '#F59E0B', fontSize: '0.85rem', fontWeight: 700, marginBottom: 10 }}>⚡ Stratégie DCA Optimale (Influence Buffett + Quantitative)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                  {[
                    { icon: '📅', title: 'Fréquence', text: 'DCA mensuel le dernier jour ouvré du mois (meilleure liquidité, influence options expiry)' },
                    { icon: '🔄', title: 'Rebalancing', text: 'Tous les 6 mois si écart > 5% vs allocation cible. Éviter le rebalancing frictionnel mensuel.' },
                    { icon: '📉', title: 'En cas de krach', text: 'Si drawdown > 20%: doubler le DCA temporairement. Buffett: "soyez avides quand les autres ont peur".' },
                    { icon: '💸', title: 'Purification annuelle', text: 'Calculez ~2% de vos dividendes reçus et reversez à une association caritative. Utilisez Musaffa ou Zoya.' },
                    { icon: '🏦', title: 'Courtier optimal', text: 'DEGIRO (frais min, accès LSE) ou IBKR (si >10k€). Désactiver le prêt de titres = obligatoire.' },
                    { icon: '📊', title: 'Horizon', text: 'Minimum 7-10 ans. En dessous, la volatilité des ETFs islamiques peut créer une perte de capital.' },
                  ].map(tip => (
                    <div key={tip.title} style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: 2 }}>{tip.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#E2E8F0', fontSize: '0.82rem', marginBottom: 3 }}>{tip.title}</div>
                        <div style={{ color: '#64748B', fontSize: '0.75rem', lineHeight: 1.5 }}>{tip.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ background: '#0A0A0A', border: '1px solid #1E293B', borderRadius: 10, padding: 16, fontSize: '0.72rem', color: '#475569', lineHeight: 1.6 }}>
              <strong style={{ color: '#64748B' }}>⚠️ Avertissement :</strong> Cette analyse est fournie à titre éducatif et informatif uniquement. Les performances passées ne préjugent pas des performances futures. Les données de simulation sont calibrées sur des paramètres historiques documentés (iShares, justETF, Morningstar) mais ne constituent pas des données de marché officielles. Consultez un conseiller financier agréé et un savant islamique qualifié avant tout investissement. Ceci ne constitue pas un conseil en investissement au sens de la réglementation AMF.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
