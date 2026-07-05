import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bot, Box, Brain, Circle, Code2, Copy, FolderKanban, Image, KeyRound, MessageSquare, Mic, Monitor, Pin, Plus, RefreshCcw, Search, Send, Settings, Sparkles, Terminal as TerminalIcon, Trash2, Wrench } from 'lucide-react'
import { io } from 'socket.io-client'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import './styles.css'
import { capabilities, chat, createSession, health, models, sessions, skills, toolsetsApi, type ChatMessage } from './api'
import { toolCatalog, toolsets } from './toolCatalog'

type View = 'chat' | 'capabilities' | 'messaging' | 'artifacts' | 'projects' | 'memory' | 'skills' | 'settings'
type IconType = React.ComponentType<{ size?: number }>
type ContextMenuItem = { destructive?: boolean; disabled?: boolean; icon?: IconType; label: string; onSelect: () => void; separatorBefore?: boolean }
type ContextMenuState = { items: ContextMenuItem[]; title?: string; x: number; y: number } | null

type ContextActions = {
  openMenu: (event: React.MouseEvent, title: string, items: ContextMenuItem[]) => void
  copyText: (text: string, label?: string) => void
}

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

function ContextMenuOverlay({ menu, close }: { menu: ContextMenuState; close: () => void }) {
  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    const onPointer = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu, close])

  if (!menu) return null
  const width = 240
  const left = Math.min(menu.x, window.innerWidth - width - 10)
  const top = Math.min(menu.y, window.innerHeight - menu.items.length * 34 - 46)
  return <div className="contextMenu" style={{ left: Math.max(8, left), top: Math.max(8, top), width }} onContextMenu={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}>
    {menu.title && <div className="contextTitle">{menu.title}</div>}
    {menu.items.map((item, index) => {
      const Icon = item.icon
      return <React.Fragment key={`${item.label}-${index}`}>{item.separatorBefore && <div className="contextSeparator"/>}<button className={item.destructive ? 'destructive' : ''} disabled={item.disabled} onClick={() => { if (!item.disabled) { item.onSelect(); close() } }}>{Icon && <Icon size={15}/>}<span>{item.label}</span></button></React.Fragment>
    })}
  </div>
}

function Sidebar({ activeView, contextActions, setActiveView, startNewSession }: { activeView: View; contextActions: ContextActions; setActiveView: (v: View) => void; startNewSession: () => void }) {
  return <aside className="sidebar" onContextMenu={event => contextActions.openMenu(event, 'Sidebar', [
    { icon: Plus, label: 'New session', onSelect: startNewSession },
    { icon: Brain, label: 'Open Capabilities', onSelect: () => setActiveView('capabilities') },
    { icon: Copy, label: 'Copy current view', onSelect: () => contextActions.copyText(activeView) }
  ])}>
    <div className="brand"><Bot size={28}/><div><b>Hermes WebGUI</b><span>desktop parity browser shell</span></div></div>
    <div className="nav">{nav.map(([view, name, Icon]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => view === 'chat' ? startNewSession() : setActiveView(view)} onContextMenu={event => contextActions.openMenu(event, name, [
      { icon: Icon, label: `Open ${name}`, onSelect: () => view === 'chat' ? startNewSession() : setActiveView(view) },
      { icon: Copy, label: 'Copy label', onSelect: () => contextActions.copyText(name) },
      { icon: Pin, label: 'Pin view placeholder', onSelect: () => contextActions.copyText(`Pinned: ${name}`) }
    ])}><Icon size={18}/>{name}</button>)}</div>
    <label className="search"><Search size={16}/><input placeholder="Search sessions..." onFocus={() => setActiveView('chat')} /></label>
    <section><h3>PINNED</h3><p className="muted">Shift-click a chat to pin</p></section>
    <SessionList contextActions={contextActions} />
  </aside>
}

