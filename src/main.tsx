import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bot, Box, Brain, Circle, Code2, FolderKanban, Image, KeyRound, MessageSquare, Mic, Monitor, Plus, Search, Send, Settings, Sparkles, Terminal as TerminalIcon, Wrench } from 'lucide-react'
import { io } from 'socket.io-client'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import './styles.css'
import { capabilities, chat, createSession, health, models, sessions, skills, toolsetsApi, type ChatMessage } from './api'
import { toolCatalog, toolsets } from './toolCatalog'

type View = 'chat' | 'capabilities' | 'messaging' | 'artifacts' | 'projects' | 'memory' | 'skills' | 'settings'
type IconType = React.ComponentType<{ size?: number }>

const nav: Array<[View, string, IconType]> = [
  ['chat', 'New session', Plus],
  ['capabilities', 'Capabilities', Brain],
  ['messaging', 'Messaging', MessageSquare],
  ['artifacts', 'Artifacts', Box],
  ['projects', 'Projects', FolderKanban],
  ['memory', 'Memory', Sparkles],
  ['skills', 'Skills', Wrench],
  ['settings', 'Settings', Settings]
]

function useJsonLoader<T>(loader: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    loader().then(value => { if (alive) { setData(value); setError(null) } }).catch(e => { if (alive) setError(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, deps)
  return { data, error, loading }
}

function asList(data: any): any[] { return data?.sessions || data?.items || data?.data || data?.skills || data?.toolsets || [] }
function shortJson(value: unknown, max = 2400) { return JSON.stringify(value, null, 2).slice(0, max) }

function Sidebar({ activeView, setActiveView, startNewSession }: { activeView: View; setActiveView: (v: View) => void; startNewSession: () => void }) {
  return <aside className="sidebar">
    <div className="brand"><Bot size={28}/><div><b>Hermes WebGUI</b><span>desktop parity browser shell</span></div></div>
    <div className="nav">{nav.map(([view, name, Icon]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => view === 'chat' ? startNewSession() : setActiveView(view)}><Icon size={18}/>{name}</button>)}</div>
    <label className="search"><Search size={16}/><input placeholder="Search sessions..." onFocus={() => setActiveView('chat')} /></label>
    <section><h3>PINNED</h3><p className="muted">Shift-click a chat to pin</p></section>
    <SessionList />
  </aside>
}

function SessionList() {
  const { data, error } = useJsonLoader(sessions, [])
  const items = asList(data)
  return <section><h3>SESSIONS {items.length || ''}</h3>{error && <p className="warn">API: {error}</p>}{items.slice(0, 8).map((s: any) => <div className="session" key={s.id || s.session_id}>• {s.title || s.name || s.id || 'Untitled'}</div>)}</section>
}

function ChatPane({ messages, setMessages }: { messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> }) {
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
    <div className="composer"><button title="New local draft" onClick={() => setInput('')}><Plus size={20}/></button><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }} placeholder="Ask Hermes..."/><button aria-label="Send" onClick={submit} disabled={busy}><Send size={20}/></button></div>
  </main>
}

function DataPanel({ title, loader, icon: Icon, empty = 'No records returned.' }: { title: string; loader: () => Promise<Record<string, unknown>>; icon: IconType; empty?: string }) {
  const { data, error, loading } = useJsonLoader(loader, [title])
  const rows = asList(data)
  return <main className="workspace"><section className="widePanel"><div className="pageTitle"><Icon size={24}/><h2>{title}</h2></div>{loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}{rows.length ? <div className="recordGrid">{rows.slice(0, 60).map((row: any, idx) => <article key={row.id || row.name || idx}><b>{row.name || row.id || row.title || `Item ${idx + 1}`}</b><pre>{shortJson(row, 700)}</pre></article>)}</div> : <p className="muted">{empty}</p>}<details><summary>Raw API response</summary><pre className="raw">{shortJson(data || error || {}, 8000)}</pre></details></section></main>
}

