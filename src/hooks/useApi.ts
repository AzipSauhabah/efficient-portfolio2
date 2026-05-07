import { useState, useEffect, useCallback, useRef } from 'react'
import type { ETFCompareResult, PortfolioResult, Portfolio, LivePrice, Period } from '../types'

const BASE = '/api'

// ─── Core fetch ──────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ─── Registry ────────────────────────────────────────────────────────────────
export function useRegistry() {
  const [registry, setRegistry] = useState<Record<string, any>>({})
  const [loading, setLoading]   = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ registry: Record<string, any> }>(`${BASE}/registry`)
      setRegistry(data.registry || {})
    } catch (e) {
      console.error('Registry load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { registry, loading, refresh }
}

// ─── Live Prices ──────────────────────────────────────────────────────────────
export function useLivePrices(refreshMs = 60000) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, LivePrice>>(`${BASE}/live`)
      setPrices(data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
      console.error('Live prices failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const interval = setInterval(fetch_, refreshMs)
    return () => clearInterval(interval)
  }, [fetch_, refreshMs])

  return { prices, loading, error, refresh: fetch_ }
}

// ─── Compare ETFs ────────────────────────────────────────────────────────────
export function useCompare(keys: string[], period: Period) {
  const [data, setData]     = useState<Record<string, ETFCompareResult>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const prevKeyStr = useRef('')

  useEffect(() => {
    if (!keys.length) return
    const keyStr = keys.slice().sort().join(',') + period
    // Avoid duplicate fetches
    if (keyStr === prevKeyStr.current) return
    prevKeyStr.current = keyStr

    setLoading(true)
    setError(null)
    apiFetch<Record<string, ETFCompareResult>>(
      `${BASE}/compare?keys=${keys.join(',')}&period=${period}`
    )
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false); console.error('Compare failed:', e) })
  }, [keys.slice().sort().join(','), period])

  return { data, loading, error }
}

// ─── DCA Backtest — fixed: POST with JSON body ────────────────────────────────
export function useDCA(etf: string, monthly: number, period: Period) {
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!etf) return
    setLoading(true)
    setData(null)
    apiFetch<any>(`${BASE}/dca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: etf, monthly_amount: monthly, period, variant: 'classic' }),
    })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error('DCA failed:', e); setLoading(false) })
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
          name:         portfolio.name,
          allocations:  portfolio.allocations,
          monthly_dca:  portfolio.monthly_dca,
          period:       portfolio.period,
        }),
      })
      setResults(prev => ({ ...prev, [portfolio.id]: result }))
    } catch (e) {
      console.error('Portfolio analysis failed:', e)
    } finally {
      setLoading(prev => ({ ...prev, [portfolio.id]: false }))
    }
  }, [])

  return { results, loading, analyze }
}

// ─── Rolling CAGR ────────────────────────────────────────────────────────────
export function useRolling(etf: string, windowYears: number, period: Period) {
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!etf) return
    setLoading(true)
    apiFetch<any>(`${BASE}/rolling/${etf}?window_years=${windowYears}&period=${period}`)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { console.error('Rolling failed:', e); setLoading(false) })
  }, [etf, windowYears, period])

  return { data, loading }
}