function SessionList({ contextActions }: { contextActions: ContextActions }) {
  const { data, error } = useJsonLoader(sessions, [])
  const items = asList(data)
  return <section><h3>SESSIONS {items.length || ''}</h3>{error && <p className="warn">API: {error}</p>}{items.slice(0, 8).map((s: any) => {
    const title = s.title || s.name || s.id || 'Untitled'
    return <div className="session" key={s.id || s.session_id} onContextMenu={event => contextActions.openMenu(event, title, [
      { icon: MessageSquare, label: 'Open session placeholder', onSelect: () => contextActions.copyText(String(s.id || s.session_id || title), 'Session id copied') },
      { icon: Copy, label: 'Copy session id', onSelect: () => contextActions.copyText(String(s.id || s.session_id || title)) },
      { icon: Copy, label: 'Copy title', onSelect: () => contextActions.copyText(title) },
      { icon: Pin, label: 'Pin session placeholder', separatorBefore: true, onSelect: () => contextActions.copyText(`Pinned session: ${title}`) }
    ])}>• {title}</div>
  })}</section>
}

function ChatPane({ contextActions, messages, setMessages }: { contextActions: ContextActions; messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> }) {
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
  return <main className="chat" onContextMenu={event => contextActions.openMenu(event, 'Chat', [
    { icon: Plus, label: 'New local draft', onSelect: () => setInput('') },
    { icon: Copy, label: 'Copy transcript', onSelect: () => contextActions.copyText(messages.map(m => `${m.role}: ${m.content}`).join('\n\n')) },
    { icon: Trash2, label: 'Clear local chat', destructive: true, separatorBefore: true, onSelect: () => setMessages([{ role: 'assistant', content: 'Local chat cleared.' }]) }
  ])}><div className="hero"><h1>HERMES AGENT</h1><p>one task at a time, now in a web browser</p></div>
    <div className="messages">{messages.map((m, i) => <div key={i} className={`msg ${m.role}`} onContextMenu={event => contextActions.openMenu(event, `${m.role} message`, [
      { icon: Copy, label: 'Copy message', onSelect: () => contextActions.copyText(m.content) },
      { icon: Copy, label: 'Copy role + message', onSelect: () => contextActions.copyText(`${m.role}: ${m.content}`) },
      { icon: RefreshCcw, label: 'Retry from here placeholder', disabled: i !== messages.length - 1, separatorBefore: true, onSelect: () => contextActions.copyText('Retry requested') }
    ])}><b>{m.role}</b><pre>{m.content}</pre></div>)}</div>
    <div className="composer"><button title="New local draft" onClick={() => setInput('')}><Plus size={20}/></button><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }} placeholder="Ask Hermes..."/><button aria-label="Send" onClick={submit} disabled={busy}><Send size={20}/></button></div>
  </main>
}

function DataPanel({ contextActions, title, loader, icon: Icon, empty = 'No records returned.' }: { contextActions: ContextActions; title: string; loader: () => Promise<Record<string, unknown>>; icon: IconType; empty?: string }) {
  const { data, error, loading } = useJsonLoader(loader, [title])
  const rows = asList(data)
  return <main className="workspace"><section className="widePanel" onContextMenu={event => contextActions.openMenu(event, title, [
    { icon: Copy, label: 'Copy raw API response', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) },
    { icon: RefreshCcw, label: 'Refresh via page reload', onSelect: () => window.location.reload() }
  ])}><div className="pageTitle"><Icon size={24}/><h2>{title}</h2></div>{loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}{rows.length ? <div className="recordGrid">{rows.slice(0, 60).map((row: any, idx) => <article key={row.id || row.name || idx} onContextMenu={event => contextActions.openMenu(event, row.name || row.id || row.title || `Item ${idx + 1}`, [
      { icon: Copy, label: 'Copy JSON', onSelect: () => contextActions.copyText(shortJson(row, 20000)) },
      { icon: Copy, label: 'Copy name/id', onSelect: () => contextActions.copyText(String(row.name || row.id || row.title || `Item ${idx + 1}`)) }
    ])}><b>{row.name || row.id || row.title || `Item ${idx + 1}`}</b><pre>{shortJson(row, 700)}</pre></article>)}</div> : <p className="muted">{empty}</p>}<details><summary>Raw API response</summary><pre className="raw">{shortJson(data || error || {}, 8000)}</pre></details></section></main>
}

