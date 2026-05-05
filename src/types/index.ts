export interface ETFInfo {
  ticker: string
  name: string
  isin: string
  ter: number
  halal: boolean
  board: string | null
}

export interface Metrics {
  cagr: number
  volatility: number
  max_drawdown: number
  sharpe: number
  sortino: number
  calmar: number
  var_95: number
  cvar_95: number
  total_return: number
  last_price: number | null
  rolling_1y: { date: string; return: number }[]
}

export interface DCASummary {
  total_invested: number
  final_value: number
  total_gain: number
  total_return_pct: number
  n_months: number
  multiplier: number
}

export interface DCARecord {
  date: string
  invested: number
  value: number
  gain: number
  pct: number
}

export interface ETFCompareResult {
  info: ETFInfo
  metrics: Metrics
  normalized: { dates: string[]; prices: number[] }
  source: string
}

export interface Portfolio {
  id: string
  name: string
  allocations: Record<string, number>
  monthly_dca: number
  period: string
  color: string
}

export interface PortfolioResult {
  name: string
  allocations: Record<string, number>
  portfolio_metrics: Metrics
  portfolio_dca: { records: DCARecord[]; summary: DCASummary }
  individual: Record<string, { metrics: Metrics; dca: DCASummary; allocation: number }>
  chart: { dates: string[]; prices: number[] }
}

export interface LivePrice {
  price: number | null
  change_pct: number | null
  source: string
}

export type Period = '1y' | '2y' | '3y' | '5y'
export type TabId = 'overview' | 'compare' | 'dca' | 'portfolio' | 'risk' | 'halal' | 'verdict'
