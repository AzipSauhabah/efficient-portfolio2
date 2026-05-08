"""
Halal ETF Analytics API v4
──────────────────────────
Bloomberg-style · 6-tab UX · Smart cache · Multi-source data · Free AI agent
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from scipy import stats, optimize
from scipy.stats import skew, kurtosis, jarque_bera
from collections import Counter
import warnings, httpx, asyncio, json, os, time
warnings.filterwarnings("ignore")

app = FastAPI(title="Halal ETF API v4")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ═══════════════════════════════════════════════════════════════════════
# SMART CACHE (in-memory, TTL=1h, survives warm lambda invocations)
# ═══════════════════════════════════════════════════════════════════════
class SmartCache:
    def __init__(self, ttl_seconds=3600):
        self._store: dict = {}
        self._ttl = ttl_seconds

    def get(self, key: str):
        if key in self._store:
            val, ts = self._store[key]
            if time.time() - ts < self._ttl:
                return val
            del self._store[key]
        return None

    def set(self, key: str, value):
        self._store[key] = (value, time.time())

    def age(self, key: str) -> Optional[int]:
        if key in self._store:
            return int(time.time() - self._store[key][1])
        return None

    def stats(self) -> dict:
        return {k: {"age_s": int(time.time()-v[1]), "bytes": len(str(v[0]))}
                for k, v in self._store.items()}

CACHE = SmartCache(ttl_seconds=3600)

# ═══════════════════════════════════════════════════════════════════════
# REGISTRY + AUTO-DETECT
# ═══════════════════════════════════════════════════════════════════════
_REGISTRY: dict = {
    "ISWD": {"ticker":"ISWD.L","name":"iShares MSCI World Islamic","isin":"IE00B27YCN58","ter":0.50,"halal":True,"board":"MSCI Shariah","region":"World","base_price":7.82,"currency":"GBP","category":"halal"},
    "IUSF": {"ticker":"IUSF.L","name":"iShares MSCI USA Islamic","isin":"IE00B296QM64","ter":0.30,"halal":True,"board":"MSCI Shariah","region":"USA","base_price":9.14,"currency":"GBP","category":"halal"},
    "ISDE": {"ticker":"ISDE.L","name":"iShares MSCI EM Islamic","isin":"IE00B27YCP72","ter":0.85,"halal":True,"board":"MSCI Shariah","region":"EM","base_price":4.23,"currency":"GBP","category":"halal"},
    "AMAL": {"ticker":"AMAL.L","name":"Saturna Al-Kawthar","isin":"IE00BMYMHS24","ter":0.75,"halal":True,"board":"Saturna Capital SB","region":"Global","base_price":8.56,"currency":"GBP","category":"halal"},
    "HIWS": {"ticker":"HIWS.L","name":"HSBC MSCI EM Islamic","isin":"IE0009BC6K22","ter":0.60,"halal":True,"board":"HSBC Shariah SB","region":"EM","base_price":5.11,"currency":"GBP","category":"halal"},
    "IWDA": {"ticker":"IWDA.L","name":"MSCI World (Benchmark)","isin":"IE00B4L5Y983","ter":0.20,"halal":False,"board":None,"region":"World","base_price":97.30,"currency":"USD","category":"benchmark"},
    "CSPX": {"ticker":"CSPX.L","name":"S&P 500 (Benchmark)","isin":"IE00B5BMR087","ter":0.07,"halal":False,"board":None,"region":"USA","base_price":555.20,"currency":"USD","category":"benchmark"},
    "GLD":  {"ticker":"GLD","name":"SPDR Gold Shares","isin":"US78463V1070","ter":0.40,"halal":True,"board":"Physical Gold","region":"Global","base_price":227.40,"currency":"USD","category":"commodity"},
}

_GBM_PARAMS: dict = {
    "ISWD":(0.109,0.158),"IUSF":(0.141,0.178),"ISDE":(0.042,0.208),
    "AMAL":(0.112,0.172),"HIWS":(0.055,0.195),"IWDA":(0.132,0.155),
    "CSPX":(0.151,0.178),"GLD":(0.070,0.145),
}

_KNOWN_TICKERS: dict = {
    "ISWD":("ISWD.L","iShares MSCI World Islamic",True),
    "IUSF":("IUSF.L","iShares MSCI USA Islamic",True),
    "ISDE":("ISDE.L","iShares MSCI EM Islamic",True),
    "AMAL":("AMAL.L","Saturna Al-Kawthar",True),
    "HIWS":("HIWS.L","HSBC MSCI EM Islamic",True),
    "IWDA":("IWDA.L","MSCI World Benchmark",False),
    "CSPX":("CSPX.L","S&P 500 Benchmark",False),
    "GLD": ("GLD","SPDR Gold Shares",False),
    "AAPL":("AAPL","Apple Inc.",False),
    "MSFT":("MSFT","Microsoft Corp.",False),
    "NVDA":("NVDA","NVIDIA Corp.",False),
    "GOOGL":("GOOGL","Alphabet Inc.",False),
    "AMZN":("AMZN","Amazon.com Inc.",False),
    "SPY": ("SPY","S&P 500 ETF",False),
    "QQQ": ("QQQ","Nasdaq 100 ETF",False),
    "VTI": ("VTI","Total Stock Market ETF",False),
    "BTC": ("BTC-USD","Bitcoin",False),
    "ETH": ("ETH-USD","Ethereum",False),
}

def auto_detect(symbol: str) -> dict:
    """Given 'AAPL' or 'iswd', auto-detect ticker, name, halal status"""
    s = symbol.strip().upper().replace(" ","")
    if s in _KNOWN_TICKERS:
        t, n, h = _KNOWN_TICKERS[s]
        return {"ticker":t,"name":n,"halal":h,"confidence":"high","key":s}
    # Heuristic: already has suffix
    if "." in s:
        return {"ticker":s,"name":s.split(".")[0],"halal":False,"confidence":"medium","key":s.split(".")[0]}
    if "-USD" in s or "-EUR" in s:
        return {"ticker":s,"name":s.split("-")[0],"halal":False,"confidence":"medium","key":s.split("-")[0]}
    # Try to fetch name from yfinance
    try:
        t = yf.Ticker(s)
        info = t.info
        name = info.get("longName") or info.get("shortName") or s
        return {"ticker":s,"name":name,"halal":False,"confidence":"medium","key":s}
    except:
        return {"ticker":s,"name":s,"halal":False,"confidence":"low","key":s}

# ═══════════════════════════════════════════════════════════════════════
# MULTI-SOURCE PRICE ENGINE
# ═══════════════════════════════════════════════════════════════════════
def _simulate(key: str, period: str = "5y") -> dict:
    mu, sigma = _GBM_PARAMS.get(key, (0.08, 0.18))
    reg = _REGISTRY.get(key, {})
    if reg.get("gbm_mu"): mu = reg["gbm_mu"]
    if reg.get("gbm_sigma"): sigma = reg["gbm_sigma"]
    years = {"1y":1,"2y":2,"3y":3,"5y":5,"10y":10}.get(period, 5)
    np.random.seed(hash(key) % 99991)
    end = datetime.now()
    dates = pd.bdate_range(end - timedelta(days=int(years*365.25)), end)
    n = len(dates)
    sh = np.random.normal(mu/252, sigma/np.sqrt(252), n)
    for i, d in enumerate(dates):
        if d.year==2020 and d.month in [2,3]: sh[i] -= 0.015
        elif d.year==2020 and d.month in [4,5,6]: sh[i] += 0.008
        if d.year==2022 and 1<=d.month<=9: sh[i] -= 0.002
        if d.year==2025 and d.month==4 and d.day<=10: sh[i] -= 0.008
    prices = 100 * np.exp(np.cumsum(sh))
    return {"dates":[d.strftime("%Y-%m-%d") for d in dates],
            "prices":[round(float(p),4) for p in prices],"source":"estimated"}

def _fetch_stooq(ticker: str, period: str = "5y") -> Optional[dict]:
    """Try Stooq as free alternative to Yahoo Finance"""
    stooq_sym = ticker.lower().replace(".l",".uk").replace("-",".")
    years = {"1y":1,"2y":2,"3y":3,"5y":5,"10y":10}.get(period, 5)
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=int(years*365.25))
    url = (f"https://stooq.com/q/d/l/?s={stooq_sym}"
           f"&d1={start_dt.strftime('%Y%m%d')}&d2={end_dt.strftime('%Y%m%d')}&i=d")
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        resp = urllib.request.urlopen(req, timeout=8)
        raw = resp.read().decode('utf-8').strip()
        lines = [l for l in raw.split('\n') if l and 'Date' not in l and 'No data' not in l]
        if len(lines) < 30: return None
        dates, prices = [], []
        for line in lines:
            parts = line.split(',')
            if len(parts) >= 5:
                try:
                    dates.append(parts[0])
                    prices.append(float(parts[4]))  # Close price
                except: continue
        if len(dates) < 30: return None
        return {"dates":dates,"prices":[round(p,4) for p in prices],"source":"stooq"}
    except: return None

def fetch_prices(keys: list, period: str = "5y") -> dict:
    results = {}
    for key in keys:
        cache_key = f"{key}_{period}"
        cached = CACHE.get(cache_key)
        if cached:
            results[key] = cached
            continue

        info = _REGISTRY.get(key, {})
        yt = info.get("ticker", key)

        # Source 1: yfinance
        try:
            raw = yf.download(yt, period=period, auto_adjust=True, progress=False, timeout=8)
            if isinstance(raw.columns, pd.MultiIndex):
                raw.columns = raw.columns.droplevel(1)
            close = raw["Close"].dropna()
            if len(close) > 50:
                entry = {"dates":[d.strftime("%Y-%m-%d") for d in close.index],
                         "prices":[round(float(v),4) for v in close.values],
                         "source":"live"}
                CACHE.set(cache_key, entry)
                results[key] = entry
                continue
        except: pass

        # Source 2: Stooq
        stooq = _fetch_stooq(yt, period)
        if stooq:
            CACHE.set(cache_key, stooq)
            results[key] = stooq
            continue

        # Source 3: GBM simulation (instant, labeled "estimated")
        sim = _simulate(key, period)
        CACHE.set(cache_key, sim)
        results[key] = sim

    return results

def get_live_price(key: str) -> dict:
    cache_key = f"live_{key}"
    cached = CACHE.get(cache_key)
    if cached: return cached

    info = _REGISTRY.get(key, {})
    yt = info.get("ticker", key)
    base = info.get("base_price", 100.0)

    # Try yfinance
    try:
        t = yf.Ticker(yt)
        h = t.history(period="5d")
        if len(h) > 1:
            last, prev = float(h["Close"].iloc[-1]), float(h["Close"].iloc[-2])
            result = {"price":round(last,4),"change_pct":round((last-prev)/prev*100,2),
                      "currency":info.get("currency","USD"),"source":"live"}
            CACHE.set(cache_key, result)
            return result
    except: pass

    # Try download fallback
    try:
        raw = yf.download(yt, period="5d", auto_adjust=True, progress=False, timeout=5)
        if isinstance(raw.columns, pd.MultiIndex): raw.columns = raw.columns.droplevel(1)
        close = raw["Close"].dropna()
        if len(close) >= 2:
            last, prev = float(close.iloc[-1]), float(close.iloc[-2])
            result = {"price":round(last,4),"change_pct":round((last-prev)/prev*100,2),
                      "currency":info.get("currency","USD"),"source":"live"}
            CACHE.set(cache_key, result)
            return result
    except: pass

    # GBM daily step from known base price
    mu, sigma = _GBM_PARAMS.get(key, (0.08, 0.18))
    seed = int(datetime.now().strftime("%Y%m%d")) + hash(key) % 1000
    np.random.seed(seed % 99999)
    daily_ret = np.random.normal(mu/252, sigma/np.sqrt(252))
    price = round(base * (1 + daily_ret), 4)
    result = {"price":price,"change_pct":round(daily_ret*100,2),
              "currency":info.get("currency","USD"),"source":"estimated"}
    # Cache live for only 5 min
    CACHE._store[cache_key] = (result, time.time() - 3300)  # 5min TTL
    return result

def to_series(pd_data: dict) -> pd.Series:
    return pd.Series(pd_data["prices"], index=pd.to_datetime(pd_data["dates"]))

# ═══════════════════════════════════════════════════════════════════════
# QUANT METRICS (20+)
# ═══════════════════════════════════════════════════════════════════════
def compute_metrics(prices: list, dates: list, rf: float = 0.03) -> dict:
    s = pd.Series(prices, index=pd.to_datetime(dates)).dropna()
    if len(s) < 10: return {}
    ret = s.pct_change().dropna(); ann = 252
    n_years = max((s.index[-1]-s.index[0]).days/365.25, 0.01)
    cagr = float((s.iloc[-1]/s.iloc[0])**(1/n_years)-1)
    vol = float(ret.std()*np.sqrt(ann))
    roll_max = s.cummax(); dd_s = (s-roll_max)/roll_max; mdd = float(dd_s.min())
    excess = ret - rf/ann
    sharpe = float(excess.mean()/ret.std()*np.sqrt(ann)) if ret.std()>0 else 0
    down = ret[ret<0]
    sortino = float(excess.mean()/down.std()*np.sqrt(ann)) if len(down)>1 and down.std()>0 else 0
    calmar = float(cagr/abs(mdd)) if mdd!=0 else 0
    var95 = float(np.percentile(ret,5)); cvar95 = float(ret[ret<=var95].mean())
    gains = ret[ret>rf/ann]-rf/ann; losses = rf/ann-ret[ret<=rf/ann]
    omega = float(gains.sum()/losses.sum()) if losses.sum()>0 else 99
    ulcer = float(np.sqrt(np.mean(dd_s.values**2)))
    lp = np.log(s.values); x = np.arange(len(lp)); _,_,rv,_,_ = stats.linregress(x,lp)
    autocorr = float(ret.autocorr(lag=1))
    rolling_1y = []
    for i in range(ann, len(s), 21):
        sub = s.iloc[i-ann:i+1]; ny = (sub.index[-1]-sub.index[0]).days/365.25
        r = float((sub.iloc[-1]/sub.iloc[0])**(1/ny)-1)*100 if ny>0 else 0
        rolling_1y.append({"date":sub.index[-1].strftime("%Y-%m"),"return":round(r,2)})
    return {
        "cagr":round(cagr*100,2),"volatility":round(vol*100,2),"max_drawdown":round(mdd*100,2),
        "total_return":round(float(s.iloc[-1]/s.iloc[0]-1)*100,2),"last_price":round(float(s.iloc[-1]),4),
        "sharpe":round(sharpe,3),"sortino":round(sortino,3),"calmar":round(calmar,3),
        "omega":round(omega,3),"ulcer_index":round(abs(ulcer)*100,3),
        "var_95":round(var95*100,3),"cvar_95":round(cvar95*100,3),
        "skewness":round(float(skew(ret)),3),"excess_kurtosis":round(float(kurtosis(ret)),3),
        "win_rate":round(float((ret>0).mean())*100,1),"autocorr_lag1":round(autocorr,3),
        "log_r_squared":round(float(rv**2),3),"rolling_1y":rolling_1y[-36:],
    }

def compute_significance(prices, dates, bench_prices=None, bench_dates=None, rf=0.03, n_boot=500):
    s = pd.Series(prices, index=pd.to_datetime(dates)).dropna()
    if len(s) < 30: return {"error":"Need 30+ observations"}
    ret = s.pct_change().dropna().values; n = len(ret); ann = 252; rf_d = rf/ann
    sr = float((ret.mean()-rf_d)/ret.std()*np.sqrt(ann))
    sk_ = float(stats.skew(ret)); ku_ = float(stats.kurtosis(ret))
    se_sr = np.sqrt((1+0.5*sr**2-sk_*sr+(ku_/4)*sr**2)/n)
    t_sr = sr/se_sr if se_sr>0 else 0; p_sr = float(2*(1-stats.norm.cdf(abs(t_sr))))
    log_ret = np.log(1+ret); t_cagr, p_cagr = stats.ttest_1samp(log_ret, 0)
    np.random.seed(42); boot_sharpes=[]
    for _ in range(n_boot):
        samp = np.random.choice(ret, size=n, replace=True)
        bs = float((samp.mean()-rf_d)/samp.std()*np.sqrt(ann)) if samp.std()>0 else 0
        boot_sharpes.append(bs)
    alpha_sig = {}
    if bench_prices and bench_dates:
        sb = pd.Series(bench_prices, index=pd.to_datetime(bench_dates)).dropna()
        rb = sb.pct_change().dropna().values; ml = min(len(ret),len(rb))
        r1,r2 = ret[-ml:]-rf_d, rb[-ml:]-rf_d
        sl,ic,rv_,_,se_ = stats.linregress(r2,r1)
        t_a = float(ic/se_) if se_>0 else 0; p_a = float(2*(1-stats.t.cdf(abs(t_a),df=ml-2)))
        alpha_sig = {"alpha_pct":round(float(ic*ann*100),3),"beta":round(float(sl),3),
                     "r_squared":round(float(rv_**2),3),"p_value":round(p_a,4),
                     "significant_95":bool(p_a<0.05)}
    return {
        "n_observations":n,"data_quality":"high" if n>=1260 else("medium" if n>=252 else "low"),
        "sharpe":round(sr,3),"sharpe_p_value":round(p_sr,4),"sharpe_significant_95":bool(p_sr<0.05),
        "sharpe_ci95_low":round(float(np.percentile(boot_sharpes,2.5)),3),
        "sharpe_ci95_high":round(float(np.percentile(boot_sharpes,97.5)),3),
        "cagr_p_value":round(float(p_cagr),4),"cagr_significant_95":bool(p_cagr<0.05),
        "alpha":alpha_sig,
        "overall":("strong" if p_sr<0.05 and p_cagr<0.05 else ("moderate" if p_sr<0.10 else "weak")),
    }

def compute_signals(s: pd.Series) -> dict:
    if len(s)<50: return {}
    ret = s.pct_change().dropna()
    def rsi(series,p=14):
        d=series.diff(); g=d.where(d>0,0).rolling(p).mean(); l=(-d.where(d<0,0)).rolling(p).mean()
        return 100-100/(1+g/l.replace(0,1e-9))
    rsi_14 = float(rsi(s).iloc[-1])
    w=min(63,len(s)//2); rm=s.rolling(w).mean(); rs_=s.rolling(w).std()
    z = (float(s.iloc[-1])-float(rm.iloc[-1]))/float(rs_.iloc[-1]) if float(rs_.iloc[-1])>0 else 0
    ef=s.ewm(span=50,adjust=False).mean(); es=s.ewm(span=min(200,len(s)//2),adjust=False).mean()
    ec = float(ef.iloc[-1]/es.iloc[-1]-1)
    e12=s.ewm(span=12,adjust=False).mean(); e26=s.ewm(span=26,adjust=False).mean()
    ml=e12-e26; sl_=ml.ewm(span=9,adjust=False).mean(); mh=float(ml.iloc[-1]-sl_.iloc[-1])
    mom = float(s.iloc[-22]/s.iloc[-252]-1) if len(s)>=252 else float(s.iloc[-1]/s.iloc[0]-1)
    lp=np.log(s.values[-min(252,len(s)):]); x=np.arange(len(lp)); sl2,_,rv2,_,_=stats.linregress(x,lp)
    r2=float(rv2**2)
    sm={"bullish":1,"neutral":0,"bearish":-1}
    sigs=["bullish" if rsi_14<30 else("bearish" if rsi_14>70 else "neutral"),
          "bullish" if z<-1.5 else("bearish" if z>1.5 else "neutral"),
          "bullish" if ec>0.02 else("bearish" if ec<-0.02 else "neutral"),
          "bullish" if mh>0 else "bearish",
          "bullish" if mom>0.05 else("bearish" if mom<-0.05 else "neutral")]
    raw=sum(sm[sg] for sg in sigs)
    ren=int((raw+5)/10*100)
    vol_s=max(0,1-float(ret.std()*np.sqrt(252))/0.30)
    buf=int((r2*0.5+vol_s*0.3+max(0,mom)*0.2)*100)
    return {
        "rsi_14":round(rsi_14,2),"rsi_signal":"bullish" if rsi_14<30 else("bearish" if rsi_14>70 else "neutral"),
        "z_score":round(z,3),"z_signal":"bullish" if z<-1.5 else("bearish" if z>1.5 else "neutral"),
        "ema_cross_pct":round(ec*100,2),"ema_signal":"bullish" if ec>0.02 else("bearish" if ec<-0.02 else "neutral"),
        "macd_histogram":round(mh,4),"macd_signal":"bullish" if mh>0 else "bearish",
        "momentum_12_1":round(mom*100,2),"momentum_signal":"bullish" if mom>0.05 else("bearish" if mom<-0.05 else "neutral"),
        "trend_r2":round(r2,3),"renaissance_score":ren,"buffett_quality":buf,
        "composite":"bullish" if ren>=60 else("bearish" if ren<=40 else "neutral"),
    }

# ═══════════════════════════════════════════════════════════════════════
# STRATEGIES
# ═══════════════════════════════════════════════════════════════════════
def backtest_buy_and_hold(series_dict, keys, initial_capital, allocations=None):
    if not allocations: allocations={k:1/len(keys) for k in keys}
    else:
        total=sum(allocations.values()); allocations={k:v/total for k,v in allocations.items()}
    all_dates=sorted(set.intersection(*[set(s.index) for s in series_dict.values()]))
    aligned=pd.DataFrame({k:series_dict[k].reindex(all_dates) for k in keys}).dropna()
    port=pd.Series(0.0,index=aligned.index)
    contribs={}
    for k in keys:
        w=allocations.get(k,0); s=aligned[k]; port+=s/s.iloc[0]*w*initial_capital
        ny=(s.index[-1]-s.index[0]).days/365.25; tr=float(s.iloc[-1]/s.iloc[0]-1)
        cagr_k=float((s.iloc[-1]/s.iloc[0])**(1/ny)-1) if ny>0 else 0
        contribs[k]={"allocation":round(w,3),"total_return_pct":round(tr*100,2),"cagr_pct":round(cagr_k*100,2),"final_value":round(initial_capital*w*(1+tr),2)}
    metrics=compute_metrics(port.tolist(),[d.strftime("%Y-%m-%d") for d in port.index])
    equity=[{"date":d.strftime("%Y-%m-%d"),"value":round(float(v),2)} for d,v in port.items()]
    return {"strategy":"Buy & Hold","initial_capital":initial_capital,"final_capital":round(float(port.iloc[-1]),2),
            "metrics":metrics,"equity_curve":equity[::max(1,len(equity)//250)],"contributions":contribs}

def backtest_adn(series_dict, keys, initial_capital, target_vol=0.10):
    all_dates=sorted(set.intersection(*[set(s.index) for s in series_dict.values()]))
    aligned=pd.DataFrame({k:series_dict[k].reindex(all_dates) for k in keys}).dropna()
    returns=aligned.pct_change().dropna(); n=len(keys); capital=initial_capital
    tc=10/10000; prev_w={k:0.0 for k in keys}; equity=[]; regime_log=[]
    for i,date in enumerate(returns.index):
        if i<63:
            dr=sum((1/n)*float(returns.loc[date,k]) for k in keys); capital*=(1+dr)
            equity.append({"date":date.strftime("%Y-%m-%d"),"value":round(capital,2),"regime":"warmup","exposure":1.0})
            continue
        rw={}; total_exp=0.0; regime="neutral"
        for k in keys:
            p=aligned[k].iloc[:i+1]; r=p.pct_change().dropna()
            sv=float(r.iloc[-21:].std()*np.sqrt(252)) if len(r)>=21 else 0.15
            lv=float(r.iloc[-63:].std()*np.sqrt(252)) if len(r)>=63 else 0.15
            vr=sv/lv if lv>0 else 1.0; vw=min(target_vol/sv,1.5) if sv>0.001 else 1.0
            ef_=float(p.ewm(span=50,adjust=False).mean().iloc[-1])
            es_=float(p.ewm(span=min(200,i),adjust=False).mean().iloc[-1])
            trend_ok=ef_>es_
            if trend_ok and vr<1.3: regime="bull"; bw=1.0/n
            elif not trend_ok and vr>1.2: regime="bear"; bw=0.0
            else: regime="transition"; bw=0.5/n
            rw[k]=bw*vw; total_exp+=bw*vw
        exp=min(total_exp,1.0)
        nw={k:rw[k]/total_exp*exp for k in keys} if total_exp>0 else {k:0.0 for k in keys}
        is_me=(i<len(returns.index)-1 and returns.index[i].month!=returns.index[i+1].month)
        if is_me or i==63:
            turn=sum(abs(nw.get(k,0)-prev_w.get(k,0)) for k in keys); capital*=(1-turn*tc); prev_w=nw.copy()
        dr=sum(prev_w.get(k,0)*float(returns.loc[date,k]) for k in keys); capital*=(1+dr)
        equity.append({"date":date.strftime("%Y-%m-%d"),"value":round(capital,2),"regime":regime,"exposure":round(exp,2)})
        regime_log.append(regime)
    metrics=compute_metrics([e["value"] for e in equity],[e["date"] for e in equity])
    rc=Counter(regime_log); total_r=max(len(regime_log),1)
    return {"strategy":"ADN — Adaptive Dynamic Allocation","initial_capital":initial_capital,
            "final_capital":round(capital,2),"metrics":metrics,
            "equity_curve":equity[::max(1,len(equity)//250)],
            "regime_stats":{"bull_pct":round(rc.get("bull",0)/total_r*100,1),
                            "bear_pct":round(rc.get("bear",0)/total_r*100,1),
                            "transition_pct":round(rc.get("transition",0)/total_r*100,1)}}

def backtest_active(series_dict, keys, initial_capital, strategy_type="renaissance"):
    all_dates=sorted(set.intersection(*[set(s.index) for s in series_dict.values()]))
    aligned=pd.DataFrame({k:series_dict[k].reindex(all_dates) for k in keys}).dropna()
    returns=aligned.pct_change().dropna(); capital=initial_capital; tc=10/10000
    reb_dates=pd.date_range(aligned.index[0],aligned.index[-1],freq="ME")
    prev_w={k:1/len(keys) for k in keys}; equity=[]
    for i,date in enumerate(returns.index):
        is_reb=any(abs((date-rd).days)<=1 for rd in reb_dates) if i>63 else False
        if is_reb or i==63:
            scores={}
            for k in keys:
                p=aligned[k].iloc[max(0,i-126):i+1]
                if len(p)<10: scores[k]=0; continue
                m=float(p.iloc[-1]/p.iloc[0]-1); ef_=p.ewm(span=20,adjust=False).mean().iloc[-1]
                es_=p.ewm(span=60,adjust=False).mean().iloc[-1]; tr_=1 if ef_>es_ else 0
                r_=p.pct_change().dropna(); vs=max(0,1-float(r_.std())/0.02)
                lp_=np.log(p.values); xp=np.arange(len(lp_)); _,_,rv_,_,_=stats.linregress(xp,lp_)
                scores[k]=m*0.4+tr_*0.3+vs*0.2+rv_**2*0.1
            pos={k:v for k,v in scores.items() if v>0}
            if pos:
                tot=sum(pos.values()); nw={k:pos.get(k,0)/tot for k in keys}
            else: nw={k:1/len(keys) for k in keys}
            turn=sum(abs(nw.get(k,0)-prev_w.get(k,0)) for k in keys); capital*=(1-turn*tc); prev_w=nw.copy()
        dr=sum(prev_w.get(k,0)*float(returns.loc[date,k]) for k in keys); capital*=(1+dr)
        equity.append({"date":date.strftime("%Y-%m-%d"),"value":round(capital,2)})
    metrics=compute_metrics([e["value"] for e in equity],[e["date"] for e in equity])
    name={"renaissance":"Renaissance Composite","momentum":"Momentum 12-1","trend_following":"Trend Following EMA"}.get(strategy_type,"Active")
    return {"strategy":name,"initial_capital":initial_capital,"final_capital":round(capital,2),
            "metrics":metrics,"equity_curve":equity[::max(1,len(equity)//250)]}

def dca_backtest(prices, dates, monthly, variant="classic", boost_mult=2.0, boost_thr=-0.10):
    s=pd.Series(prices,index=pd.to_datetime(dates)); m=s.resample("ME").last().dropna()
    units=0.0; invested=0.0; ath=0.0; records=[]
    for idx,(date,price) in enumerate(m.items()):
        amount=monthly
        if variant=="smart_dca":
            ath=max(ath,price); dd_=(price-ath)/ath
            if dd_<boost_thr: amount*=boost_mult
        elif variant=="momentum_weighted" and idx>=3:
            rr=float(m.iloc[idx]/m.iloc[idx-3]-1); amount*=(1.5 if rr<-0.05 else(0.7 if rr>0.10 else 1.0))
        units+=amount/price; invested+=amount; val=units*price
        records.append({"date":date.strftime("%Y-%m"),"invested":round(invested,2),
                        "value":round(val,2),"gain":round(val-invested,2),
                        "pct":round((val-invested)/invested*100,1) if invested>0 else 0})
    fin=records[-1] if records else {}
    return {"variant":variant,"records":records,
            "summary":{"total_invested":fin.get("invested",0),"final_value":fin.get("value",0),
                       "gain":fin.get("gain",0),"return_pct":fin.get("pct",0),
                       "n_months":len(records),"multiplier":round(fin.get("value",1)/max(fin.get("invested",1),1),3)}}

def optimize_portfolio(keys, period, method="max_sharpe", rf=0.03):
    pd_=fetch_prices(keys,period); series={k:to_series(v) for k,v in pd_.items()}
    all_d=sorted(set.intersection(*[set(s.index) for s in series.values()]))
    aligned=pd.DataFrame({k:series[k].reindex(all_d) for k in keys}).dropna()
    ret_=aligned.pct_change().dropna(); mu_=ret_.mean()*252; cov_=ret_.cov()*252; n=len(keys)
    w0=np.ones(n)/n; cons=[{"type":"eq","fun":lambda w:np.sum(w)-1}]
    def neg_sh(w): pv=float(np.sqrt(w@cov_.values@w)); return -(float(np.dot(w,mu_))-rf)/pv if pv>0 else 0
    def pv(w): return float(np.sqrt(w@cov_.values@w))
    def rp(w):
        w=np.maximum(w,1e-6); pvar=w@cov_.values@w; mrc=cov_.values@w; rc=w*mrc/pvar
        return float(np.sum((rc-1/n)**2))
    if method=="min_vol": r=optimize.minimize(pv,w0,method="SLSQP",bounds=[(0,1)]*n,constraints=cons)
    elif method=="risk_parity": r=optimize.minimize(rp,w0,method="SLSQP",bounds=[(0,1)]*n,constraints=cons)
    else: r=optimize.minimize(neg_sh,w0,method="SLSQP",bounds=[(0,1)]*n,constraints=cons)
    wo=np.clip(r.x,0,1); wo/=wo.sum()
    pr=float(np.dot(wo,mu_)); pv_=float(np.sqrt(wo@cov_.values@wo)); ps=(pr-rf)/pv_ if pv_>0 else 0
    frontier=[]
    for tr in np.linspace(float(mu_.min()),float(mu_.max()),20):
        cf=[{"type":"eq","fun":lambda w:np.sum(w)-1},{"type":"eq","fun":lambda w,t=tr:np.dot(w,mu_)-t}]
        rf_=optimize.minimize(pv,w0,method="SLSQP",bounds=[(0,1)]*n,constraints=cf)
        if rf_.success: frontier.append({"vol":round(float(np.sqrt(rf_.x@cov_.values@rf_.x))*100,2),"ret":round(tr*100,2)})
    return {"method":method,"weights":{keys[i]:round(float(wo[i]),4) for i in range(n)},
            "expected_return":round(pr*100,2),"expected_vol":round(pv_*100,2),"expected_sharpe":round(ps,3),
            "correlation":{k:{k2:round(float(ret_.corr().loc[k,k2]),3) for k2 in keys} for k in keys},
            "efficient_frontier":frontier}

# ═══════════════════════════════════════════════════════════════════════
# COST MODEL (7 French brokers)
# ═══════════════════════════════════════════════════════════════════════
_BROKERS={
    "ibkr":       {"name":"Interactive Brokers","fee_pct":0.0005,"fee_min":1.75,"fx":0.002,"custody":0.0,"lse":True,"rating":5},
    "boursorama": {"name":"Boursorama","fee_pct":0.0018,"fee_min":0.99,"fx":0.015,"custody":0.0,"lse":True,"rating":4},
    "fortuneo":   {"name":"Fortuneo","fee_pct":0.0045,"fee_min":0.99,"fx":0.015,"custody":0.0,"lse":True,"rating":3},
    "swissquote": {"name":"Swissquote","fee_pct":0.001,"fee_min":9.0,"fx":0.0095,"custody":0.001,"lse":True,"rating":3},
    "bp":         {"name":"Banque Populaire","fee_pct":0.005,"fee_min":9.0,"fx":0.02,"custody":0.0015,"lse":False,"rating":2},
    "cic":        {"name":"CIC","fee_pct":0.005,"fee_min":8.0,"fx":0.02,"custody":0.0015,"lse":False,"rating":2},
    "laposte":    {"name":"La Banque Postale","fee_pct":0.006,"fee_min":10.0,"fx":0.025,"custody":0.002,"lse":False,"rating":1},
}
_SPREAD_BPS={"ISWD":12,"IUSF":15,"ISDE":18,"AMAL":45,"HIWS":35,"IWDA":8,"CSPX":6,"GLD":5}

def compute_net_dca(etf, monthly, n_months, gross_cagr, broker_key="ibkr"):
    b=_BROKERS.get(broker_key,_BROKERS["ibkr"]); spread=_SPREAD_BPS.get(etf,20)
    comm=max(monthly*b["fee_pct"],b["fee_min"]); fx=monthly*b["fx"]
    sp_cost=monthly*(spread/10000)/2; slip=monthly*0.0003
    cost_per_buy=comm+fx+sp_cost+slip
    monthly_r=(1+gross_cagr)**(1/12)-1; units=0.0; invested=0.0; tx=0.0
    portfolio_vals=[]
    for _ in range(n_months):
        net=monthly-cost_per_buy; units+=net; invested+=monthly; tx+=cost_per_buy; units*=(1+monthly_r); portfolio_vals.append(units)
    gross_final=units; avg_port=np.mean(portfolio_vals) if portfolio_vals else monthly
    tx+=avg_port*b["custody"]*n_months/12
    sell_cost=max(gross_final*b["fee_pct"],b["fee_min"])+gross_final*b["fx"]; tx+=sell_cost
    cg_tax=max(0,(gross_final-tx-invested)*0.30)
    net_final=gross_final-tx-cg_tax
    return {"broker":broker_key,"broker_name":b["name"],"total_invested":round(invested,2),
            "gross_final":round(gross_final,2),"net_final":round(net_final,2),
            "tx_costs":round(tx,2),"cg_tax":round(cg_tax,2),
            "net_return_pct":round((net_final-invested)/invested*100,2),
            "gross_return_pct":round((gross_final-invested)/invested*100,2),
            "cost_drag_pct":round((tx/(avg_port*n_months/12))*100,3) if avg_port>0 else 0,
            "lse_access":b["lse"],"rating":b["rating"]}

# ═══════════════════════════════════════════════════════════════════════
# AI AGENT (API key from env var — free for users)
# ═══════════════════════════════════════════════════════════════════════
_AGENT_TOOLS=[
    {"name":"analyze_etf","description":"Get full metrics, signals and significance for one ETF","input_schema":{"type":"object","properties":{"key":{"type":"string"},"period":{"type":"string","default":"5y"}},"required":["key"]}},
    {"name":"compare_etfs","description":"Compare multiple ETFs side by side","input_schema":{"type":"object","properties":{"keys":{"type":"array","items":{"type":"string"}},"period":{"type":"string","default":"5y"}},"required":["keys"]}},
    {"name":"run_backtest","description":"Backtest buy_and_hold, adn, or renaissance strategy","input_schema":{"type":"object","properties":{"keys":{"type":"array","items":{"type":"string"}},"strategy":{"type":"string","enum":["buy_and_hold","adn","renaissance","momentum"]},"period":{"type":"string","default":"5y"},"capital":{"type":"number","default":10000}},"required":["keys","strategy"]}},
    {"name":"optimize_allocation","description":"Find optimal portfolio weights using Markowitz","input_schema":{"type":"object","properties":{"keys":{"type":"array","items":{"type":"string"}},"method":{"type":"string","enum":["max_sharpe","min_vol","risk_parity"],"default":"max_sharpe"}},"required":["keys"]}},
    {"name":"compute_dca","description":"DCA backtest for one ETF with monthly amount","input_schema":{"type":"object","properties":{"key":{"type":"string"},"monthly":{"type":"number"},"months":{"type":"integer","default":60},"variant":{"type":"string","enum":["classic","smart_dca","momentum_weighted"],"default":"classic"}},"required":["key","monthly"]}},
    {"name":"broker_cost_comparison","description":"Compare net DCA return across all 7 French brokers","input_schema":{"type":"object","properties":{"etf":{"type":"string"},"monthly":{"type":"number"},"months":{"type":"integer","default":60},"gross_cagr":{"type":"number","default":0.10}},"required":["etf","monthly"]}},
]

def _exec_tool(name, inp):
    try:
        if name=="analyze_etf":
            k=inp.get("key","ISWD").upper(); p=inp.get("period","5y")
            if k not in _REGISTRY: return {"error":f"{k} not found"}
            pd_=fetch_prices([k,p if p else "5y"],[k]); d=pd_[k]; s=to_series(d)
            bench_d=fetch_prices(["IWDA"],p).get("IWDA",{})
            return {"key":k,"metrics":compute_metrics(d["prices"],d["dates"]),
                    "signals":compute_signals(s),
                    "significance":compute_significance(d["prices"],d["dates"],bench_d.get("prices"),bench_d.get("dates"))}
        elif name=="compare_etfs":
            keys=[k.upper() for k in inp.get("keys",["ISWD","IUSF"]) if k.upper() in _REGISTRY]
            p=inp.get("period","5y"); pd_=fetch_prices(keys,p)
            return {k:{"metrics":compute_metrics(pd_[k]["prices"],pd_[k]["dates"]),
                       "signals":compute_signals(to_series(pd_[k]))} for k in keys}
        elif name=="run_backtest":
            keys=[k.upper() for k in inp.get("keys",["ISWD"]) if k.upper() in _REGISTRY]
            p=inp.get("period","5y"); cap=float(inp.get("capital",10000))
            pd_=fetch_prices(keys,p); series={k:to_series(pd_[k]) for k in keys}
            st=inp.get("strategy","buy_and_hold")
            if st=="buy_and_hold": r=backtest_buy_and_hold(series,keys,cap)
            elif st=="adn": r=backtest_adn(series,keys,cap)
            else: r=backtest_active(series,keys,cap,st)
            return {"strategy":r["strategy"],"final_capital":r["final_capital"],
                    "cagr":r["metrics"].get("cagr"),"sharpe":r["metrics"].get("sharpe"),
                    "max_drawdown":r["metrics"].get("max_drawdown")}
        elif name=="optimize_allocation":
            keys=[k.upper() for k in inp.get("keys",["ISWD","IUSF"]) if k.upper() in _REGISTRY]
            return optimize_portfolio(keys,"3y",inp.get("method","max_sharpe"))
        elif name=="compute_dca":
            k=inp.get("key","ISWD").upper()
            if k not in _REGISTRY: return {"error":f"{k} not found"}
            pd_=fetch_prices([k],"5y")[k]
            return dca_backtest(pd_["prices"],pd_["dates"],float(inp.get("monthly",200)),
                                inp.get("variant","classic"))["summary"]
        elif name=="broker_cost_comparison":
            etf=inp.get("etf","ISWD").upper(); monthly=float(inp.get("monthly",200))
            months=int(inp.get("months",60)); gc=float(inp.get("gross_cagr",0.10))
            return {bk:compute_net_dca(etf,monthly,months,gc,bk) for bk in _BROKERS}
        return {"error":f"Unknown tool: {name}"}
    except Exception as e: return {"error":str(e)}

async def run_agent(message: str, context: dict = None, keys: list = None) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY","")
    if not api_key:
        # Fallback: rule-based analysis without Claude
        return rule_based_analyst(message, keys or list(_REGISTRY.keys())[:5])

    system = f"""You are a professional quantitative analyst specialized in Halal ETF investing.
