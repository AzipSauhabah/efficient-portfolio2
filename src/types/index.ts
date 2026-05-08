export interface LivePrice {
  price: number | null
  change_pct: number | null
  source: string
  currency?: string
}
export interface ETFCompareResult {
  info: Record<string, any>
  metrics: Record<string, any>
  signals: Record<string, any>
  normalized: { dates: string[]; prices: number[] }
  source: string
}
export interface PortfolioResult {
  name: string
  allocations: Record<string, number>
  portfolio_metrics: Record<string, any>
  portfolio_dca: any
  individual: Record<string, any>
  chart: { dates: string[]; prices: number[] }
}
export interface Portfolio {
  id: string
  name: string
  allocations: Record<string, number>
  monthly_dca: number
  period: string
  color: string
}
export type Period = '1y' | '2y' | '3y' | '5y'
export type TabId = 'discover' | 'analyze' | 'simulate' | 'build' | 'verdict' | 'settings'
