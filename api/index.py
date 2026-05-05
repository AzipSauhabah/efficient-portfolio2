from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json

app = FastAPI(title="Halal ETF Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── ETF Registry ─────────────────────────────────────────────────────────────
ETF_REGISTRY = {
    "ISWD": {"ticker": "ISWD.L", "name": "iShares MSCI World Islamic", "isin": "IE00B27YCN58", "ter": 0.50, "halal": True, "board": "MSCI Shariah"},
    "IUSF": {"ticker": "IUSF.L", "name": "iShares MSCI USA Islamic",   "isin": "IE00B296QM64", "ter": 0.30, "halal": True, "board": "MSCI Shariah"},
    "ISDE": {"ticker": "ISDE.L", "name": "iShares MSCI EM Islamic",    "isin": "IE00B27YCP72", "ter": 0.85, "halal": True, "board": "MSCI Shariah"},
    "AMAL": {"ticker": "AMAL.L", "name": "Saturna Al-Kawthar",         "isin": "IE00BMYMHS24", "ter": 0.75, "halal": True, "board": "Saturna Capital SB"},
    "HIWS": {"ticker": "HIWS.L", "name": "HSBC MSCI EM Islamic",       "isin": "IE0009BC6K22", "ter": 0.60, "halal": True, "board": "HSBC Shariah SB"},
    "IWDA": {"ticker": "IWDA.L", "name": "MSCI World (Benchmark)",     "isin": "IE00B4L5Y983", "ter": 0.20, "halal": False, "board": None},
    "CSPX": {"ticker": "CSPX.L", "name": "S&P 500 (Benchmark)",        "isin": "IE00B5BMR087", "ter": 0.07, "halal": False, "board": None},
}

# ─── Helpers ──────────────────────────────────────────────────────────────────
def fetch_prices(tickers: list[str], period: str = "5y") -> dict:
    """Fetch prices from Yahoo Finance, fallback to simulation if blocked"""
    results = {}
    for ticker_key in tickers:
        info = ETF_REGISTRY.get(ticker_key, {})
        yt = info.get("ticker", ticker_key)
        try:
            data = yf.download(yt, period=period, auto_adjust=True, progress=False)
            if len(data) > 50:
                close = data["Close"].dropna()
                results[ticker_key] = {
                    "dates": [d.strftime("%Y-%m-%d") for d in close.index],
                    "prices": [round(float(v), 4) for v in close.values],
                    "source": "live"
                }
                continue
        except Exception:
            pass
        # Fallback: simulated GBM with realistic params
        results[ticker_key] = simulate_prices(ticker_key, period)
    return results

def simulate_prices(key: str, period: str = "5y") -> dict:
    """GBM simulation calibrated on documented ETF parameters"""
    params = {
        "ISWD": (0.109, 0.158), "IUSF": (0.141, 0.178), "ISDE": (0.042, 0.208),
        "AMAL": (0.112, 0.172), "HIWS": (0.055, 0.195),
        "IWDA": (0.132, 0.155), "CSPX": (0.151, 0.178),
    }
    mu, sigma = params.get(key, (0.08, 0.18))
    years = {"1y": 1, "2y": 2, "3y": 3, "5y": 5, "10y": 10}.get(period, 5)
    np.random.seed(hash(key) % 10000)
    n = years * 252
    end = datetime.now()
    start = end - timedelta(days=years * 365)
    dates = pd.bdate_range(start=start, end=end)[:n]
    dr, dv = mu / 252, sigma / np.sqrt(252)
    shocks = np.random.normal(dr, dv, len(dates))
    # Inject realistic events
    for i, d in enumerate(dates):
        if d.year == 2020 and d.month in [2, 3]:
            shocks[i] -= 0.015
        elif d.year == 2020 and d.month in [4, 5, 6]:
            shocks[i] += 0.008
        if d.year == 2022 and d.month <= 9:
            shocks[i] -= 0.002
    prices = 100 * np.exp(np.cumsum(shocks))
    return {
        "dates": [d.strftime("%Y-%m-%d") for d in dates],
        "prices": [round(float(p), 4) for p in prices],
        "source": "simulated"
    }

def compute_metrics(prices: list[float], dates: list[str], rf: float = 0.03) -> dict:
    """Full quant metrics: CAGR, Sharpe, Sortino, Calmar, VaR, CVaR, Beta"""
    s = pd.Series(prices, index=pd.to_datetime(dates))
    ret = s.pct_change().dropna()
    n_years = (s.index[-1] - s.index[0]).days / 365.25
    cagr = float((s.iloc[-1] / s.iloc[0]) ** (1 / n_years) - 1) if n_years > 0 else 0
    vol = float(ret.std() * np.sqrt(252))
    roll_max = s.cummax()
    mdd = float(((s - roll_max) / roll_max).min())
    sharpe = float((ret.mean() - rf / 252) / ret.std() * np.sqrt(252)) if ret.std() > 0 else 0
    downside = ret[ret < 0].std()
    sortino = float((ret.mean() - rf / 252) / downside * np.sqrt(252)) if downside > 0 else 0
    calmar = float(cagr / abs(mdd)) if mdd != 0 else 0
    var95 = float(np.percentile(ret, 5))
    cvar95 = float(ret[ret <= np.percentile(ret, 5)].mean())
    # Rolling returns
    rolling_1y = []
    for i in range(252, len(s), 21):
        sub = s.iloc[i-252:i+1]
        ny = (sub.index[-1] - sub.index[0]).days / 365.25
        r = float((sub.iloc[-1] / sub.iloc[0]) ** (1/ny) - 1) if ny > 0 else 0
        rolling_1y.append({"date": sub.index[-1].strftime("%Y-%m"), "return": round(r * 100, 2)})
    return {
        "cagr": round(cagr * 100, 2),
        "volatility": round(vol * 100, 2),
        "max_drawdown": round(mdd * 100, 2),
        "sharpe": round(sharpe, 3),
        "sortino": round(sortino, 3),
        "calmar": round(calmar, 3),
        "var_95": round(var95 * 100, 3),
        "cvar_95": round(cvar95 * 100, 3),
        "total_return": round(float(s.iloc[-1] / s.iloc[0] - 1) * 100, 2),
        "last_price": round(float(s.iloc[-1]), 4),
        "rolling_1y": rolling_1y[-36:],
    }

def dca_backtest(prices: list[float], dates: list[str], monthly: float = 200) -> dict:
    """DCA backtest with monthly investment"""
    s = pd.Series(prices, index=pd.to_datetime(dates))
    monthly_s = s.resample("ME").last().dropna()
    units, invested = 0.0, 0.0
    records = []
    for date, price in monthly_s.items():
        units += monthly / price
        invested += monthly
        val = units * price
        records.append({
            "date": date.strftime("%Y-%m"),
            "invested": round(invested, 2),
            "value": round(val, 2),
            "gain": round(val - invested, 2),
            "pct": round((val - invested) / invested * 100, 1)
        })
    final = records[-1] if records else {}
    return {
        "records": records,
        "summary": {
            "total_invested": final.get("invested", 0),
            "final_value": final.get("value", 0),
            "total_gain": final.get("gain", 0),
            "total_return_pct": final.get("pct", 0),
            "n_months": len(records),
            "multiplier": round(final.get("value", 0) / final.get("invested", 1), 2),
        }
    }

# ─── Models ───────────────────────────────────────────────────────────────────
class PortfolioRequest(BaseModel):
    name: str
    allocations: dict[str, float]  # {"ISWD": 65, "IUSF": 35}
    monthly_dca: float = 200
    period: str = "5y"

class AlertRequest(BaseModel):
    etf: str
    threshold_pct: float
    direction: str  # "above" | "below"
    email: Optional[str] = None

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "version": "1.0", "endpoints": ["/api/etfs", "/api/metrics/{etf}", "/api/dca", "/api/portfolio", "/api/live"]}