Available ETFs: {list(_REGISTRY.keys())}. Focus on: {keys or ['ISWD','IUSF','ISDE','AMAL','HIWS']}
Use your tools to gather data before answering. Be concise and quantitative.
Always mention statistical significance and halal compliance.
Structure your response: 📊 Summary | 🔢 Key Numbers | ✅ Recommendation"""

    messages = [{"role":"user","content":message}]
    if context: messages[0]["content"] += f"\n\nContext: {json.dumps(context)}"

    tool_calls=[]; final_text=""
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(5):
            resp = await client.post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key":api_key,"anthropic-version":"2023-06-01","content-type":"application/json"},
                json={"model":"claude-sonnet-4-20250514","max_tokens":1500,"system":system,
                      "tools":_AGENT_TOOLS,"messages":messages})
            if resp.status_code != 200: break
            data=resp.json(); stop=data.get("stop_reason"); content=data.get("content",[])
            for block in content:
                if block.get("type")=="text": final_text+=block.get("text","")
            if stop=="end_turn": break
            if stop=="tool_use":
                messages.append({"role":"assistant","content":content}); tool_results=[]
                for block in content:
                    if block.get("type")=="tool_use":
                        result=_exec_tool(block["name"],block.get("input",{}))
                        tool_calls.append({"tool":block["name"],"result_preview":str(result)[:200]})
                        tool_results.append({"type":"tool_result","tool_use_id":block["id"],"content":json.dumps(result)})
                messages.append({"role":"user","content":tool_results})
            else: break
    return {"response":final_text,"tool_calls":tool_calls}

def rule_based_analyst(message: str, keys: list) -> dict:
    """Fallback analyst when no Anthropic key — uses pure quant logic"""
    msg_lower = message.lower()
    pd_data = fetch_prices(keys,"5y")
    results = {}
    for k in keys:
        d=pd_data[k]; m=compute_metrics(d["prices"],d["dates"]); sg=compute_signals(to_series(d))
        results[k]={"metrics":m,"signals":sg,"score":sg.get("renaissance_score",50)}
    ranked=sorted(results.items(),key=lambda x:x[1]["score"],reverse=True)
    top=ranked[0][0] if ranked else "ISWD"
    top_m=results[top]["metrics"]
    response = f"""## 📊 Quantitative Analysis — {', '.join(keys)}

