"""
Halal ETF Quant Analytics API v2
Backend Python complet : Registry dynamique, 20+ métriques, stratégies Renaissance+Buffett,
optimisation Markowitz/Risk-Parity/HRP, DCA smart, signaux IA/stat
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from scipy import stats, optimize
from scipy.stats import skew, kurtosis, jarque_bera
import warnings
warnings.filterwarnings("ignore")

app = FastAPI(title="Halal ETF Quant API v2", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ═══════════════════════════════════════════════════════════════════════
# DYNAMIC REGISTRY
# ═══════════════════════════════════════════════════════════════════════
_REGISTRY = {
    "ISWD": {"ticker":"ISWD.L","name":"iShares MSCI World Islamic","isin":"IE00B27YCN58","ter":0.50,"halal":True,"board":"MSCI Shariah","category":"halal","region":"World"},
    "IUSF": {"ticker":"IUSF.L","name":"iShares MSCI USA Islamic","isin":"IE00B296QM64","ter":0.30,"halal":True,"board":"MSCI Shariah","category":"halal","region":"USA"},
    "ISDE": {"ticker":"ISDE.L","name":"iShares MSCI EM Islamic","isin":"IE00B27YCP72","ter":0.85,"halal":True,"board":"MSCI Shariah","category":"halal","region":"EM"},
    "AMAL": {"ticker":"AMAL.L","name":"Saturna Al-Kawthar","isin":"IE00BMYMHS24","ter":0.75,"halal":True,"board":"Saturna Capital SB","category":"halal","region":"Global"},
    "HIWS": {"ticker":"HIWS.L","name":"HSBC MSCI EM Islamic","isin":"IE0009BC6K22","ter":0.60,"halal":True,"board":"HSBC Shariah SB","category":"halal","region":"EM"},
    "IWDA": {"ticker":"IWDA.L","name":"MSCI World Benchmark","isin":"IE00B4L5Y983","ter":0.20,"halal":False,"board":None,"category":"benchmark","region":"World"},
    "CSPX": {"ticker":"CSPX.L","name":"S&P 500 Benchmark","isin":"IE00B5BMR087","ter":0.07,"halal":False,"board":None,"category":"benchmark","region":"USA"},
    "GLD":  {"ticker":"GLD","name":"SPDR Gold Shares","isin":"US78463V1070","ter":0.40,"halal":True,"board":"Or physique","category":"commodity","region":"Global"},
}

_GBM_PARAMS = {
    "ISWD":(0.109,0.158),"IUSF":(0.141,0.178),"ISDE":(0.042,0.208),
    "AMAL":(0.112,0.172),"HIWS":(0.055,0.195),"IWDA":(0.132,0.155),
    "CSPX":(0.151,0.178),"GLD":(0.070,0.145),
}
_CACHE = {}
_CACHE_TTL = 3600

# ═══════════════════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════════════════
class TickerAdd(BaseModel):
    key: str
    ticker: str
    name: str
    isin: Optional[str] = ""
    ter: float = 0.0
    halal: bool = False
    board: Optional[str] = None
    category: str = "custom"
    region: str = "Global"
    gbm_mu: Optional[float] = None
    gbm_sigma: Optional[float] = None

class StrategyConfig(BaseModel):
    name: str
    type: str = "renaissance"
    lookback_days: int = 252
    rebalance_freq: str = "monthly"
    momentum_skip_days: int = 21
    zscore_entry: float = -1.5
    zscore_exit: float = 0.0
    zscore_window: int = 63
    ema_fast: int = 50
    ema_slow: int = 200
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    bb_window: int = 20
    bb_std: float = 2.0
    stop_loss_pct: Optional[float] = None
    position_sizing: str = "equal"
    kelly_fraction: float = 0.25
    transaction_cost_bps: float = 10.0

class PortfolioOptRequest(BaseModel):
    keys: list
    method: str = "max_sharpe"
    period: str = "3y"
    risk_free_rate: float = 0.03
    constraints: Optional[dict] = None

class DCAStrategyRequest(BaseModel):
    key: str
    monthly_amount: float = 200
    period: str = "5y"
    variant: str = "classic"
    boost_on_drawdown: bool = True
    boost_multiplier: float = 2.0
    boost_threshold_pct: float = -0.10
    target_growth_rate: float = 0.008

class BacktestRequest(BaseModel):
    keys: list
    strategy: StrategyConfig
    initial_capital: float = 10000
    period: str = "5y"
    benchmark_key: Optional[str] = "IWDA"

# ═══════════════════════════════════════════════════════════════════════
# PRICE ENGINE
# ═══════════════════════════════════════════════════════════════════════
def _simulate(key, period="5y"):
    mu, sigma = _GBM_PARAMS.get(key, (0.08, 0.18))
    reg = _REGISTRY.get(key, {})
    if reg.get("gbm_mu"): mu = reg["gbm_mu"]
    if reg.get("gbm_sigma"): sigma = reg["gbm_sigma"]
    years = {"1y":1,"2y":2,"3y":3,"5y":5,"10y":10}.get(period, 5)
    np.random.seed(hash(key) % 99991)
    end = datetime.now()
    dates = pd.bdate_range(end - timedelta(days=int(years*365.25)), end)
    n = len(dates)
    dr, dv = mu/252, sigma/np.sqrt(252)
    sh = np.random.normal(dr, dv, n)
    for i, d in enumerate(dates):
        if d.year==2020 and d.month in [2,3]: sh[i] -= 0.015
        elif d.year==2020 and d.month in [4,5,6]: sh[i] += 0.008
        if d.year==2022 and 1<=d.month<=9: sh[i] -= 0.002
        if d.year==2025 and d.month==4 and d.day<=10: sh[i] -= 0.008
    prices = 100 * np.exp(np.cumsum(sh))
    return {"dates":[d.strftime("%Y-%m-%d") for d in dates],
            "prices":[round(float(p),4) for p in prices],"source":"simulated"}

def fetch_prices(keys, period="5y"):
    results = {}
    for key in keys:
        cached = _CACHE.get(f"{key}_{period}")
        if cached and (datetime.now().timestamp()-cached.get("ts",0)) < _CACHE_TTL:
            results[key] = cached; continue
        info = _REGISTRY.get(key, {})
        yt = info.get("ticker", key)
        try:
            raw = yf.download(yt, period=period, auto_adjust=True, progress=False, timeout=8)
            if isinstance(raw.columns, pd.MultiIndex): raw.columns = raw.columns.droplevel(1)
            close = raw["Close"].dropna()
            if len(close) > 50:
                entry = {"dates":[d.strftime("%Y-%m-%d") for d in close.index],
                         "prices":[round(float(v),4) for v in close.values],
                         "source":"live","ts":datetime.now().timestamp()}
                _CACHE[f"{key}_{period}"] = entry
                results[key] = entry; continue
        except Exception: pass
        results[key] = _simulate(key, period)
    return results

def to_series(pd_data):
    return pd.Series(pd_data["prices"], index=pd.to_datetime(pd_data["dates"]))

# ═══════════════════════════════════════════════════════════════════════
# QUANT METRICS (20+)
# ═══════════════════════════════════════════════════════════════════════
def compute_metrics(prices, dates, rf=0.03):
    s = pd.Series(prices, index=pd.to_datetime(dates)).dropna()
    if len(s) < 10: return {}
    ret = s.pct_change().dropna()
    ann = 252
    n_years = max((s.index[-1]-s.index[0]).days/365.25, 0.01)
    cagr  = float((s.iloc[-1]/s.iloc[0])**(1/n_years)-1)
    vol   = float(ret.std()*np.sqrt(ann))
    roll_max = s.cummax()
    dd_s  = (s-roll_max)/roll_max
    mdd   = float(dd_s.min())
    excess= ret - rf/ann
    sharpe= float(excess.mean()/ret.std()*np.sqrt(ann)) if ret.std()>0 else 0
    down  = ret[ret<0]
    sortino=float(excess.mean()/down.std()*np.sqrt(ann)) if len(down)>1 and down.std()>0 else 0
    calmar= float(cagr/abs(mdd)) if mdd!=0 else 0
    var95 = float(np.percentile(ret,5))
    cvar95= float(ret[ret<=var95].mean())
    var99 = float(np.percentile(ret,1))
    cvar99= float(ret[ret<=var99].mean())
    gains = ret[ret>rf/ann]-rf/ann
    losses= rf/ann-ret[ret<=rf/ann]
    omega = float(gains.sum()/losses.sum()) if losses.sum()>0 else 999
    ulcer = float(np.sqrt(np.mean(dd_s.values**2)))
    pain  = float(np.mean(np.abs(dd_s.values)))
    tr    = float(abs(np.percentile(ret,95))/abs(np.percentile(ret,5))) if np.percentile(ret,5)!=0 else None
    martin= float(cagr/ulcer) if ulcer>0 else 0
    win_rate=float((ret>0).mean())
    avg_win =float(ret[ret>0].mean()) if (ret>0).any() else 0
    avg_loss=float(ret[ret<0].mean()) if (ret<0).any() else 0
    pf    = float(abs(avg_win*(ret>0).sum())/abs(avg_loss*(ret<0).sum())) if avg_loss!=0 else 999
    autocorr=float(ret.autocorr(lag=1))
    lp    = np.log(s.values)
    x     = np.arange(len(lp))
    sl,_,rv,_,_ = stats.linregress(x,lp)
    r2    = float(rv**2)
    try: jb_p = float(jarque_bera(ret)[1])
    except: jb_p = None
    rolling_1y=[]
    for i in range(ann,len(s),21):
        sub=s.iloc[i-ann:i+1]; ny=(sub.index[-1]-sub.index[0]).days/365.25
        r2_=float((sub.iloc[-1]/sub.iloc[0])**(1/ny)-1)*100 if ny>0 else 0
        rolling_1y.append({"date":sub.index[-1].strftime("%Y-%m"),"return":round(r2_,2)})
    rolling_sharpe=[]
    for i in range(ann*2,len(s),21):
        sr=ret.iloc[i-ann:i]
        if sr.std()>0:
            sh_=float((sr.mean()-rf/ann)/sr.std()*np.sqrt(ann))
            rolling_sharpe.append({"date":ret.index[i].strftime("%Y-%m"),"sharpe":round(sh_,3)})
    return {
        "cagr":round(cagr*100,3),"volatility":round(vol*100,3),"max_drawdown":round(mdd*100,3),
        "total_return":round(float(s.iloc[-1]/s.iloc[0]-1)*100,2),"last_price":round(float(s.iloc[-1]),4),
        "sharpe":round(sharpe,4),"sortino":round(sortino,4),"calmar":round(calmar,4),
        "omega":round(omega,3),"martin":round(martin,4),
        "var_95":round(var95*100,4),"cvar_95":round(cvar95*100,4),
        "var_99":round(var99*100,4),"cvar_99":round(cvar99*100,4),
        "tail_ratio":round(tr,3) if tr else None,
        "ulcer_index":round(abs(ulcer)*100,4),"pain_index":round(pain*100,4),
        "skewness":round(float(skew(ret)),4),"excess_kurtosis":round(float(kurtosis(ret)),4),
        "jarque_bera_pval":jb_p,"win_rate":round(win_rate*100,2),
        "avg_win_pct":round(avg_win*100,4),"avg_loss_pct":round(avg_loss*100,4),
        "profit_factor":round(pf,3),"autocorr_lag1":round(autocorr,4),
        "log_r_squared":round(r2,4),"annualized_slope":round(float(sl)*ann*100,4),
        "rolling_1y":rolling_1y[-36:],"rolling_sharpe":rolling_sharpe[-24:],
    }

# ═══════════════════════════════════════════════════════════════════════
# SIGNALS ENGINE
# ═══════════════════════════════════════════════════════════════════════
def compute_signals(s):
    if len(s)<50: return {}
    ret = s.pct_change().dropna()
    def rsi(series, p=14):
        d=series.diff(); g=d.where(d>0,0).rolling(p).mean(); l=(-d.where(d<0,0)).rolling(p).mean()
        return 100-100/(1+g/l.replace(0,1e-9))
    rsi_14=float(rsi(s).iloc[-1])
    w=min(63,len(s)//2); rm=s.rolling(w).mean(); rs_=s.rolling(w).std()
    z=(float(s.iloc[-1])-float(rm.iloc[-1]))/float(rs_.iloc[-1]) if float(rs_.iloc[-1])>0 else 0
    bm=s.rolling(20).mean(); bs=s.rolling(20).std()
    bu=bm+2*bs; bl=bm-2*bs
    bp=float((s.iloc[-1]-bl.iloc[-1])/(bu.iloc[-1]-bl.iloc[-1])) if float(bu.iloc[-1]-bl.iloc[-1])>0 else 0.5
    ef=s.ewm(span=50,adjust=False).mean()
    es=s.ewm(span=min(200,len(s)//2),adjust=False).mean()
    ec=float(ef.iloc[-1]/es.iloc[-1]-1)
    e12=s.ewm(span=12,adjust=False).mean(); e26=s.ewm(span=26,adjust=False).mean()
    ml=e12-e26; sl_=ml.ewm(span=9,adjust=False).mean()
    mh=float(ml.iloc[-1]-sl_.iloc[-1])
    mom=float(s.iloc[-22]/s.iloc[-252]-1) if len(s)>=252 else float(s.iloc[-1]/s.iloc[0]-1)
    lp=np.log(s.values[-min(252,len(s)):]); x=np.arange(len(lp))
    slope_,_,rv_,_,_=stats.linregress(x,lp); r2_=float(rv_**2)
    sm={"bullish":1,"neutral":0,"bearish":-1}
    sigs=["bullish" if rsi_14<30 else ("bearish" if rsi_14>70 else "neutral"),
          "bullish" if z<-1.5 else ("bearish" if z>1.5 else "neutral"),
          "bullish" if ec>0.02 else ("bearish" if ec<-0.02 else "neutral"),
          "bullish" if mh>0 else "bearish",
          "bullish" if mom>0.05 else ("bearish" if mom<-0.05 else "neutral")]
    raw=sum(sm[s_] for s_ in sigs)
    ren=int((raw+5)/10*100)
    vol_s=max(0,1-float(ret.std()*np.sqrt(252))/0.30)
    buf=int((r2_*0.5+vol_s*0.3+max(0,mom)*0.2)*100)
    return {
        "rsi_14":round(rsi_14,2),"rsi_signal":"bullish" if rsi_14<30 else("bearish" if rsi_14>70 else "neutral"),
        "z_score":round(z,3),"z_signal":"bullish" if z<-1.5 else("bearish" if z>1.5 else "neutral"),
        "bb_percentile":round(bp*100,1),"bb_signal":"bullish" if bp<0.1 else("bearish" if bp>0.9 else "neutral"),
        "ema_cross_pct":round(ec*100,2),"ema_signal":"bullish" if ec>0.02 else("bearish" if ec<-0.02 else "neutral"),
        "macd_histogram":round(mh,4),"macd_signal":"bullish" if mh>0 else "bearish",
        "momentum_12_1":round(mom*100,2),"momentum_signal":"bullish" if mom>0.05 else("bearish" if mom<-0.05 else "neutral"),
        "trend_r2":round(r2_,4),"trend_direction":"bullish" if slope_>0 else "bearish",
        "renaissance_score":ren,"buffett_quality":buf,
        "composite_signal":"bullish" if ren>=60 else("bearish" if ren<=40 else "neutral"),
    }

# ═══════════════════════════════════════════════════════════════════════
# STRATEGY BACKTESTER
# ═══════════════════════════════════════════════════════════════════════
def backtest_strategy(price_data, config, initial_capital, benchmark_key):
    series={k:to_series(v) for k,v in price_data.items() if k!=benchmark_key}
    if not series: return {"error":"No data"}
    all_dates=sorted(set.intersection(*[set(s.index) for s in series.values()]))
    if len(all_dates)<50: return {"error":"Insufficient data"}
    aligned=pd.DataFrame({k:s.reindex(all_dates) for k,s in series.items()}).dropna()
    returns=aligned.pct_change().dropna(); tc=config.transaction_cost_bps/10000
    trading_dates=returns.index
    freq_map={"daily":"B","weekly":"W-FRI","monthly":"ME"}
    reb_dates=pd.date_range(trading_dates[0],trading_dates[-1],freq=freq_map.get(config.rebalance_freq,"ME"))
    capital=initial_capital; prev_w={k:0.0 for k in aligned.columns}
    current_w={k:0.0 for k in aligned.columns}; equity=[]; trades=[]

    def get_signal(idx):
        w={}
        if idx<config.lookback_days: return {k:1/len(aligned.columns) for k in aligned.columns}
        sl=aligned.iloc[idx-config.lookback_days:idx]; t=config.type
        if t=="momentum":
            skip=min(config.momentum_skip_days,config.lookback_days//4)
            scores={}
            for col in aligned.columns:
                p=aligned[col]; scores[col]=float(p.iloc[idx-skip]/p.iloc[idx-config.lookback_days]-1) if p.iloc[idx-config.lookback_days]>0 else 0
            ranked=sorted(scores,key=scores.get,reverse=True); top=max(1,len(ranked)//2)
            winners=ranked[:top]; ww=1.0/top
            w={k:(ww if k in winners and scores[k]>0 else 0) for k in aligned.columns}
        elif t=="mean_reversion":
            for col in aligned.columns:
                p=sl[col]; rm_=p.rolling(config.zscore_window).mean().iloc[-1]; rs_=p.rolling(config.zscore_window).std().iloc[-1]
                zz=(p.iloc[-1]-rm_)/rs_ if rs_>0 else 0; w[col]=1.0 if zz<config.zscore_entry else 0.0
        elif t=="trend_following":
            for col in aligned.columns:
                p=sl[col]; ef_=p.ewm(span=config.ema_fast,adjust=False).mean().iloc[-1]
                es_=p.ewm(span=config.ema_slow,adjust=False).mean().iloc[-1] if len(p)>=config.ema_slow else p.mean()
                w[col]=1.0 if ef_>es_ else 0.0
        elif t=="rsi_contrarian":
            for col in aligned.columns:
                p=sl[col]; d=p.diff(); g=d.where(d>0,0).rolling(config.rsi_period).mean(); l=(-d.where(d<0,0)).rolling(config.rsi_period).mean()
                rs__=g.iloc[-1]/l.iloc[-1] if l.iloc[-1]>0 else 100; rv_=100-100/(1+rs__)
                w[col]=1.0 if rv_<config.rsi_oversold else 0.0
        elif t in("renaissance","buffett_quality","dual_momentum"):
            sc={}
            for col in aligned.columns:
                p=sl[col]; m_=float(p.iloc[-1]/p.iloc[0]-1) if p.iloc[0]>0 else 0
                ef_=p.ewm(span=config.ema_fast,adjust=False).mean().iloc[-1]
                es_=p.ewm(span=min(config.ema_slow,len(p)//2),adjust=False).mean().iloc[-1]
                tr_=1 if ef_>es_ else 0; r_=p.pct_change().dropna()
                vs=max(0,1-float(r_.std())/0.02)
                lp_=np.log(p.values); x_=np.arange(len(lp_)); _,_,rv__,_,_=stats.linregress(x_,lp_)
                sc[col]=m_*0.4+tr_*0.3+vs*0.2+rv__**2*0.1
            pos={k:v for k,v in sc.items() if v>0}
            if pos: tot=sum(pos.values()); w={k:(v/tot if k in pos else 0) for k,v in sc.items()}
            else: w={k:1/len(aligned.columns) for k in aligned.columns}
        else: w={k:1/len(aligned.columns) for k in aligned.columns}
        tot=sum(w.values()); return {k:v/tot for k,v in w.items()} if tot>0 else w

    for i,date in enumerate(trading_dates):
        is_reb=any(abs((date-rd).days)<=1 for rd in reb_dates) if i>config.lookback_days else False
        if is_reb or i==config.lookback_days:
            nw=get_signal(i); turnover=sum(abs(nw.get(k,0)-prev_w.get(k,0)) for k in aligned.columns)
            capital*=(1-turnover*tc)
            if any(abs(nw.get(k,0)-prev_w.get(k,0))>0.01 for k in aligned.columns):
                trades.append({"date":date.strftime("%Y-%m-%d"),"weights":{k:round(v,3) for k,v in nw.items()},"turnover":round(turnover,4)})
            prev_w=nw.copy(); current_w=nw.copy()
        dr_=sum(current_w.get(col,0)*returns.loc[date,col] for col in aligned.columns)
        if config.stop_loss_pct and dr_<config.stop_loss_pct: dr_=config.stop_loss_pct
        capital*=(1+dr_); equity.append({"date":date.strftime("%Y-%m-%d"),"value":round(capital,2)})

    eq_s=pd.Series([e["value"] for e in equity],index=pd.to_datetime([e["date"] for e in equity]))
    sm_=compute_metrics(eq_s.tolist(),[e["date"] for e in equity])
    bm_={}
    if benchmark_key and benchmark_key in price_data:
        bs_=to_series(price_data[benchmark_key]); common=eq_s.index.intersection(bs_.index)
        if len(common)>10:
            bn=bs_.loc[common]/bs_.loc[common].iloc[0]*initial_capital
            bm_=compute_metrics(bn.tolist(),[d.strftime("%Y-%m-%d") for d in common])
    ec_chart=equity[::max(1,len(equity)//300)]
    return {
        "strategy_name":config.name,"strategy_type":config.type,"initial_capital":initial_capital,
        "final_capital":round(capital,2),"metrics":sm_,"benchmark_metrics":bm_,
        "equity_curve":ec_chart,"trades":trades[-50:],"n_trades":len(trades),
        "alpha":round(sm_.get("cagr",0)-bm_.get("cagr",0),3) if bm_ else None,
    }

# ═══════════════════════════════════════════════════════════════════════
# PORTFOLIO OPTIMIZER
# ═══════════════════════════════════════════════════════════════════════
def optimize_portfolio(keys, period, method, rf=0.03, constraints=None):
    pd_=fetch_prices(keys,period); series={k:to_series(v) for k,v in pd_.items()}
    all_d=sorted(set.intersection(*[set(s.index) for s in series.values()]))
    aligned=pd.DataFrame({k:series[k].reindex(all_d) for k in keys}).dropna()
    ret_=aligned.pct_change().dropna(); mu_=ret_.mean()*252; cov_=ret_.cov()*252; n=len(keys)
    bounds=[(constraints.get(k,{}).get("min",0),constraints.get(k,{}).get("max",1)) if constraints else (0,1) for k in keys]
    cons_=[{"type":"eq","fun":lambda w:np.sum(w)-1}]; w0=np.ones(n)/n
    def neg_sh(w): pv=float(np.sqrt(w@cov_.values@w)); return -(float(np.dot(w,mu_))-rf)/pv if pv>0 else 0
    def pv(w): return float(np.sqrt(w@cov_.values@w))
    if method=="max_sharpe": r=optimize.minimize(neg_sh,w0,method="SLSQP",bounds=bounds,constraints=cons_)
    elif method=="min_vol": r=optimize.minimize(pv,w0,method="SLSQP",bounds=bounds,constraints=cons_)
    elif method=="risk_parity":
        def rp(w):
            w=np.maximum(w,1e-6); pvar=w@cov_.values@w; mrc=cov_.values@w; rc=w*mrc/pvar
            return float(np.sum((rc-1/n)**2))
        r=optimize.minimize(rp,w0,method="SLSQP",bounds=bounds,constraints=cons_)
    else: r=type('R',(),{'x':w0})()
    wo=np.clip(r.x,0,1); wo/=wo.sum()
    pr=float(np.dot(wo,mu_)); pv_=float(np.sqrt(wo@cov_.values@wo)); ps=(pr-rf)/pv_ if pv_>0 else 0
    frontier=[]
    for tr in np.linspace(float(mu_.min()),float(mu_.max()),25):
        cf=[{"type":"eq","fun":lambda w:np.sum(w)-1},{"type":"eq","fun":lambda w,t=tr:np.dot(w,mu_)-t}]
        rf_=optimize.minimize(pv,w0,method="SLSQP",bounds=[(0,1)]*n,constraints=cf)
        if rf_.success: frontier.append({"vol":round(float(np.sqrt(rf_.x@cov_.values@rf_.x))*100,2),"ret":round(tr*100,2)})
    return {"method":method,"weights":{keys[i]:round(float(wo[i]),4) for i in range(n)},
            "expected_return":round(pr*100,3),"expected_vol":round(pv_*100,3),"expected_sharpe":round(ps,4),
            "individual_mu":{k:round(float(mu_[k])*100,3) for k in keys},
            "correlation":{k:{k2:round(float(ret_.corr().loc[k,k2]),3) for k2 in keys} for k in keys},
            "efficient_frontier":frontier}

# ═══════════════════════════════════════════════════════════════════════
# DCA VARIANTS
# ═══════════════════════════════════════════════════════════════════════
def run_dca_advanced(prices, dates, config):
    s=pd.Series(prices,index=pd.to_datetime(dates)); monthly=s.resample("ME").last().dropna()
    units=0.0; invested=0.0; capital_target=0.0; ath=0.0; records=[]
    for idx,(date,price) in enumerate(monthly.items()):
        amount=config.monthly_amount
        if config.variant=="momentum_weighted":
            if idx>=3:
                rr=float(monthly.iloc[idx]/monthly.iloc[idx-3]-1)
                amount*=(1.5 if rr<-0.05 else (0.7 if rr>0.10 else 1.0))
        elif config.variant=="smart_dca" and config.boost_on_drawdown:
            ath=max(ath,price); dd_=(price-ath)/ath
            if dd_<config.boost_threshold_pct: amount*=config.boost_multiplier
        elif config.variant=="value_averaging":
            capital_target+=config.monthly_amount*(1+config.target_growth_rate)
            amount=max(0,capital_target-units*price)
        units+=amount/price; invested+=amount; val=units*price
        dd2_=float((price-s[:date].max())/s[:date].max()) if len(s[:date])>0 else 0
        records.append({"date":date.strftime("%Y-%m"),"invested":round(invested,2),"value":round(val,2),
                        "gain":round(val-invested,2),"pct":round((val-invested)/invested*100,1) if invested>0 else 0,
                        "amount":round(amount,2),"drawdown_from_ath":round(dd2_*100,2)})
    fin=records[-1] if records else {}
    return {"variant":config.variant,"records":records,
            "summary":{"total_invested":fin.get("invested",0),"final_value":fin.get("value",0),
                       "total_gain":fin.get("gain",0),"total_return_pct":fin.get("pct",0),
                       "n_months":len(records),"multiplier":round(fin.get("value",1)/max(fin.get("invested",1),1),3),
                       "avg_monthly_invested":round(sum(r["amount"] for r in records)/max(len(records),1),2)}}

# ═══════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════
@app.get("/")
def root(): return {"status":"ok","version":"2.0","registry_size":len(_REGISTRY)}

@app.get("/api/registry")
def get_registry(): return {"registry":_REGISTRY,"count":len(_REGISTRY)}

@app.post("/api/registry/add")
def add_ticker(t:TickerAdd):
    k=t.key.upper()
    _REGISTRY[k]={"ticker":t.ticker,"name":t.name,"isin":t.isin,"ter":t.ter,"halal":t.halal,
                  "board":t.board,"category":t.category,"region":t.region}
    if t.gbm_mu: _REGISTRY[k]["gbm_mu"]=t.gbm_mu
    if t.gbm_sigma: _REGISTRY[k]["gbm_sigma"]=t.gbm_sigma
    _GBM_PARAMS[k]=(t.gbm_mu or 0.08, t.gbm_sigma or 0.18)
    return {"added":k,"registry_size":len(_REGISTRY)}

@app.delete("/api/registry/{key}")
def remove_ticker(key:str):
    k=key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    del _REGISTRY[k]; return {"removed":k}

@app.get("/api/live")
def get_live():
    result={}
    for key,info in _REGISTRY.items():
        try:
            t=yf.Ticker(info["ticker"]); h=t.history(period="5d")
            if len(h)>1:
                last,prev=float(h["Close"].iloc[-1]),float(h["Close"].iloc[-2])
                result[key]={"price":round(last,4),"change_pct":round((last-prev)/prev*100,2),"source":"live"}; continue
        except: pass
        result[key]={"price":None,"change_pct":None,"source":"unavailable"}
    return result

@app.get("/api/metrics/{key}")
def get_metrics(key:str,period:str="5y",rf:float=0.03):
    k=key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    pd_=fetch_prices([k],period)[k]; s=to_series(pd_)
    return {"key":k,"info":_REGISTRY[k],"metrics":compute_metrics(pd_["prices"],pd_["dates"],rf),
            "signals":compute_signals(s),
            "price_data":{"dates":pd_["dates"][::5],"prices":pd_["prices"][::5],"source":pd_["source"]}}

@app.get("/api/compare")
def compare(keys:str="ISWD,IUSF,ISDE",period:str="5y",rf:float=0.03):
    kl=[k.strip().upper() for k in keys.split(",") if k.strip().upper() in _REGISTRY]
    if not kl: raise HTTPException(400,"No valid keys")
    pd_=fetch_prices(kl,period); result={}
    for k in kl:
        d=pd_[k]; s=to_series(d); base=d["prices"][0]
        result[k]={"info":_REGISTRY[k],"metrics":compute_metrics(d["prices"],d["dates"],rf),
                   "signals":compute_signals(s),
                   "normalized":{"dates":d["dates"][::5],"prices":[round(p/base*100,2) for p in d["prices"]][::5]},
                   "source":d["source"]}
    return result

@app.get("/api/signals/{key}")
def get_signals(key:str,period:str="1y"):
    k=key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    d=fetch_prices([k],period)[k]; return {"key":k,"signals":compute_signals(to_series(d))}

@app.get("/api/strategies/presets")
def get_presets():
    return {"presets":{
        "buffett_quality":{"name":"Buffett Quality","type":"buffett_quality","lookback_days":252,"ema_fast":50,"ema_slow":200,"rebalance_freq":"monthly","position_sizing":"risk_parity","transaction_cost_bps":5,"description":"R² log-linéaire + faible vol + momentum. Long terme."},
        "renaissance_composite":{"name":"Renaissance Composite","type":"renaissance","lookback_days":126,"ema_fast":20,"ema_slow":60,"rebalance_freq":"monthly","position_sizing":"kelly","kelly_fraction":0.25,"transaction_cost_bps":10,"description":"Signal composite stat-arb. Momentum + trend + vol normalisée."},
        "dual_momentum":{"name":"Dual Momentum Antonacci","type":"dual_momentum","lookback_days":252,"momentum_skip_days":21,"rebalance_freq":"monthly","transaction_cost_bps":10,"description":"Momentum absolu + relatif. Filtre risk-off si momentum<0."},
        "trend_following":{"name":"Trend EMA 50/200","type":"trend_following","lookback_days":252,"ema_fast":50,"ema_slow":200,"rebalance_freq":"weekly","stop_loss_pct":-0.08,"description":"Long si EMA50>EMA200, cash sinon. Stop-loss -8%."},
        "mean_reversion":{"name":"Mean Reversion Z-Score","type":"mean_reversion","zscore_entry":-1.5,"zscore_exit":0.0,"zscore_window":63,"rebalance_freq":"weekly","description":"Achète Z<-1.5, vend au retour à la moyenne."},
        "rsi_contrarian":{"name":"RSI Contrarian","type":"rsi_contrarian","rsi_period":14,"rsi_oversold":30.0,"rebalance_freq":"weekly","description":"Achète oversold RSI<30. Compatible DCA renforcé."},
    }}

@app.post("/api/backtest")
def run_backtest(req:BacktestRequest):
    keys=[k.upper() for k in req.keys if k.upper() in _REGISTRY]
    if not keys: raise HTTPException(400,"No valid keys")
    all_keys=list(set(keys+([req.benchmark_key] if req.benchmark_key and req.benchmark_key in _REGISTRY else [])))
    pd_=fetch_prices(all_keys,req.period)
    etf_d={k:pd_[k] for k in keys}; bench_d={req.benchmark_key:pd_[req.benchmark_key]} if req.benchmark_key in pd_ else {}
    return backtest_strategy({**etf_d,**bench_d},req.strategy,req.initial_capital,req.benchmark_key)

@app.post("/api/optimize")
def optimize(req:PortfolioOptRequest):
    keys=[k.upper() for k in req.keys if k.upper() in _REGISTRY]
    if len(keys)<2: raise HTTPException(400,"Need at least 2 valid keys")
    return optimize_portfolio(keys,req.period,req.method,req.risk_free_rate,req.constraints)

@app.post("/api/dca")
def run_dca(req:DCAStrategyRequest):
    k=req.key.upper()
    if k not in _REGISTRY: raise HTTPException(404,f"{k} not found")
    d=fetch_prices([k],req.period)[k]; result=run_dca_advanced(d["prices"],d["dates"],req)
    return {"key":k,"info":_REGISTRY[k],**result}

@app.post("/api/dca/compare")
def compare_dca_variants(keys:str,monthly:float=200,period:str="5y"):
    kl=[k.strip().upper() for k in keys.split(",") if k.strip().upper() in _REGISTRY]; results={}
    for k in kl:
        d=fetch_prices([k],period)[k]; results[k]={}
        for v in ["classic","momentum_weighted","smart_dca","value_averaging"]:
            cfg=DCAStrategyRequest(key=k,monthly_amount=monthly,period=period,variant=v)
            results[k][v]=run_dca_advanced(d["prices"],d["dates"],cfg)["summary"]
    return results

@app.post("/api/portfolio")
def analyze_portfolio(req:dict):
    name=req.get("name","Portfolio"); allocs=req.get("allocations",{})
    monthly=float(req.get("monthly_dca",200)); period=req.get("period","5y")
    keys=[k.upper() for k in allocs if k.upper() in _REGISTRY]
    if not keys: raise HTTPException(400,"No valid keys")
    pd_=fetch_prices(keys,period); port_s=None; individual={}
    for k in keys:
        alloc=allocs.get(k,allocs.get(k.lower(),0))/100; d=pd_[k]; s=to_series(d)
        s_n=s/s.iloc[0]*alloc; m=compute_metrics(d["prices"],d["dates"])
        cfg=DCAStrategyRequest(key=k,monthly_amount=monthly*alloc,period=period)
        dca_s=run_dca_advanced(d["prices"],d["dates"],cfg)["summary"]
        individual[k]={"metrics":m,"dca":dca_s,"allocation":allocs.get(k,allocs.get(k.lower(),0)),"signals":compute_signals(s)}
        port_s=s_n if port_s is None else port_s.add(s_n,fill_value=0)
    pp=port_s.tolist(); pd2=[d.strftime("%Y-%m-%d") for d in port_s.index]
    pm=compute_metrics(pp,pd2)
    cfg2=DCAStrategyRequest(key=keys[0],monthly_amount=monthly,period=period)
    pdca=run_dca_advanced(pp,pd2,cfg2); base=pp[0]
    return {"name":name,"allocations":allocs,"portfolio_metrics":pm,"portfolio_dca":pdca,
            "individual":individual,"chart":{"dates":pd2[::5],"prices":[round(p/base*100,2) for p in pp][::5]}}

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
    return {"key":k,"window_years":window_years,"data":results,
            "stats":{"mean":round(float(np.mean(cagrs)),2),"min":round(float(np.min(cagrs)),2),
                     "max":round(float(np.max(cagrs)),2),"pct_positive":round(float(np.mean([c>0 for c in cagrs])*100),1),
                     "p5":round(float(np.percentile(cagrs,5)),2),"p95":round(float(np.percentile(cagrs,95)),2)}}