@app.get("/api/etfs")
def get_etfs():
    """List all available ETFs"""
    return {"etfs": ETF_REGISTRY}

@app.get("/api/live")
def get_live_prices():
    """Get latest prices for all ETFs"""
    result = {}
    for key, info in ETF_REGISTRY.items():
        try:
            t = yf.Ticker(info["ticker"])
            hist = t.history(period="5d")
            if len(hist) > 0:
                last = hist["Close"].iloc[-1]
                prev = hist["Close"].iloc[-2] if len(hist) > 1 else last
                result[key] = {
                    "price": round(float(last), 4),
                    "change_pct": round(float((last - prev) / prev * 100), 2),
                    "currency": "USD",
                    "source": "live"
                }
            else:
                raise ValueError("No data")
        except Exception:
            result[key] = {"price": None, "change_pct": None, "source": "unavailable"}
    return result

@app.get("/api/metrics/{etf}")
def get_metrics(etf: str, period: str = "5y"):
    """Full quant metrics for one ETF"""
    if etf not in ETF_REGISTRY:
        raise HTTPException(status_code=404, detail=f"ETF {etf} not found")
    price_data = fetch_prices([etf], period)[etf]
    metrics = compute_metrics(price_data["prices"], price_data["dates"])
    return {
        "etf": etf,
        "info": ETF_REGISTRY[etf],
        "metrics": metrics,
        "price_data": {
            "dates": price_data["dates"][::5],   # downsample for perf
            "prices": price_data["prices"][::5],
            "source": price_data["source"]
        }
    }