function CapabilitiesView() { return <main className="workspace"><StatusPanel expanded/><ToolMatrix large/></main> }
function MessagingView() { return <DataPanel title="Messaging / API Sessions" loader={sessions} icon={MessageSquare} empty="The API Server exposes sessions here; desktop messaging platform config is a roadmap item for this standalone web shell." /> }
function ArtifactsView() { return <DataPanel title="Artifacts / Models" loader={models} icon={Box} empty="No artifacts API is exposed by the Hermes API server yet. Showing model resources as a live API proof." /> }
function ProjectsView() { return <DataPanel title="Projects / Sessions" loader={sessions} icon={FolderKanban} empty="Projects are a desktop toolset concept; session resources are currently exposed over the API server." /> }
function MemoryView() { return <DataPanel title="Memory / Capabilities" loader={capabilities} icon={Sparkles} empty="Memory write APIs are not exposed by this API server yet; use chat/tools for memory actions." /> }
function SkillsView() { return <DataPanel title="Skills" loader={skills} icon={Wrench} empty="No skills returned by /v1/skills." /> }
function SettingsView() { return <DataPanel title="Settings / Toolsets" loader={toolsetsApi} icon={Settings} empty="No toolsets returned by /v1/toolsets." /> }

function ToolMatrix({ large = false }: { large?: boolean }) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => toolCatalog.filter(t => `${t.name} ${t.toolset} ${t.description}`.toLowerCase().includes(filter.toLowerCase())), [filter])
  return <section className={`panel tools ${large ? 'large' : ''}`}><div className="panelTitle"><Wrench/> Tools <span>{toolCatalog.length}</span></div><input className="toolSearch" placeholder="Filter every Hermes tool..." value={filter} onChange={e=>setFilter(e.target.value)} />
    <div className="chips">{toolsets.map(t => <button key={t} onClick={() => setFilter(t)}>{t}</button>)}</div>
    <div className="toolGrid">{filtered.map(t => <article key={t.name}><b>{t.name}</b><small>{t.toolset}</small><p>{t.description}</p>{t.requires && <em>{t.requires}</em>}</article>)}</div>
  </section>
}

function StatusPanel({ expanded = false }: { expanded?: boolean }) {
  const { data, error } = useJsonLoader(health, [])
  const caps = useJsonLoader(capabilities, [])
  return <section className={`panel status ${expanded ? 'expanded' : ''}`}><div className="panelTitle"><Circle/> Gateway ready</div>
    <div className="kv"><span>Web server</span><b>:9119</b></div><div className="kv"><span>Hermes API</span><b>{data?.hermesReachable ? 'online' : 'offline'}</b></div><div className="kv"><span>API key</span><b>{data?.apiKeyConfigured ? 'configured' : 'missing'}</b></div>
    {error && <p className="warn">{error}</p>}<pre>{shortJson(caps.data || data || caps.error, expanded ? 8000 : 1800)}</pre></section>
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
  return <aside className="rightRail"><StatusPanel/><ToolMatrix/><section className="panel quick"><div className="panelTitle"><KeyRound/> Desktop parity</div><ul><li>OpenAI-compatible Hermes API Server integration</li><li>Sessions, chat, tools, terminal, artifacts and messaging surfaces</li><li>All Hermes toolsets represented, with gated requirements noted</li><li>Buttons now route to live panels instead of placeholders</li></ul></section><WebTerminal/></aside>
}

function ActiveView({ activeView, messages, setMessages }: { activeView: View; messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> }) {
  if (activeView === 'capabilities') return <CapabilitiesView />
  if (activeView === 'messaging') return <MessagingView />
  if (activeView === 'artifacts') return <ArtifactsView />
  if (activeView === 'projects') return <ProjectsView />
  if (activeView === 'memory') return <MemoryView />
  if (activeView === 'skills') return <SkillsView />
  if (activeView === 'settings') return <SettingsView />
  return <ChatPane messages={messages} setMessages={setMessages} />
}

function App() {
  const [activeView, setActiveView] = useState<View>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Hermes WebGUI is ready. I proxy Hermes API Server on :8642 and serve this browser UI on :9119.' }])
  async function startNewSession() {
    setActiveView('chat')
    setMessages([{ role: 'assistant', content: 'Started a fresh local chat view. Hermes API session creation is available from the backend when you send a message.' }])
    createSession().catch(() => undefined)
  }
  return <div className="app"><Sidebar activeView={activeView} setActiveView={setActiveView} startNewSession={startNewSession}/><ActiveView activeView={activeView} messages={messages} setMessages={setMessages}/><RightRail/><footer><span><Monitor size={14}/> webgui ready</span><span><Mic size={14}/> voice hooks planned</span><span><Image size={14}/> media/artifacts planned</span><span><Code2 size={14}/> API proxy active</span></footer></div>
}

createRoot(document.getElementById('root')!).render(<App />)