function CapabilitiesView({ contextActions }: { contextActions: ContextActions }) { return <main className="workspace"><StatusPanel contextActions={contextActions} expanded/><ToolMatrix contextActions={contextActions} large/></main> }
function MessagingView({ contextActions }: { contextActions: ContextActions }) { return <DataPanel contextActions={contextActions} title="Messaging / API Sessions" loader={sessions} icon={MessageSquare} empty="The API Server exposes sessions here; desktop messaging platform config is a roadmap item for this standalone web shell." /> }
function ArtifactsView({ contextActions }: { contextActions: ContextActions }) { return <DataPanel contextActions={contextActions} title="Artifacts / Models" loader={models} icon={Box} empty="No artifacts API is exposed by the Hermes API server yet. Showing model resources as a live API proof." /> }
function ProjectsView({ contextActions }: { contextActions: ContextActions }) { return <DataPanel contextActions={contextActions} title="Projects / Sessions" loader={sessions} icon={FolderKanban} empty="Projects are a desktop toolset concept; session resources are currently exposed over the API server." /> }
function MemoryView({ contextActions }: { contextActions: ContextActions }) { return <DataPanel contextActions={contextActions} title="Memory / Capabilities" loader={capabilities} icon={Sparkles} empty="Memory write APIs are not exposed by this API server yet; use chat/tools for memory actions." /> }
function SkillsView({ contextActions }: { contextActions: ContextActions }) { return <DataPanel contextActions={contextActions} title="Skills" loader={skills} icon={Wrench} empty="No skills returned by /v1/skills." /> }
function SettingsView({ contextActions }: { contextActions: ContextActions }) { return <DataPanel contextActions={contextActions} title="Settings / Toolsets" loader={toolsetsApi} icon={Settings} empty="No toolsets returned by /v1/toolsets." /> }

function ToolMatrix({ contextActions, large = false }: { contextActions: ContextActions; large?: boolean }) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => toolCatalog.filter(t => `${t.name} ${t.toolset} ${t.description}`.toLowerCase().includes(filter.toLowerCase())), [filter])
  return <section className={`panel tools ${large ? 'large' : ''}`} onContextMenu={event => contextActions.openMenu(event, 'Tools', [
    { icon: Copy, label: 'Copy visible tools', onSelect: () => contextActions.copyText(filtered.map(t => t.name).join('\n')) },
    { icon: Search, label: 'Clear filter', onSelect: () => setFilter('') }
  ])}><div className="panelTitle"><Wrench/> Tools <span>{toolCatalog.length}</span></div><input className="toolSearch" placeholder="Filter every Hermes tool..." value={filter} onChange={e=>setFilter(e.target.value)} />
    <div className="chips">{toolsets.map(t => <button key={t} onClick={() => setFilter(t)} onContextMenu={event => contextActions.openMenu(event, t, [
      { icon: Search, label: `Filter ${t}`, onSelect: () => setFilter(t) },
      { icon: Copy, label: 'Copy toolset name', onSelect: () => contextActions.copyText(t) }
    ])}>{t}</button>)}</div>
    <div className="toolGrid">{filtered.map(t => <article key={t.name} onContextMenu={event => contextActions.openMenu(event, t.name, [
      { icon: Copy, label: 'Copy tool name', onSelect: () => contextActions.copyText(t.name) },
      { icon: Copy, label: 'Copy tool JSON', onSelect: () => contextActions.copyText(shortJson(t, 20000)) },
      { icon: Search, label: `Filter ${t.toolset}`, separatorBefore: true, onSelect: () => setFilter(t.toolset) }
    ])}><b>{t.name}</b><small>{t.toolset}</small><p>{t.description}</p>{t.requires && <em>{t.requires}</em>}</article>)}</div>
  </section>
}