@app.get("/api/compare")
def compare_etfs(etfs: str = "ISWD,IUSF,ISDE", period: str = "5y"):
    """Compare multiple ETFs"""
    keys = [k.strip() for k in etfs.split(",") if k.strip() in ETF_REGISTRY]
    if not keys:
        raise HTTPException(status_code=400, detail="No valid ETF keys provided")
    price_data = fetch_prices(keys, period)
    result = {}
    for key in keys:
        pd_data = price_data[key]
        metrics = compute_metrics(pd_data["prices"], pd_data["dates"])
        # Normalize to 100
        base = pd_data["prices"][0]
        normalized = [round(p / base * 100, 2) for p in pd_data["prices"]]
        result[key] = {
            "info": ETF_REGISTRY[key],
            "metrics": metrics,
            "normalized": {"dates": pd_data["dates"][::5], "prices": normalized[::5]},
            "source": pd_data["source"]
        }
    return result

@app.post("/api/dca")
def run_dca(etf: str, monthly: float = 200, period: str = "5y"):
    """DCA backtest for one ETF"""
    if etf not in ETF_REGISTRY:
        raise HTTPException(status_code=404, detail=f"ETF {etf} not found")
    price_data = fetch_prices([etf], period)[etf]
    result = dca_backtest(price_data["prices"], price_data["dates"], monthly)
    return {"etf": etf, "monthly": monthly, "period": period, **result}

@app.post("/api/portfolio")
def analyze_portfolio(req: PortfolioRequest):
    """Analyze a multi-ETF portfolio with custom allocations"""
    total_alloc = sum(req.allocations.values())
    if abs(total_alloc - 100) > 1:
        raise HTTPException(status_code=400, detail=f"Allocations must sum to 100 (got {total_alloc})")
    keys = list(req.allocations.keys())
    price_data = fetch_prices(keys, req.period)
    # Build portfolio series
    portfolio_series = None
    individual = {}
    for key, alloc in req.allocations.items():
        pd_data = price_data[key]
        s = pd.Series(pd_data["prices"], index=pd.to_datetime(pd_data["dates"]))
        s_norm = s / s.iloc[0] * (alloc / 100)
        individual[key] = {
            "metrics": compute_metrics(pd_data["prices"], pd_data["dates"]),
            "dca": dca_backtest(pd_data["prices"], pd_data["dates"], req.monthly_dca * alloc / 100)["summary"],
            "allocation": alloc,
        }
        portfolio_series = s_norm if portfolio_series is None else portfolio_series.add(s_norm, fill_value=0)
    # Portfolio-level metrics
    port_prices = portfolio_series.values.tolist()
    port_dates = [d.strftime("%Y-%m-%d") for d in portfolio_series.index]
    port_metrics = compute_metrics(port_prices, port_dates)
    port_dca = dca_backtest(port_prices, port_dates, req.monthly_dca)
    # Normalized
    base = port_prices[0]
    normalized = [round(p / base * 100, 2) for p in port_prices]
    return {
        "name": req.name,
        "allocations": req.allocations,
        "portfolio_metrics": port_metrics,
        "portfolio_dca": port_dca,
        "individual": individual,
        "chart": {"dates": port_dates[::5], "prices": normalized[::5]},
    }

@app.get("/api/rolling/{etf}")
def get_rolling(etf: str, window_years: int = 3, period: str = "5y"):
    """Rolling CAGR distribution"""
    if etf not in ETF_REGISTRY:
        raise HTTPException(status_code=404, detail=f"ETF {etf} not found")
    pd_data = fetch_prices([etf], period)[etf]
    s = pd.Series(pd_data["prices"], index=pd.to_datetime(pd_data["dates"]))
    window = window_years * 252
    results = []
    for i in range(window, len(s), 21):
        sub = s.iloc[i-window:i+1]
        ny = (sub.index[-1] - sub.index[0]).days / 365.25
        r = float((sub.iloc[-1] / sub.iloc[0]) ** (1/ny) - 1) * 100 if ny > 0 else 0
        results.append({"date": sub.index[-1].strftime("%Y-%m"), "cagr": round(r, 2)})
    if not results:
        return {"etf": etf, "window_years": window_years, "data": [], "stats": {}}
    cagrs = [r["cagr"] for r in results]
    return {
        "etf": etf,
        "window_years": window_years,
        "data": results,
        "stats": {
            "mean": round(float(np.mean(cagrs)), 2),
            "min": round(float(np.min(cagrs)), 2),
            "max": round(float(np.max(cagrs)), 2),
            "pct_positive": round(float(np.mean([c > 0 for c in cagrs]) * 100), 1),
            "p5": round(float(np.percentile(cagrs, 5)), 2),
            "p95": round(float(np.percentile(cagrs, 95)), 2),
        }
    }