**Top pick: {top}** (Renaissance Score: {results[top]['score']}/100)

### 🔢 Key Metrics
| ETF | CAGR | Sharpe | Max DD | Signal |
|-----|------|--------|--------|--------|
"""
    for k,v in ranked:
        m=v["metrics"]; sg=v["signals"]
        response+=f"| {k} | {m.get('cagr','—')}% | {m.get('sharpe','—')} | {m.get('max_drawdown','—')}% | {sg.get('composite','—')} |\n"

    response+=f"""
### ✅ Recommendation
**{top}** shows the strongest risk-adjusted performance with CAGR {top_m.get('cagr')}% and Sharpe ratio {top_m.get('sharpe')}.

For a beginner: start with a **€200/month DCA** on **{top}** via **Interactive Brokers** (lowest costs).
All halal-certified ETFs above use MSCI Shariah Board screening.

*Note: This is a rule-based analysis. Set ANTHROPIC_API_KEY env var on Vercel for full AI analysis.*"""
    return {"response":response,"tool_calls":[],"mode":"rule_based"}

# ═══════════════════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════════════════
class TickerLookup(BaseModel):
    symbol: str  # Just "AAPL" — we figure out the rest

class BacktestReq(BaseModel):
    keys: list; strategy: str = "buy_and_hold"
    period: str = "5y"; capital: float = 10000
    allocations: Optional[dict] = None; target_vol: float = 0.10

class DCAReq(BaseModel):
    key: str; monthly_amount: float = 200; period: str = "5y"
    variant: str = "classic"; boost_multiplier: float = 2.0

class OptReq(BaseModel):
    keys: list; method: str = "max_sharpe"; period: str = "3y"

class PortfolioReq(BaseModel):
    name: str = "My Portfolio"; allocations: dict; monthly_dca: float = 200; period: str = "5y"

class AgentReq(BaseModel):
    message: str; keys: Optional[list] = None; context: Optional[dict] = None

# ═══════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════
@app.get("/")
def root(): return {"status":"ok","version":"4.0","registry":len(_REGISTRY),"cache":CACHE.stats()}

@app.get("/api/registry")
def get_registry(): return {"registry":_REGISTRY,"count":len(_REGISTRY)}

@app.get("/api/live")
def get_live(): return {k:get_live_price(k) for k in _REGISTRY}

@app.get("/api/compare")
def compare(keys:str="ISWD,IUSF,ISDE",period:str="5y"):
    kl=[k.strip().upper() for k in keys.split(",") if k.strip().upper() in _REGISTRY]
    if not kl: raise HTTPException(400,"No valid keys")
    pd_=fetch_prices(kl,period); result={}
    for k in kl:
        d=pd_[k]; s=to_series(d); base=d["prices"][0]
        result[k]={"info":_REGISTRY[k],"metrics":compute_metrics(d["prices"],d["dates"]),
                   "signals":compute_signals(s),
                   "normalized":{"dates":d["dates"][::5],"prices":[round(p/base*100,2) for p in d["prices"]][::5]},
                   "source":d["source"]}
    return result

@app.get("/api/metrics/{key}")
def get_metrics(key:str,period:str="5y"):
    k=key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not in registry")
    d=fetch_prices([k],period)[k]; s=to_series(d)
    bench=fetch_prices(["IWDA"],period).get("IWDA",{})
    return {"key":k,"info":_REGISTRY[k],"metrics":compute_metrics(d["prices"],d["dates"]),
            "signals":compute_signals(s),"source":d["source"],
            "significance":compute_significance(d["prices"],d["dates"],bench.get("prices"),bench.get("dates")),
            "price_data":{"dates":d["dates"][::5],"prices":d["prices"][::5]}}

@app.post("/api/lookup")
def lookup_ticker(req: TickerLookup):
    detected=auto_detect(req.symbol)
    key=detected["key"]
    if key in _REGISTRY: return {"status":"exists","key":key,"info":_REGISTRY[key]}
    # Try to fetch basic info
    try:
        t=yf.Ticker(detected["ticker"]); info=t.info
        mu_est=0.10; sigma_est=0.20
        new_entry={"ticker":detected["ticker"],"name":detected["name"],
                   "isin":info.get("isin",""),"ter":0.0,"halal":detected["halal"],
                   "board":None,"region":"Global","base_price":info.get("currentPrice") or info.get("regularMarketPrice") or 100.0,
                   "currency":info.get("currency","USD"),"category":"custom"}
        _REGISTRY[key]=new_entry; _GBM_PARAMS[key]=(mu_est,sigma_est)
        return {"status":"added","key":key,"info":new_entry,"detected":detected}
    except Exception as e:
        # Add with defaults
        new_entry={"ticker":detected["ticker"],"name":detected["name"],"isin":"","ter":0.0,
                   "halal":detected["halal"],"board":None,"region":"Global","base_price":100.0,
                   "currency":"USD","category":"custom"}
        _REGISTRY[key]=new_entry; _GBM_PARAMS[key]=(0.08,0.18)
        return {"status":"added_estimated","key":key,"info":new_entry,"detected":detected,"note":str(e)}

@app.delete("/api/registry/{key}")
def remove_ticker(key:str):
    k=key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    if k in ["ISWD","IUSF","ISDE","AMAL","HIWS"]: raise HTTPException(400,"Cannot remove default halal ETFs")
    del _REGISTRY[k]; return {"removed":k}

@app.post("/api/backtest")
def run_backtest(req: BacktestReq):
    keys=[k.upper() for k in req.keys if k.upper() in _REGISTRY]
    if not keys: raise HTTPException(400,"No valid keys")
    pd_=fetch_prices(keys,req.period); series={k:to_series(pd_[k]) for k in keys}
    bench_pd=fetch_prices(["IWDA"],req.period); bench_series=to_series(bench_pd["IWDA"])
    def add_alpha(result):
        if "metrics" in result and result["metrics"]:
            bm=compute_metrics(bench_series.tolist(),[d.strftime("%Y-%m-%d") for d in bench_series.index])
            result["alpha_vs_benchmark"]=round(result["metrics"].get("cagr",0)-bm.get("cagr",0),2)
        return result
    if req.strategy=="buy_and_hold": return add_alpha(backtest_buy_and_hold(series,keys,req.capital,req.allocations))
    elif req.strategy=="adn":        return add_alpha(backtest_adn(series,keys,req.capital,req.target_vol))
    else:                            return add_alpha(backtest_active(series,keys,req.capital,req.strategy))

@app.post("/api/dca")
def run_dca(req: DCAReq):
    k=req.key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    d=fetch_prices([k],req.period)[k]
    return {"key":k,"info":_REGISTRY[k],"source":d["source"],
            **dca_backtest(d["prices"],d["dates"],req.monthly_amount,req.variant,req.boost_multiplier)}

@app.post("/api/optimize")
def run_optimize(req: OptReq):
    keys=[k.upper() for k in req.keys if k.upper() in _REGISTRY]
    if len(keys)<2: raise HTTPException(400,"Need 2+ keys")
    return optimize_portfolio(keys,req.period,req.method)

@app.post("/api/portfolio")
def run_portfolio(req: PortfolioReq):
    keys=[k.upper() for k in req.allocations if k.upper() in _REGISTRY]
    if not keys: raise HTTPException(400,"No valid keys")
    allocs={k:req.allocations.get(k,req.allocations.get(k.lower(),0)) for k in keys}
    pd_=fetch_prices(keys,req.period); port_s=None; individual={}
    for k in keys:
        w=allocs[k]/100; d=pd_[k]; s=to_series(d)
        s_n=s/s.iloc[0]*w; port_s=s_n if port_s is None else port_s.add(s_n,fill_value=0)
        m=compute_metrics(d["prices"],d["dates"]); dca=dca_backtest(d["prices"],d["dates"],req.monthly_dca*w)
        individual[k]={"metrics":m,"dca_summary":dca["summary"],"allocation":allocs[k],"signals":compute_signals(s)}
    port_prices=port_s.tolist(); port_dates=[d.strftime("%Y-%m-%d") for d in port_s.index]
    pm=compute_metrics(port_prices,port_dates); dca_port=dca_backtest(port_prices,port_dates,req.monthly_dca)
    base=port_prices[0]
    return {"name":req.name,"allocations":allocs,"portfolio_metrics":pm,
            "portfolio_dca":dca_port,"individual":individual,
            "chart":{"dates":port_dates[::5],"prices":[round(p/base*100,2) for p in port_prices][::5]}}

@app.get("/api/costs/compare")
def compare_costs(etf:str="ISWD",monthly:float=200,months:int=60,gross_cagr:float=0.10):
    etf=etf.upper()
    if etf not in _REGISTRY: raise HTTPException(404,f"{etf} not found")
    results={bk:compute_net_dca(etf,monthly,months,gross_cagr,bk) for bk in _BROKERS}
    ranked=sorted(results.items(),key=lambda x:x[1]["net_return_pct"],reverse=True)
    return {"results":results,"ranking":[{"rank":i+1,"broker_key":k,"broker_name":v["broker_name"],
            "net_return_pct":v["net_return_pct"],"net_final":v["net_final"],
            "tx_costs":v["tx_costs"],"lse":v["lse_access"]} for i,(k,v) in enumerate(ranked)],
            "best":ranked[0][1]["broker_name"] if ranked else None,
            "worst":ranked[-1][1]["broker_name"] if ranked else None,
            "gap_eur":round(ranked[0][1]["net_final"]-ranked[-1][1]["net_final"],2) if ranked else 0,
            "tax_note":"PFU 30% on capital gains. Irish ETFs: 15% WHT on dividends (creditable). TTF does NOT apply to UCITS ETFs."}

@app.post("/api/agent")
async def run_agent_route(req: AgentReq):
    return await run_agent(req.message, req.context, req.keys or list(_REGISTRY.keys())[:5])

@app.get("/api/cache/stats")
def cache_stats(): return {"cache":CACHE.stats(),"registry_size":len(_REGISTRY)}

@app.get("/api/rolling/{key}")
def get_rolling(key:str,window_years:int=3,period:str="5y"):
    k=key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    d=fetch_prices([k],period)[k]; s=pd.Series(d["prices"],index=pd.to_datetime(d["dates"]))
    window=window_years*252; results=[]
    for i in range(window,len(s),21):
        sub=s.iloc[i-window:i+1]; ny=(sub.index[-1]-sub.index[0]).days/365.25
        r=float((sub.iloc[-1]/sub.iloc[0])**(1/ny)-1)*100 if ny>0 else 0
        results.append({"date":sub.index[-1].strftime("%Y-%m"),"cagr":round(r,2)})
    if not results: return {"key":k,"data":[],"stats":{}}
    cagrs=[r["cagr"] for r in results]
    return {"key":k,"data":results,"stats":{"mean":round(float(np.mean(cagrs)),2),
            "min":round(float(np.min(cagrs)),2),"max":round(float(np.max(cagrs)),2),
            "pct_positive":round(float(np.mean([c>0 for c in cagrs])*100),1)}}
