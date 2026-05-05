import type { PortfolioResult } from '../types'

export function exportToPDF(portfolios: PortfolioResult[], title = 'Analyse ETF Halal') {
  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', sans-serif; background: #fff; color: #1a1a2e; padding: 32px; }
      h1 { font-size: 1.8rem; color: #1e3a5f; border-bottom: 3px solid #3B82F6; padding-bottom: 12px; margin-bottom: 24px; }
      h2 { font-size: 1.2rem; color: #1e3a5f; margin: 20px 0 10px; border-left: 4px solid #3B82F6; padding-left: 10px; }
      h3 { font-size: 1rem; color: #374151; margin: 14px 0 8px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.85rem; }
      th { background: #1e3a5f; color: #fff; padding: 8px 12px; text-align: left; }
      td { padding: 7px 12px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) { background: #f8fafc; }
      .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
      .metric-box { background: #f0f4ff; border-radius: 8px; padding: 12px; text-align: center; }
      .metric-val { font-size: 1.3rem; font-weight: 800; color: #1e3a5f; }
      .metric-lab { font-size: 0.72rem; color: #6b7280; margin-top: 4px; }
      .green { color: #059669; } .red { color: #dc2626; } .amber { color: #d97706; }
      .halal-badge { background: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; }
      .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 0.72rem; color: #9ca3af; }
      @media print { body { padding: 16px; } }
    </style>
  `

  const colorClass = (v: number, metric: string) => {
    if (metric === 'cagr') return v > 10 ? 'green' : v > 0 ? 'amber' : 'red'
    if (metric === 'sharpe') return v > 1 ? 'green' : v > 0 ? 'amber' : 'red'
    if (metric === 'mdd') return v > -25 ? 'green' : v > -40 ? 'amber' : 'red'
    return ''
  }

  const portfolioHTML = portfolios.map(p => {
    const m = p.portfolio_metrics
    const dca = p.portfolio_dca.summary
    const allocs = Object.entries(p.allocations).map(([k, v]) => `${k}: ${v}%`).join(' | ')
    return `
      <div style="page-break-inside: avoid; margin-bottom: 32px;">
        <h2>${p.name}</h2>
        <p style="color: #6b7280; font-size: 0.82rem; margin-bottom: 12px;">Allocation: ${allocs}</p>
        <h3>Métriques de Performance</h3>
        <div class="metric-grid">
          <div class="metric-box"><div class="metric-val ${colorClass(m.cagr, 'cagr')}">${m.cagr > 0 ? '+' : ''}${m.cagr}%</div><div class="metric-lab">CAGR</div></div>
          <div class="metric-box"><div class="metric-val ${colorClass(m.sharpe, 'sharpe')}">${m.sharpe}</div><div class="metric-lab">Sharpe Ratio</div></div>
          <div class="metric-box"><div class="metric-val ${colorClass(m.max_drawdown, 'mdd')}">${m.max_drawdown}%</div><div class="metric-lab">Max Drawdown</div></div>
          <div class="metric-box"><div class="metric-val">${m.volatility}%</div><div class="metric-lab">Volatilité</div></div>
          <div class="metric-box"><div class="metric-val">${m.sortino}</div><div class="metric-lab">Sortino</div></div>
          <div class="metric-box"><div class="metric-val">${m.calmar}</div><div class="metric-lab">Calmar</div></div>
          <div class="metric-box"><div class="metric-val red">${m.var_95}%</div><div class="metric-lab">VaR 95%</div></div>
          <div class="metric-box"><div class="metric-val red">${m.cvar_95}%</div><div class="metric-lab">CVaR 95%</div></div>
        </div>
        <h3>Résultat DCA ${dca.n_months} mois</h3>
        <table>
          <tr><th>Investi total</th><th>Valeur finale</th><th>Gain</th><th>Performance</th><th>Multiplicateur</th></tr>
          <tr>
            <td>${dca.total_invested.toLocaleString('fr-FR')}€</td>
            <td class="${dca.final_value > dca.total_invested ? 'green' : 'red'}">${dca.final_value.toLocaleString('fr-FR')}€</td>
            <td class="${dca.total_gain > 0 ? 'green' : 'red'}">${dca.total_gain > 0 ? '+' : ''}${dca.total_gain.toLocaleString('fr-FR')}€</td>
            <td class="${dca.total_return_pct > 0 ? 'green' : 'red'}">${dca.total_return_pct > 0 ? '+' : ''}${dca.total_return_pct}%</td>
            <td>×${dca.multiplier}</td>
          </tr>
        </table>
        <h3>ETFs composants</h3>
        <table>
          <tr><th>ETF</th><th>Allocation</th><th>CAGR</th><th>Sharpe</th><th>Max DD</th><th>Sortino</th></tr>
          ${Object.entries(p.individual).map(([k, v]) => `
            <tr>
              <td><strong>${k}</strong></td>
              <td>${v.allocation}%</td>
              <td class="${colorClass(v.metrics.cagr, 'cagr')}">${v.metrics.cagr > 0 ? '+' : ''}${v.metrics.cagr}%</td>
              <td class="${colorClass(v.metrics.sharpe, 'sharpe')}">${v.metrics.sharpe}</td>
              <td class="${colorClass(v.metrics.max_drawdown, 'mdd')}">${v.metrics.max_drawdown}%</td>
              <td>${v.metrics.sortino}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `
  }).join('')

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8">${styles}</head>
    <body>
      <h1>☪️ ${title}</h1>
      <p style="color: #6b7280; margin-bottom: 24px; font-size: 0.85rem;">
        Généré le ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })} · 
        Analyse quantitative style Ploovers · Données via yfinance
      </p>
      ${portfolioHTML}
      <div class="footer">
        ⚠️ Ce document est fourni à titre informatif uniquement. Il ne constitue pas un conseil en investissement financier (AMF). 
        Les performances passées ne préjugent pas des performances futures. Consultez un conseiller financier agréé.
      </div>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => {
    win.focus()
    win.print()
  }
}
