import { useState, useEffect, useCallback } from 'react'
import type { ETFCompareResult, PortfolioResult, Portfolio, LivePrice, Period } from '../types'

const BASE = '/api'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

// ─── Live Prices ──────────────────────────────────────────────────────────────
export function useLivePrices(refreshMs = 30000) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({})
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, LivePrice>>(`${BASE}/live`)
      setPrices(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetch_()
    const interval = setInterval(fetch_, refreshMs)
    return () => clearInterval(interval)
  }, [fetch_, refreshMs])

  return { prices, loading, refresh: fetch_ }
}

// ─── Compare ETFs ────────────────────────────────────────────────────────────
export function useCompare(etfs: string[], period: Period) {
  const [data, setData] = useState<Record<string, ETFCompareResult>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!etfs.length) return
    setLoading(true)
    setError(null)
    apiFetch<Record<string, ETFCompareResult>>(
      `${BASE}/compare?etfs=${etfs.join(',')}&period=${period}`
    )
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [etfs.join(','), period])

  return { data, loading, error }
}

// ─── DCA Backtest ────────────────────────────────────────────────────────────
export function useDCA(etf: string, monthly: number, period: Period) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!etf) return
    setLoading(true)
    apiFetch<any>(`${BASE}/dca?etf=${etf}&monthly=${monthly}&period=${period}`, { method: 'POST' })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [etf, monthly, period])

  return { data, loading }
}

// ─── Portfolio Analysis ───────────────────────────────────────────────────────
export function usePortfolioAnalysis() {
  const [results, setResults] = useState<Record<string, PortfolioResult>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  const analyze = useCallback(async (portfolio: Portfolio) => {
    setLoading(prev => ({ ...prev, [portfolio.id]: true }))
    try {
      const result = await apiFetch<PortfolioResult>(`${BASE}/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: portfolio.name,
          allocations: portfolio.allocations,
          monthly_dca: portfolio.monthly_dca,
          period: portfolio.period,
        }),
      })
      setResults(prev => ({ ...prev, [portfolio.id]: result }))
    } catch (e) { console.error(e) }
    finally { setLoading(prev => ({ ...prev, [portfolio.id]: false })) }
  }, [])

  return { results, loading, analyze }
}

// ─── Rolling CAGR ────────────────────────────────────────────────────────────
export function useRolling(etf: string, windowYears: number, period: Period) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!etf) return
    setLoading(true)
    apiFetch<any>(`${BASE}/rolling/${etf}?window_years=${windowYears}&period=${period}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [etf, windowYears, period])

  return { data, loading }
}