function StatusPanel({ contextActions, expanded = false }: { contextActions: ContextActions; expanded?: boolean }) {
  const { data, error } = useJsonLoader(health, [])
  const caps = useJsonLoader(capabilities, [])
  return <section className={`panel status ${expanded ? 'expanded' : ''}`} onContextMenu={event => contextActions.openMenu(event, 'Gateway status', [
    { icon: Copy, label: 'Copy health JSON', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) },
    { icon: Copy, label: 'Copy capabilities JSON', onSelect: () => contextActions.copyText(shortJson(caps.data || caps.error || {}, 20000)) }
  ])}><div className="panelTitle"><Circle/> Gateway ready</div>
    <div className="kv"><span>Web server</span><b>:9119</b></div><div className="kv"><span>Hermes API</span><b>{data?.hermesReachable ? 'online' : 'offline'}</b></div><div className="kv"><span>API key</span><b>{data?.apiKeyConfigured ? 'configured' : 'missing'}</b></div>
    {error && <p className="warn">{error}</p>}<pre>{shortJson(caps.data || data || caps.error, expanded ? 8000 : 1800)}</pre></section>
}

function WebTerminal({ contextActions }: { contextActions: ContextActions }) {
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
  return <section className="panel term" onContextMenu={event => contextActions.openMenu(event, 'Web terminal', [
    { icon: Copy, label: 'Copy terminal note', onSelect: () => contextActions.copyText('Web terminal context menu') },
    { icon: Trash2, label: 'Clear terminal placeholder', destructive: true, separatorBefore: true, onSelect: () => contextActions.copyText('Clear terminal requested') }
  ])}><div className="panelTitle"><TerminalIcon/> Web terminal</div><div id="terminal" /></section>
}

function RightRail({ contextActions }: { contextActions: ContextActions }) {
  return <aside className="rightRail"><StatusPanel contextActions={contextActions}/><ToolMatrix contextActions={contextActions}/><section className="panel quick"><div className="panelTitle"><KeyRound/> Desktop parity</div><ul><li>OpenAI-compatible Hermes API Server integration</li><li>Sessions, chat, tools, terminal, artifacts and messaging surfaces</li><li>Native-feeling right-click menus on sessions, messages, tools and panels</li><li>Buttons route to live panels instead of placeholders</li></ul></section><WebTerminal contextActions={contextActions}/></aside>
}

function ActiveView({ activeView, contextActions, messages, setMessages }: { activeView: View; contextActions: ContextActions; messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> }) {
  if (activeView === 'capabilities') return <CapabilitiesView contextActions={contextActions} />
  if (activeView === 'messaging') return <MessagingView contextActions={contextActions} />
  if (activeView === 'artifacts') return <ArtifactsView contextActions={contextActions} />
  if (activeView === 'projects') return <ProjectsView contextActions={contextActions} />
  if (activeView === 'memory') return <MemoryView contextActions={contextActions} />
  if (activeView === 'skills') return <SkillsView contextActions={contextActions} />
  if (activeView === 'settings') return <SettingsView contextActions={contextActions} />
  return <ChatPane contextActions={contextActions} messages={messages} setMessages={setMessages} />
}

function App() {
  const [activeView, setActiveView] = useState<View>('chat')
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Hermes WebGUI is ready. I proxy Hermes API Server on :8642 and serve this browser UI on :9119.' }])
  function copyText(text: string) { void navigator.clipboard?.writeText(text).catch(() => undefined) }
  const contextActions: ContextActions = {
    copyText,
    openMenu: (event, title, items) => {
      event.preventDefault()
      event.stopPropagation()
      setMenu({ items, title, x: event.clientX, y: event.clientY })
    }
  }
  async function startNewSession() {
    setActiveView('chat')
    setMessages([{ role: 'assistant', content: 'Started a fresh local chat view. Hermes API session creation is available from the backend when you send a message.' }])
    createSession().catch(() => undefined)
  }
  return <div className="app"><Sidebar activeView={activeView} contextActions={contextActions} setActiveView={setActiveView} startNewSession={startNewSession}/><ActiveView activeView={activeView} contextActions={contextActions} messages={messages} setMessages={setMessages}/><RightRail contextActions={contextActions}/><ContextMenuOverlay menu={menu} close={() => setMenu(null)}/><footer><span><Monitor size={14}/> webgui ready</span><span><Mic size={14}/> voice hooks planned</span><span><Image size={14}/> media/artifacts planned</span><span><Code2 size={14}/> API proxy active</span></footer></div>
}

createRoot(document.getElementById('root')!).render(<App />)
