import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bot, Box, Brain, Circle, Code2, FolderKanban, Image, KeyRound, MessageSquare, Mic, Monitor, Plus, Search, Send, Settings, Sparkles, Terminal as TerminalIcon, Wrench } from 'lucide-react'
import { io } from 'socket.io-client'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import './styles.css'
import { capabilities, chat, health, sessions, type ChatMessage } from './api'
import { toolCatalog, toolsets } from './toolCatalog'

function useJsonLoader<T>(loader: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { loader().then(setData).catch(e => setError(e.message)) }, deps)
  return { data, error }
}

function Sidebar() {
  const nav = [
    ['New session', Plus], ['Capabilities', Brain], ['Messaging', MessageSquare], ['Artifacts', Box],
    ['Projects', FolderKanban], ['Memory', Sparkles], ['Skills', Wrench], ['Settings', Settings]
  ] as const
  return <aside className="sidebar">
    <div className="brand"><Bot size={28}/><div><b>Hermes WebGUI</b><span>desktop parity browser shell</span></div></div>
    <div className="nav">{nav.map(([name, Icon]) => <button key={name}><Icon size={18}/>{name}</button>)}</div>
    <label className="search"><Search size={16}/><input placeholder="Search sessions..." /></label>
    <section><h3>PINNED</h3><p className="muted">Shift-click a chat to pin</p></section>
    <SessionList />
  </aside>
}

function SessionList() {
  const { data, error } = useJsonLoader(sessions, [])
  const items = (data as any)?.sessions || (data as any)?.items || (data as any)?.data || []
  return <section><h3>SESSIONS {items.length || ''}</h3>{error && <p className="warn">API: {error}</p>}{items.slice(0, 8).map((s: any) => <div className="session" key={s.id || s.session_id}>• {s.title || s.name || s.id || 'Untitled'}</div>)}</section>
}

function ChatPane() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Hermes WebGUI is ready. I proxy Hermes API Server on :8642 and serve this browser UI on :9119 via Vite.' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!input.trim() || busy) return
    const next = [...messages, { role: 'user' as const, content: input.trim() }]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const res = await chat(next)
      setMessages([...next, res.choices?.[0]?.message || { role: 'assistant', content: JSON.stringify(res, null, 2) }])
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `Hermes API error: ${e instanceof Error ? e.message : String(e)}` }])
    } finally { setBusy(false) }
  }
  return <main className="chat"><div className="hero"><h1>HERMES AGENT</h1><p>one task at a time, now in a web browser</p></div>
    <div className="messages">{messages.map((m, i) => <div key={i} className={`msg ${m.role}`}><b>{m.role}</b><pre>{m.content}</pre></div>)}</div>
    <div className="composer"><button><Plus size={20}/></button><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }} placeholder="Ask Hermes..."/><button onClick={submit} disabled={busy}><Send size={20}/></button></div>
  </main>
}

function ToolMatrix() {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => toolCatalog.filter(t => `${t.name} ${t.toolset} ${t.description}`.toLowerCase().includes(filter.toLowerCase())), [filter])
  return <section className="panel tools"><div className="panelTitle"><Wrench/> Tools <span>{toolCatalog.length}</span></div><input className="toolSearch" placeholder="Filter every Hermes tool..." value={filter} onChange={e=>setFilter(e.target.value)} />
    <div className="chips">{toolsets.map(t => <span key={t}>{t}</span>)}</div>
    <div className="toolGrid">{filtered.map(t => <article key={t.name}><b>{t.name}</b><small>{t.toolset}</small><p>{t.description}</p>{t.requires && <em>{t.requires}</em>}</article>)}</div>
  </section>
}

function StatusPanel() {
  const { data, error } = useJsonLoader(health, [])
  const caps = useJsonLoader(capabilities, [])
  return <section className="panel status"><div className="panelTitle"><Circle/> Gateway ready</div>
    <div className="kv"><span>Web server</span><b>:9119 / :9120</b></div><div className="kv"><span>Hermes API</span><b>{data?.hermesReachable ? 'online' : 'offline'}</b></div>
    {error && <p className="warn">{error}</p>}<pre>{JSON.stringify(caps.data || data || caps.error, null, 2).slice(0, 1800)}</pre></section>
}

function WebTerminal() {
  useEffect(() => {
    const terminal = new Terminal({ cursorBlink: true, theme: { background: '#070b12', foreground: '#d7e1ff' }, fontSize: 13 })
    const fit = new FitAddon(); terminal.loadAddon(fit)
    const el = document.getElementById('terminal')!; terminal.open(el); fit.fit()
    const socket = io()
    terminal.onData(data => socket.emit('terminal:input', data))
    socket.on('terminal:data', data => terminal.write(data))
    const resize = () => { fit.fit(); socket.emit('terminal:resize', { cols: terminal.cols, rows: terminal.rows }) }
    window.addEventListener('resize', resize); resize()
    return () => { window.removeEventListener('resize', resize); socket.disconnect(); terminal.dispose() }
  }, [])
  return <section className="panel term"><div className="panelTitle"><TerminalIcon/> Web terminal</div><div id="terminal" /></section>
}

function RightRail() {
  return <aside className="rightRail"><StatusPanel/><ToolMatrix/><section className="panel quick"><div className="panelTitle"><KeyRound/> Desktop parity</div><ul><li>OpenAI-compatible Hermes API Server integration</li><li>Sessions, chat, tools, terminal, artifacts and messaging surfaces</li><li>All Hermes toolsets represented, with gated requirements noted</li><li>Designed to run beside Open WebUI rather than replace Hermes core</li></ul></section><WebTerminal/></aside>
}

function App() { return <div className="app"><Sidebar/><ChatPane/><RightRail/><footer><span><Monitor size={14}/> webgui ready</span><span><Mic size={14}/> voice hooks planned</span><span><Image size={14}/> media/artifacts planned</span><span><Code2 size={14}/> API proxy active</span></footer></div> }

createRoot(document.getElementById('root')!).render(<App />)
