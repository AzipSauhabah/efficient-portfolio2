import React, { useState, useRef, useEffect } from 'react'

const API = '/api'

const QUICK_PROMPTS = [
  "Analyze all 5 halal ETFs and tell me which one to invest in today",
  "Compare Buy & Hold vs ADN strategy on ISWD over 5 years",
  "What is the best broker for a 200€/month DCA on ISWD in France?",
  "Run a full sentiment and signal analysis on IUSF",
  "Optimize a halal portfolio between ISWD and IUSF for max Sharpe",
  "How statistically significant is ISWD's performance vs MSCI World?",
]

const TOOL_ICONS: Record<string,string> = {
  get_metrics:        '📊',
  compare_etfs:       '📈',
  get_sentiment:      '🎭',
  optimize_portfolio: '📐',
  run_dca:            '💰',
  backtest_strategy:  '🔬',
  get_rolling_cagr:   '📉',
}

type Msg = { role:'user'|'assistant'|'tool'; content:string; tools?:any[]; loading?:boolean }

export function AgentPanel({ registry }: { registry: Record<string,any> }) {
  const [apiKey, setApiKey]     = useState('')
  const [showKey, setShowKey]   = useState(false)
  const [input, setInput]       = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading]   = useState(false)
  const [context, setContext]   = useState<any>(null)
  const messagesEndRef           = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  const send = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    if (!apiKey) { alert('Please enter your Anthropic API key in the settings above.'); return }

    setInput('')
    setMessages(p => [...p, { role:'user', content:msg }])
    setLoading(true)

    // Optimistic loading message
    setMessages(p => [...p, { role:'assistant', content:'', loading:true }])

    try {
      const r = await fetch(`${API}/agent`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          message: msg,
          keys: Object.keys(registry).slice(0,6),
          period: '5y',
          monthly_dca: 200,
          api_key: apiKey,
          context,
        })
      })
      const data = await r.json()

      // Remove loading message
      setMessages(p => p.filter(m=>!m.loading))

      if (data.error) {
        setMessages(p => [...p, { role:'assistant', content:`❌ Error: ${data.error}` }])
      } else {
        setMessages(p => [...p, {
          role:'assistant',
          content: data.response || '*(No text response)*',
          tools: data.tool_calls,
        }])
      }
    } catch (e: any) {
      setMessages(p => p.filter(m=>!m.loading))
      setMessages(p => [...p, { role:'assistant', content:`❌ Request failed: ${e.message}` }])
    }
    setLoading(false)
  }

  const clear = () => setMessages([])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 200px)', minHeight:500 }}>

      {/* API Key setup */}
      <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:14, marginBottom:12 }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ color:'#64748B', fontSize:'0.75rem', whiteSpace:'nowrap' }}>🔑 Anthropic API Key:</span>
          <div style={{ flex:1, display:'flex', gap:8, minWidth:200 }}>
            <input
              type={showKey?'text':'password'}
              value={apiKey}
              onChange={e=>setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{ flex:1, background:'#0A111C', border:`1px solid ${apiKey?'#10B981':'#334155'}`, borderRadius:6, padding:'6px 10px', color:'#E2E8F0', fontSize:'0.78rem', fontFamily:'monospace' }}
            />
            <button onClick={()=>setShowKey(p=>!p)} style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:6, padding:'6px 10px', color:'#64748B', cursor:'pointer', fontSize:'0.72rem' }}>{showKey?'🙈':'👁'}</button>
          </div>
          {apiKey && <span style={{ color:'#10B981', fontSize:'0.72rem' }}>✅ Key set</span>}
          <button onClick={clear} style={{ background:'transparent', border:'1px solid #334155', borderRadius:6, padding:'5px 10px', color:'#64748B', cursor:'pointer', fontSize:'0.72rem' }}>🗑 Clear chat</button>
          <span style={{ color:'#334155', fontSize:'0.7rem' }}>Key stays local — never stored.</span>
        </div>
        <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
          {QUICK_PROMPTS.map((p,i)=>(
            <button key={i} onClick={()=>send(p)} style={{ padding:'4px 10px', borderRadius:16, border:'1px solid #334155', background:'transparent', color:'#64748B', cursor:'pointer', fontSize:'0.68rem', transition:'all 0.15s' }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='#3B82F6', e.currentTarget.style.color='#3B82F6')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='#334155', e.currentTarget.style.color='#64748B')}>
              {p.length>50?p.slice(0,48)+'…':p}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', background:'#060B14', borderRadius:12, border:'1px solid #1E293B', padding:16, marginBottom:12 }}>
        {messages.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16, color:'#334155' }}>
            <div style={{ fontSize:'3rem' }}>🤖</div>
            <div style={{ textAlign:'center', maxWidth:400 }}>
              <div style={{ fontWeight:700, color:'#475569', marginBottom:6 }}>AI Financial Analyst Agent</div>
              <div style={{ fontSize:'0.78rem', lineHeight:1.6 }}>
                Powered by Claude. Uses tool-calling to autonomously fetch metrics, run backtests, 
                optimize portfolios, and analyze sentiment before answering.
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, maxWidth:400 }}>
              {Object.entries(TOOL_ICONS).map(([t,icon])=>(
                <div key={t} style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:8, padding:'6px 10px', display:'flex', gap:8, alignItems:'center' }}>
                  <span>{icon}</span>
                  <span style={{ color:'#475569', fontSize:'0.68rem' }}>{t.replace(/_/g,' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom:16, display:'flex', flexDirection:'column', alignItems:msg.role==='user'?'flex-end':'flex-start' }}>
            {msg.loading ? (
              <div style={{ background:'#0F172A', border:'1px solid #1E293B', borderRadius:12, padding:'12px 16px', maxWidth:'80%' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', color:'#475569', fontSize:'0.78rem' }}>
                  <div style={{ width:12, height:12, border:'2px solid #3B82F6', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                  Agent is thinking… calling tools autonomously
                </div>
              </div>
            ) : (
              <>
                {/* Tool calls log */}
                {msg.tools && msg.tools.length > 0 && (
                  <div style={{ marginBottom:8, maxWidth:'90%' }}>
                    <div style={{ color:'#334155', fontSize:'0.65rem', marginBottom:4 }}>🔧 Tools called ({msg.tools.length})</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {msg.tools.map((t:any,j:number)=>(
                        <div key={j} style={{ background:'#0F172A', border:'1px solid #1E3A5F', borderRadius:6, padding:'3px 8px', display:'flex', gap:5, alignItems:'center' }}>
                          <span style={{ fontSize:'0.75rem' }}>{TOOL_ICONS[t.tool]||'🔧'}</span>
                          <span style={{ color:'#3B82F6', fontSize:'0.65rem', fontFamily:'monospace' }}>{t.tool}</span>
                          {t.input?.key && <span style={{ color:'#475569', fontSize:'0.65rem' }}>{t.input.key}</span>}
                          {t.input?.keys && <span style={{ color:'#475569', fontSize:'0.65rem' }}>{t.input.keys?.join(',')}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{
                  background: msg.role==='user'?'#1E3A5F':'#0F172A',
                  border: `1px solid ${msg.role==='user'?'#2D4A6F':'#1E293B'}`,
                  borderRadius:12, padding:'12px 16px', maxWidth:'85%',
                  color: msg.role==='user'?'#BAE0FF':'#E2E8F0',
                  fontSize:'0.82rem', lineHeight:1.7,
                  whiteSpace:'pre-wrap',
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, paddingBottom:8, borderBottom:'1px solid #1E293B' }}>
                      <div style={{ width:20, height:20, background:'linear-gradient(135deg,#3B82F6,#8B5CF6)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem' }}>AI</div>
                      <span style={{ color:'#475569', fontSize:'0.68rem' }}>Claude — Halal ETF Analyst</span>
                    </div>
                  )}
                  {/* Format markdown-like output */}
                  {msg.content.split('\n').map((line,li)=>{
                    if (line.startsWith('### ')) return <div key={li} style={{ color:'#3B82F6', fontWeight:700, fontSize:'0.9rem', margin:'10px 0 4px' }}>{line.slice(4)}</div>
                    if (line.startsWith('## '))  return <div key={li} style={{ color:'#8B5CF6', fontWeight:700, fontSize:'0.95rem', margin:'12px 0 4px' }}>{line.slice(3)}</div>
                    if (line.startsWith('**') && line.endsWith('**')) return <div key={li} style={{ color:'#F1F5F9', fontWeight:700 }}>{line.slice(2,-2)}</div>
                    if (line.startsWith('- '))   return <div key={li} style={{ paddingLeft:12 }}>• {line.slice(2)}</div>
                    if (line.match(/^\d+\./))     return <div key={li} style={{ paddingLeft:12 }}>{line}</div>
                    return <div key={li}>{line}</div>
                  })}
                </div>
              </>
            )}
          </div>
        ))}
        <div ref={messagesEndRef}/>
      </div>

      {/* Input */}
      <div style={{ display:'flex', gap:10 }}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
          placeholder="Ask the agent anything about halal ETFs, strategies, costs… (Enter to send)"
          disabled={loading}
          style={{ flex:1, background:'#0F172A', border:`1px solid ${loading?'#334155':'#1E3A5F'}`, borderRadius:10, padding:'12px 16px', color:'#E2E8F0', fontSize:'0.85rem', outline:'none' }}
        />
        <button onClick={()=>send()} disabled={loading||!input.trim()} style={{ background:loading||!input.trim()?'#1E293B':'#3B82F6', border:'none', borderRadius:10, padding:'12px 20px', color:'#fff', fontWeight:700, cursor:loading||!input.trim()?'not-allowed':'pointer', fontSize:'0.85rem', transition:'all 0.15s' }}>
          {loading ? '⏳' : '→'}
        </button>
      </div>
    </div>
  )
}
