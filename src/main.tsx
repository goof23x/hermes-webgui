import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Archive,
  Activity,
  Bot,
  Box,
  Brain,
  Circle,
  Clock,
  Code2,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  FolderKanban,
  GitBranch,
  Hash,
  Image,
  KeyRound,
  Layers,
  MessageSquare,
  Mic,
  Monitor,
  Pin,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Terminal as TerminalIcon,
  Trash2,
  Wrench,
  Zap
} from 'lucide-react'
import { io } from 'socket.io-client'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import './styles.css'
import {
  capabilities,
  chat,
  createSession,
  health,
  models,
  sessionMessages,
  sessions,
  skills,
  toolsetsApi,
  type ChatMessage,
  type SessionMessageRecord,
  type SessionSummary
} from './api'
import { toolCatalog, toolsets } from './toolCatalog'

type View = 'chat' | 'capabilities' | 'messaging' | 'artifacts' | 'projects' | 'memory' | 'skills' | 'settings'
type IconType = React.ComponentType<{ size?: number }>
type ContextMenuItem = { destructive?: boolean; disabled?: boolean; icon?: IconType; label: string; onSelect: () => void; separatorBefore?: boolean }
type ContextMenuState = { items: ContextMenuItem[]; title?: string; x: number; y: number } | null
type UiPrefs = { accent: string; assistantBubble: string; density: 'cozy' | 'compact'; fontScale: number; showRightRail: boolean; showToolMessages: boolean; simplifyCards: boolean; themeVersion: number; userBubble: string }
type ContextActions = { copyText: (text: string) => void; openMenu: (event: React.MouseEvent, title: string, items: ContextMenuItem[]) => void }

type SessionActions = {
  archiveSession: (session: SessionSummary) => void
  branchSession: (session: SessionSummary) => void
  deleteSession: (session: SessionSummary) => void
  exportSession: (session: SessionSummary) => void
  openSession: (session: SessionSummary) => void
  openSessionWindow: (session: SessionSummary) => void
  pinSession: (session: SessionSummary) => void
  renameSession: (session: SessionSummary) => void
}

const defaultPrefs: UiPrefs = { accent: '#d66559', assistantBubble: '#000000', density: 'cozy', fontScale: 1, showRightRail: false, showToolMessages: false, simplifyCards: true, themeVersion: 2, userBubble: '#202123' }
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

function asList(data: any): any[] { return data?.sessions || data?.items || data?.data || data?.skills || data?.toolsets || [] }
function downloadText(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }
function formatClock(timestamp?: number) { if (!timestamp) return ''; return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000)) }
function formatCompactNumber(value?: number) { if (!value) return '0'; return value >= 1000000 ? `${(value / 1000000).toFixed(1)}m` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value) }
function formatDuration(totalSeconds: number) { const minutes = Math.floor(totalSeconds / 60); const seconds = totalSeconds % 60; return `${minutes}:${String(seconds).padStart(2, '0')}` }
function loadJson<T>(key: string, fallback: T): T { try { return { ...(fallback as any), ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return fallback } }
function loadPrefs(): UiPrefs {
  const prefs = loadJson('hermes-webgui:prefs', defaultPrefs)
  return prefs.themeVersion === defaultPrefs.themeVersion ? prefs : { ...defaultPrefs, density: prefs.density || defaultPrefs.density, fontScale: prefs.fontScale || defaultPrefs.fontScale, showToolMessages: !!prefs.showToolMessages, simplifyCards: prefs.simplifyCards ?? defaultPrefs.simplifyCards }
}
function messageVerb(role: string) { return role === 'user' ? 'sent' : role === 'assistant' ? 'received' : role }
function sessionId(session: SessionSummary) { return String(session.id || session.session_id || '') }
function sessionTitle(session: SessionSummary, titleOverrides: Record<string, string> = {}) { const id = sessionId(session); return titleOverrides[id] || session.title || session.name || session.id || session.session_id || 'Untitled' }
function shortJson(value: unknown, max = 2400) { return JSON.stringify(value, null, 2).slice(0, max) }

function normalizeMessages(records: SessionMessageRecord[], showToolMessages: boolean): ChatMessage[] {
  return records
    .filter(record => showToolMessages || (record.role !== 'tool' && !(record.role === 'assistant' && !record.content && record.tool_calls)))
    .map(record => {
      const role = ['system', 'user', 'assistant', 'tool'].includes(String(record.role)) ? record.role as ChatMessage['role'] : 'assistant'
      let content = record.content || ''
      if (!content && record.tool_calls) content = `[tool calls]\n${shortJson(record.tool_calls, 1600)}`
      if (role === 'tool' && record.tool_name) content = `[${record.tool_name}]\n${content}`
      return { role, content: content || '(empty)', timestamp: record.timestamp }
    })
}

function useJsonLoader<T>(loader: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    loader()
      .then(value => { if (alive) { setData(value); setError(null) } })
      .catch(error => { if (alive) setError(error.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, deps)
  return { data, error, loading }
}

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
      return <React.Fragment key={`${item.label}-${index}`}>
        {item.separatorBefore && <div className="contextSeparator"/>}
        <button className={item.destructive ? 'destructive' : ''} disabled={item.disabled} onClick={() => { if (!item.disabled) { item.onSelect(); close() } }}>
          {Icon && <Icon size={15}/>}<span>{item.label}</span>
        </button>
      </React.Fragment>
    })}
  </div>
}

function sessionMenu(session: SessionSummary, actions: SessionActions, contextActions: ContextActions, titleOverrides: Record<string, string>): ContextMenuItem[] {
  const id = sessionId(session)
  const title = sessionTitle(session, titleOverrides)
  return [
    { icon: Pin, label: 'Pin', onSelect: () => actions.pinSession(session) },
    { icon: Copy, label: 'Copy ID', onSelect: () => contextActions.copyText(id) },
    { icon: ExternalLink, label: 'New window', onSelect: () => actions.openSessionWindow(session) },
    { icon: Database, label: 'Export', onSelect: () => actions.exportSession(session) },
    { icon: GitBranch, label: 'Branch', onSelect: () => actions.branchSession(session) },
    { icon: Edit3, label: 'Rename', onSelect: () => actions.renameSession(session) },
    { icon: Archive, label: 'Archive', onSelect: () => actions.archiveSession(session) },
    { icon: Trash2, label: 'Delete', destructive: true, onSelect: () => actions.deleteSession(session) },
    { icon: MessageSquare, label: `Open ${title}`, separatorBefore: true, onSelect: () => actions.openSession(session) }
  ]
}

function Sidebar({ activeView, contextActions, pinnedIds, selectedSessionId, sessionActions, setActiveView, startNewSession, titleOverrides }: { activeView: View; contextActions: ContextActions; pinnedIds: string[]; selectedSessionId?: string; sessionActions: SessionActions; setActiveView: (view: View) => void; startNewSession: () => void; titleOverrides: Record<string, string> }) {
  return <aside className="sidebar" onContextMenu={event => contextActions.openMenu(event, 'Sidebar', [
    { icon: Plus, label: 'New session', onSelect: startNewSession },
    { icon: Brain, label: 'Open Capabilities', onSelect: () => setActiveView('capabilities') },
    { icon: Copy, label: 'Copy current view', onSelect: () => contextActions.copyText(activeView) }
  ])}>
    <div className="brand"><Bot size={28}/><div><b>Hermes WebGUI</b><span>desktop parity browser shell</span></div></div>
    <div className="nav">{nav.map(([view, name, Icon]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => view === 'chat' ? startNewSession() : setActiveView(view)}><Icon size={18}/>{name}</button>)}</div>
    <label className="search"><Search size={16}/><input placeholder="Search sessions..." onFocus={() => setActiveView('chat')} /></label>
    <SessionList contextActions={contextActions} pinnedIds={pinnedIds} selectedSessionId={selectedSessionId} sessionActions={sessionActions} titleOverrides={titleOverrides}/>
  </aside>
}

function SessionList({ contextActions, pinnedIds, selectedSessionId, sessionActions, titleOverrides }: { contextActions: ContextActions; pinnedIds: string[]; selectedSessionId?: string; sessionActions: SessionActions; titleOverrides: Record<string, string> }) {
  const { data, error } = useJsonLoader(sessions, [])
  const items = asList(data) as SessionSummary[]
  const pinned = items.filter(session => pinnedIds.includes(sessionId(session)))
  return <section>
    <h3>PINNED {pinned.length || ''}</h3>
    {pinned.length ? pinned.map(session => <SessionButton key={`pin-${sessionId(session)}`} contextActions={contextActions} selectedSessionId={selectedSessionId} session={session} sessionActions={sessionActions} titleOverrides={titleOverrides}/>) : <p className="muted">Right-click a chat to pin</p>}
    <h3>SESSIONS {items.length || ''}</h3>
    {error && <p className="warn">API: {error}</p>}
    {items.slice(0, 28).map(session => <SessionButton key={sessionId(session) || sessionTitle(session, titleOverrides)} contextActions={contextActions} selectedSessionId={selectedSessionId} session={session} sessionActions={sessionActions} titleOverrides={titleOverrides}/>) }
  </section>
}

function SessionButton({ contextActions, selectedSessionId, session, sessionActions, titleOverrides }: { contextActions: ContextActions; selectedSessionId?: string; session: SessionSummary; sessionActions: SessionActions; titleOverrides: Record<string, string> }) {
  const id = sessionId(session)
  const title = sessionTitle(session, titleOverrides)
  return <button className={`session ${selectedSessionId === id ? 'selected' : ''}`} onClick={() => sessionActions.openSession(session)} onContextMenu={event => contextActions.openMenu(event, title, sessionMenu(session, sessionActions, contextActions, titleOverrides))}>
    <span className="sessionTitle">• {title}</span>
    <span className="sessionMeta">{session.message_count ? `${session.message_count}` : ''}</span>
  </button>
}

function ChatPane({ contextActions, messages, selectedTitle, setMessages }: { contextActions: ContextActions; messages: ChatMessage[]; selectedTitle?: string; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> }) {
  const [attachments, setAttachments] = useState<NonNullable<ChatMessage['attachments']>>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [modelMode, setModelMode] = useState<'general' | 'vision' | 'audio'>('general')
  const isEmpty = messages.length <= 1 && messages[0]?.role === 'assistant' && /ready|fresh local chat/i.test(messages[0]?.content || '')

  function attachFiles(files: FileList | null) {
    if (!files?.length) return
    const next: NonNullable<ChatMessage['attachments']> = Array.from(files).map(file => {
      const kind: 'image' | 'audio' | 'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file'
      const modelHint = kind === 'image' ? 'vision/image model' : kind === 'audio' ? 'audio/transcription model' : 'general file context'
      return { kind, modelHint, name: file.name, type: file.type || 'application/octet-stream', url: URL.createObjectURL(file) }
    })
    setAttachments(current => [...current, ...next])
    if (next.some(file => file.kind === 'image')) setModelMode('vision')
    else if (next.some(file => file.kind === 'audio')) setModelMode('audio')
  }

  async function submit() {
    if ((!input.trim() && !attachments?.length) || busy) return
    const now = Date.now() / 1000
    const attachNote = attachments?.length ? `\n\nAttachments: ${attachments.map(file => `${file.name} (${file.modelHint})`).join(', ')}` : ''
    const next = [...messages, { role: 'user' as const, content: `${input.trim() || 'Attached files for review.'}${attachNote}`, timestamp: now, attachments }]
    setMessages(next); setInput(''); setAttachments([]); setBusy(true)
    try {
      const res = await chat(next)
      const reply = res.choices?.[0]?.message || { role: 'assistant' as const, content: JSON.stringify(res, null, 2) }
      setMessages([...next, { ...reply, timestamp: Date.now() / 1000 }])
    } catch (error) {
      setMessages([...next, { role: 'assistant', content: `Hermes API error: ${error instanceof Error ? error.message : String(error)}`, timestamp: Date.now() / 1000 }])
    } finally { setBusy(false) }
  }

  return <main className="chat" onContextMenu={event => contextActions.openMenu(event, 'Chat', [
    { icon: Plus, label: 'New local draft', onSelect: () => setInput('') },
    { icon: Copy, label: 'Copy transcript', onSelect: () => contextActions.copyText(messages.map(message => `${message.role} ${formatClock(message.timestamp)}: ${message.content}`).join('\n\n')) },
    { icon: Trash2, label: 'Clear local chat', destructive: true, separatorBefore: true, onSelect: () => setMessages([{ role: 'assistant', content: 'Local chat cleared.', timestamp: Date.now() / 1000 }]) }
  ])}>
    {isEmpty && <div className="emptyState"><h1>What’s on your mind today?</h1><div className="quickPrompts"><button onClick={() => setInput('Use the best Hermes tool for this task: ')}><Wrench size={16}/> Use a Hermes tool</button><button onClick={() => setInput('Create or edit an image: ')}><Image size={16}/> Create an image</button><button onClick={() => setInput('Search the web for: ')}><Search size={16}/> Look something up</button></div></div>}
    <div className={`messages chatReadable ${isEmpty ? 'isEmpty' : ''}`}>{!isEmpty && messages.map((message, index) => <article key={index} className={`msg ${message.role}`} onContextMenu={event => contextActions.openMenu(event, `${message.role} message`, [
      { icon: Copy, label: 'Copy message', onSelect: () => contextActions.copyText(message.content) },
      { icon: Copy, label: 'Copy role + message', onSelect: () => contextActions.copyText(`${message.role}: ${message.content}`) },
      { icon: Clock, label: 'Copy timestamp', disabled: !message.timestamp, onSelect: () => contextActions.copyText(formatClock(message.timestamp)) }
    ])}>
      <div className="msgHeader"><b>{message.role}</b><span>{message.timestamp ? `${messageVerb(message.role)} ${formatClock(message.timestamp)}` : 'time unavailable'}</span></div>
      <pre>{message.content}</pre>
      {!!message.attachments?.length && <div className="attachmentPreview">{message.attachments.map(file => <div key={file.url} className="attachmentCard"><span>{file.kind === 'image' ? 'Image' : file.kind === 'audio' ? 'Audio' : 'File'}</span>{file.kind === 'image' && <img src={file.url} alt={file.name}/>} {file.kind === 'audio' && <audio src={file.url} controls/>}<b>{file.name}</b><small>{file.modelHint}</small></div>)}</div>}
    </article>)}</div>
    <div className="composer chatgptComposer">
      <input id="chat-file-input" type="file" multiple accept="image/*,audio/*,.txt,.md,.pdf,.csv,.json" onChange={event => attachFiles(event.currentTarget.files)} hidden />
      <button title="Attach image/audio/file" onClick={() => document.getElementById('chat-file-input')?.click()}><Plus size={20}/></button>
      <div className="composerStack">
        {!!attachments?.length && <div className="pendingAttachments">{attachments.map(file => <button key={file.url} onClick={() => setAttachments(current => current?.filter(item => item.url !== file.url))}>{file.kind}: {file.name} · {file.modelHint} ×</button>)}</div>}
        <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder="Ask Hermes..."/>
        <div className="composerMeta"><span>Mode</span><select value={modelMode} onChange={event => setModelMode(event.target.value as typeof modelMode)}><option value="general">General chat</option><option value="vision">Vision / images</option><option value="audio">Audio / voice</option></select></div>
      </div>
      <button aria-label="Send" onClick={submit} disabled={busy}><Send size={20}/></button>
    </div>
  </main>
}

function CapabilityView({ contextActions, prefs }: { contextActions: ContextActions; prefs: UiPrefs }) {
  const { data, error, loading } = useJsonLoader(capabilities, [])
  const features = data?.features && typeof data.features === 'object' ? Object.entries(data.features as Record<string, unknown>) : []
  const endpoints = data?.endpoints && typeof data.endpoints === 'object' ? Object.entries(data.endpoints as Record<string, unknown>) : []
  const runtime = data?.runtime as Record<string, unknown> | undefined
  return <main className="workspace"><section className="widePanel capabilityPanel" onContextMenu={event => contextActions.openMenu(event, 'Capabilities', [{ icon: Copy, label: 'Copy capabilities JSON', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) }])}>
    <div className="pageTitle"><Brain size={24}/><h2>Capabilities</h2></div>
    {loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}
    {data && <>
      <div className="summaryCards"><article><b>{String(data.model || 'Hermes Agent')}</b><span>model</span></article><article><b>{String(data.platform || 'hermes-agent')}</b><span>platform</span></article><article><b>{String(runtime?.tool_execution || 'server')}</b><span>tool execution</span></article><article><b>{String((data.auth as any)?.required ? 'required' : 'optional')}</b><span>auth</span></article></div>
      {runtime?.description && <p className="capDescription">{String(runtime.description)}</p>}
      <h3>FEATURES {features.length}</h3><div className="chips featureChips">{features.map(([name, enabled]) => <span className={enabled ? 'enabled' : 'disabled'} key={name}>{name}</span>)}</div>
      <h3>ENDPOINTS {endpoints.length}</h3><div className="endpointList">{endpoints.map(([name, value]) => <article key={name}><b>{name}</b><code>{typeof value === 'string' ? value : shortJson(value, 200)}</code></article>)}</div>
      <details><summary>Raw API response</summary><pre className="raw">{shortJson(data, 10000)}</pre></details>
    </>}
  </section><ToolMatrix contextActions={contextActions} large simplifyCards={prefs.simplifyCards}/></main>
}

function MessagingView({ contextActions, selectedSessionId, sessionActions, titleOverrides }: { contextActions: ContextActions; selectedSessionId?: string; sessionActions: SessionActions; titleOverrides: Record<string, string> }) {
  const { data, error, loading } = useJsonLoader(sessions, [])
  const items = asList(data) as SessionSummary[]
  return <main className="workspace"><section className="widePanel messagingPanel">
    <div className="pageTitle"><MessageSquare size={24}/><h2>Messaging / Sessions</h2></div>
    {loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}
    <div className="sessionTable">
      {items.map(session => {
        const id = sessionId(session)
        return <button key={id} className={selectedSessionId === id ? 'selected' : ''} onClick={() => sessionActions.openSession(session)} onContextMenu={event => contextActions.openMenu(event, sessionTitle(session, titleOverrides), sessionMenu(session, sessionActions, contextActions, titleOverrides))}>
          <b>{sessionTitle(session, titleOverrides)}</b><span>{session.source || 'api'}</span><span>{session.message_count || 0} messages</span><span>{formatClock(session.last_active || session.started_at)}</span><p>{session.preview || 'No preview available.'}</p>
        </button>
      })}
    </div>
  </section></main>
}

function DataPanel({ contextActions, title, loader, icon: Icon, empty = 'No records returned.', simplifyCards = true }: { contextActions: ContextActions; title: string; loader: () => Promise<Record<string, unknown>>; icon: IconType; empty?: string; simplifyCards?: boolean }) {
  const { data, error, loading } = useJsonLoader(loader, [title])
  const rows = asList(data)
  return <main className="workspace"><section className="widePanel" onContextMenu={event => contextActions.openMenu(event, title, [{ icon: Copy, label: 'Copy raw API response', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) }, { icon: RefreshCcw, label: 'Refresh page', onSelect: () => window.location.reload() }])}>
    <div className="pageTitle"><Icon size={24}/><h2>{title}</h2></div>{loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}
    {rows.length ? <div className="recordGrid">{rows.slice(0, 60).map((row: any, index) => <article key={row.id || row.name || index}><b>{row.label || row.name || row.id || row.title || `Item ${index + 1}`}</b>{simplifyCards ? <p>{row.description || row.source || row.model || `${Object.keys(row).length} fields`}</p> : <pre>{shortJson(row, 700)}</pre>}</article>)}</div> : <p className="muted">{empty}</p>}
    <details><summary>Raw API response</summary><pre className="raw">{shortJson(data || error || {}, 8000)}</pre></details>
  </section></main>
}

function SettingsView({ contextActions, prefs, setPrefs }: { contextActions: ContextActions; prefs: UiPrefs; setPrefs: (prefs: UiPrefs) => void }) {
  const update = (patch: Partial<UiPrefs>) => setPrefs({ ...prefs, ...patch })
  return <main className="workspace"><section className="widePanel prefs">
    <div className="pageTitle"><SlidersHorizontal size={24}/><h2>Customize WebGUI</h2></div>
    <div className="prefsGrid">
      <label>Accent color<input type="color" value={prefs.accent} onChange={event => update({ accent: event.target.value })}/></label>
      <label>User bubble<input type="color" value={prefs.userBubble} onChange={event => update({ userBubble: event.target.value })}/></label>
      <label>Assistant bubble<input type="color" value={prefs.assistantBubble} onChange={event => update({ assistantBubble: event.target.value })}/></label>
      <label>Density<select value={prefs.density} onChange={event => update({ density: event.target.value as UiPrefs['density'] })}><option value="cozy">Cozy</option><option value="compact">Compact</option></select></label>
      <label>Font scale<input type="range" min="0.85" max="1.2" step="0.05" value={prefs.fontScale} onChange={event => update({ fontScale: Number(event.target.value) })}/></label>
      <button type="button" onClick={() => update({ showRightRail: !prefs.showRightRail })}>Show right rail <b>{prefs.showRightRail ? 'On' : 'Off'}</b></button>
      <button type="button" onClick={() => update({ showToolMessages: !prefs.showToolMessages })}>Tool messages <b>{prefs.showToolMessages ? 'On' : 'Off'}</b></button>
      <button type="button" onClick={() => update({ simplifyCards: !prefs.simplifyCards })}>Simplify cards <b>{prefs.simplifyCards ? 'On' : 'Off'}</b></button>
      <button type="button" onClick={() => update(defaultPrefs)}>Reset defaults</button>
      <button type="button" onClick={() => contextActions.copyText(shortJson(prefs, 2000))}>Copy settings</button>
    </div>
  </section><DataPanel contextActions={contextActions} title="Settings / Toolsets" loader={toolsetsApi} icon={Settings} simplifyCards={prefs.simplifyCards}/></main>
}

function ToolMatrix({ contextActions, large = false, simplifyCards = true }: { contextActions: ContextActions; large?: boolean; simplifyCards?: boolean }) {
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => toolCatalog.filter(tool => `${tool.name} ${tool.toolset} ${tool.description}`.toLowerCase().includes(filter.toLowerCase())), [filter])
  return <section className={`panel tools ${large ? 'large' : ''}`}><div className="panelTitle"><Wrench/> Tools <span>{filtered.length}/{toolCatalog.length}</span></div><input className="toolSearch" placeholder="Filter every Hermes tool..." value={filter} onChange={event => setFilter(event.target.value)} /><div className="chips">{toolsets.map(toolset => <button key={toolset} onClick={() => setFilter(toolset)}>{toolset}</button>)}</div><div className="toolGrid">{filtered.map(tool => <article key={tool.name} onContextMenu={event => contextActions.openMenu(event, tool.name, [{ icon: Copy, label: 'Copy tool name', onSelect: () => contextActions.copyText(tool.name) }, { icon: Copy, label: 'Copy tool JSON', onSelect: () => contextActions.copyText(shortJson(tool, 20000)) }, { icon: Search, label: `Filter ${tool.toolset}`, separatorBefore: true, onSelect: () => setFilter(tool.toolset) }])}><b>{tool.name}</b><small>{tool.toolset}</small><p>{tool.description}</p>{!simplifyCards && <pre>{shortJson(tool, 500)}</pre>}{tool.requires && <em>{tool.requires}</em>}</article>)}</div></section>
}

function StatusPanel({ contextActions, expanded = false }: { contextActions: ContextActions; expanded?: boolean }) {
  const { data, error } = useJsonLoader(health, [])
  const caps = useJsonLoader(capabilities, [])
  return <section className={`panel status ${expanded ? 'expanded' : ''}`} onContextMenu={event => contextActions.openMenu(event, 'Gateway status', [{ icon: Copy, label: 'Copy health JSON', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) }, { icon: Copy, label: 'Copy capabilities JSON', onSelect: () => contextActions.copyText(shortJson(caps.data || caps.error || {}, 20000)) }])}><div className="panelTitle"><Circle/> Gateway ready</div><div className="kv"><span>Web server</span><b>:9119</b></div><div className="kv"><span>Hermes API</span><b>{data?.hermesReachable ? 'online' : 'offline'}</b></div><div className="kv"><span>API key</span><b>{data?.apiKeyConfigured ? 'configured' : 'missing'}</b></div>{error && <p className="warn">{error}</p>}<pre>{shortJson(caps.data || data || caps.error, expanded ? 8000 : 1800)}</pre></section>
}

function WebTerminal({ contextActions }: { contextActions: ContextActions }) {
  useEffect(() => {
    const terminal = new Terminal({ cursorBlink: true, theme: { background: '#070b12', foreground: '#d7e1ff' }, fontSize: 13 })
    const fit = new FitAddon(); terminal.loadAddon(fit)
    const el = document.getElementById('terminal')!
    terminal.open(el); fit.fit()
    const socket = io()
    terminal.onData(data => socket.emit('terminal:input', data))
    socket.on('terminal:data', data => terminal.write(data))
    const resize = () => { fit.fit(); socket.emit('terminal:resize', { cols: terminal.cols, rows: terminal.rows }) }
    window.addEventListener('resize', resize); resize()
    return () => { window.removeEventListener('resize', resize); socket.disconnect(); terminal.dispose() }
  }, [])
  return <section className="panel term" onContextMenu={event => contextActions.openMenu(event, 'Web terminal', [{ icon: Copy, label: 'Copy terminal note', onSelect: () => contextActions.copyText('Web terminal context menu') }])}><div className="panelTitle"><TerminalIcon/> Web terminal</div><div id="terminal" /></section>
}

function RightRail({ contextActions, prefs }: { contextActions: ContextActions; prefs: UiPrefs }) {
  if (!prefs.showRightRail) return null
  return <aside className="rightRail"><StatusPanel contextActions={contextActions}/><ToolMatrix contextActions={contextActions} simplifyCards={prefs.simplifyCards}/><section className="panel quick"><div className="panelTitle"><KeyRound/> Desktop parity</div><ul><li>Click sessions to load timestamped conversations</li><li>Messaging and capabilities render friendly live summaries</li><li>Right-click session menu mirrors Desktop actions</li></ul></section><WebTerminal contextActions={contextActions}/></aside>
}

function BottomBar({ activeView, healthData, messages, selectedSession, sessionCount, setActiveView, setPrefs, prefs }: { activeView: View; healthData: Record<string, unknown> | null; messages: ChatMessage[]; selectedSession: SessionSummary | null; sessionCount: number; setActiveView: (view: View) => void; setPrefs: (prefs: UiPrefs) => void; prefs: UiPrefs }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => { const started = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000); return () => window.clearInterval(timer) }, [])
  const usedTokens = (selectedSession?.input_tokens || 0) + (selectedSession?.output_tokens || 0) + (selectedSession?.reasoning_tokens || 0)
  const tokenLimit = 272000
  const tokenPercent = Math.min(100, Math.round((usedTokens / tokenLimit) * 100))
  const version = String((healthData?.hermes as any)?.version || 'v0.18.0')
  return <footer className="bottomBar">
    <button title="Open Gateway/Capabilities" onClick={() => setActiveView('capabilities')}><Activity size={14}/> Gateway {healthData?.hermesReachable ? 'ready' : 'checking'}</button>
    <button title="Open Messaging sessions" onClick={() => setActiveView('messaging')}><MessageSquare size={14}/> Sessions {sessionCount || '—'}</button>
    <button title="Open Skills/Agents surface" onClick={() => setActiveView('skills')}><Bot size={14}/> Agents</button>
    <button title="Open Settings/Toolsets" onClick={() => setActiveView('settings')}><Clock size={14}/> Cron</button>
    <button className="tokenMeter" title="Approximate selected-session token usage" onClick={() => setActiveView('messaging')}><span>{formatCompactNumber(usedTokens)}/{formatCompactNumber(tokenLimit)}</span><i><b style={{ width: `${tokenPercent}%` }}/></i><span>{tokenPercent}%</span></button>
    <button title="This page session elapsed time"><Clock size={14}/> Session {formatDuration(elapsed)}</button>
    <button title="Toggle compact density" onClick={() => setPrefs({ ...prefs, density: prefs.density === 'compact' ? 'cozy' : 'compact' })}><Zap size={14}/> {prefs.density === 'compact' ? 'Compact' : 'Cozy'}</button>
    <button title="Toggle web terminal/right rail" onClick={() => setPrefs({ ...prefs, showRightRail: !prefs.showRightRail })}><TerminalIcon size={14}/> Terminal</button>
    <button title="Current view" onClick={() => setActiveView(activeView)}><Layers size={14}/> {activeView}</button>
    <button title="Git branch placeholder"><GitBranch size={14}/> main</button>
    <button title="Hermes version" onClick={() => window.open('https://github.com/NousResearch/hermes-agent', '_blank', 'noopener,noreferrer')}><Hash size={14}/> {version}</button>
    <span className="footerRight"><Monitor size={14}/> {selectedSession ? sessionTitle(selectedSession) : `${messages.length} visible messages`}</span>
  </footer>
}

function ActiveView({ activeView, contextActions, messages, prefs, selectedSessionId, selectedTitle, sessionActions, setMessages, setPrefs, titleOverrides }: { activeView: View; contextActions: ContextActions; messages: ChatMessage[]; prefs: UiPrefs; selectedSessionId?: string; selectedTitle?: string; sessionActions: SessionActions; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; setPrefs: (prefs: UiPrefs) => void; titleOverrides: Record<string, string> }) {
  if (activeView === 'capabilities') return <CapabilityView contextActions={contextActions} prefs={prefs} />
  if (activeView === 'messaging') return <MessagingView contextActions={contextActions} selectedSessionId={selectedSessionId} sessionActions={sessionActions} titleOverrides={titleOverrides}/>
  if (activeView === 'artifacts') return <DataPanel contextActions={contextActions} title="Artifacts / Models" loader={models} icon={Box} simplifyCards={prefs.simplifyCards} />
  if (activeView === 'projects') return <DataPanel contextActions={contextActions} title="Projects / Sessions" loader={sessions} icon={FolderKanban} simplifyCards={prefs.simplifyCards} />
  if (activeView === 'memory') return <DataPanel contextActions={contextActions} title="Memory / Capabilities" loader={capabilities} icon={Sparkles} simplifyCards={prefs.simplifyCards} />
  if (activeView === 'skills') return <DataPanel contextActions={contextActions} title="Skills" loader={skills} icon={Wrench} simplifyCards={prefs.simplifyCards} />
  if (activeView === 'settings') return <SettingsView contextActions={contextActions} prefs={prefs} setPrefs={setPrefs} />
  return <ChatPane contextActions={contextActions} messages={messages} selectedTitle={selectedTitle} setMessages={setMessages} />
}

function App() {
  const [activeView, setActiveView] = useState<View>('chat')
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null)
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Hermes WebGUI is ready. Click a session in the left rail to load the conversation.', timestamp: Date.now() / 1000 }])
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('hermes-webgui:pinned') || '[]'))
  const [prefs, setPrefsState] = useState<UiPrefs>(loadPrefs)
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(() => JSON.parse(localStorage.getItem('hermes-webgui:title-overrides') || '{}'))

  useEffect(() => { localStorage.setItem('hermes-webgui:prefs', JSON.stringify(prefs)); document.documentElement.style.setProperty('--accent', prefs.accent); document.documentElement.style.setProperty('--assistant-bubble', prefs.assistantBubble); document.documentElement.style.setProperty('--font-scale', String(prefs.fontScale)); document.documentElement.style.setProperty('--user-bubble', prefs.userBubble) }, [prefs])
  useEffect(() => { localStorage.setItem('hermes-webgui:pinned', JSON.stringify(pinnedIds)) }, [pinnedIds])
  useEffect(() => { localStorage.setItem('hermes-webgui:title-overrides', JSON.stringify(titleOverrides)) }, [titleOverrides])
  useEffect(() => { health().then(setHealthData).catch(() => setHealthData(null)); sessions().then(data => setSessionCount(asList(data).length)).catch(() => undefined) }, [])

  function copyText(text: string) { void navigator.clipboard?.writeText(text).catch(() => undefined) }
  function setPrefs(next: UiPrefs) { setPrefsState(next) }
  const contextActions: ContextActions = { copyText, openMenu: (event, title, items) => { event.preventDefault(); event.stopPropagation(); setMenu({ items, title, x: event.clientX, y: event.clientY }) } }

  async function openSession(session: SessionSummary) {
    const id = sessionId(session)
    if (!id) return
    setActiveView('chat')
    setSelectedSession(session)
    setMessages([{ role: 'assistant', content: `Loading conversation: ${sessionTitle(session, titleOverrides)}…`, timestamp: Date.now() / 1000 }])
    try {
      const response = await sessionMessages(id)
      const records = asList(response) as SessionMessageRecord[]
      setMessages(normalizeMessages(records, prefs.showToolMessages))
    } catch (error) {
      setMessages([{ role: 'assistant', content: `Could not load session ${id}: ${error instanceof Error ? error.message : String(error)}`, timestamp: Date.now() / 1000 }])
    }
  }

  const sessionActions: SessionActions = {
    archiveSession: session => setMessages([{ role: 'assistant', content: `Archive requested for ${sessionTitle(session, titleOverrides)}. API support is pending; action recorded locally.`, timestamp: Date.now() / 1000 }]),
    branchSession: session => { const id = sessionId(session); window.open(`/?branch=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer') },
    deleteSession: session => setMessages([{ role: 'assistant', content: `Delete requested for ${sessionTitle(session, titleOverrides)}. Destructive API support is pending; no remote deletion was performed.`, timestamp: Date.now() / 1000 }]),
    exportSession: async session => { const id = sessionId(session); const response = await sessionMessages(id); downloadText(`${id || 'session'}.json`, shortJson(response, 1000000)) },
    openSession,
    openSessionWindow: session => window.open(`/?session=${encodeURIComponent(sessionId(session))}`, '_blank', 'noopener,noreferrer'),
    pinSession: session => setPinnedIds(ids => ids.includes(sessionId(session)) ? ids : [sessionId(session), ...ids]),
    renameSession: session => { const id = sessionId(session); const next = window.prompt('Rename session locally', sessionTitle(session, titleOverrides)); if (next) setTitleOverrides(current => ({ ...current, [id]: next })) }
  }

  async function startNewSession() {
    setActiveView('chat')
    setSelectedSession(null)
    setMessages([{ role: 'assistant', content: 'Started a fresh local chat view. Hermes API session creation is available from the backend when you send a message.', timestamp: Date.now() / 1000 }])
    createSession().catch(() => undefined)
  }

  return <div className={`app density-${prefs.density} ${prefs.showRightRail ? '' : 'noRightRail'}`}>
    <Sidebar activeView={activeView} contextActions={contextActions} pinnedIds={pinnedIds} selectedSessionId={selectedSession ? sessionId(selectedSession) : undefined} sessionActions={sessionActions} setActiveView={setActiveView} startNewSession={startNewSession} titleOverrides={titleOverrides}/>
    <ActiveView activeView={activeView} contextActions={contextActions} messages={messages} prefs={prefs} selectedSessionId={selectedSession ? sessionId(selectedSession) : undefined} selectedTitle={selectedSession ? sessionTitle(selectedSession, titleOverrides) : undefined} sessionActions={sessionActions} setMessages={setMessages} setPrefs={setPrefs} titleOverrides={titleOverrides}/>
    <RightRail contextActions={contextActions} prefs={prefs}/>
    <ContextMenuOverlay menu={menu} close={() => setMenu(null)}/>
    <BottomBar activeView={activeView} healthData={healthData} selectedSession={selectedSession} sessionCount={sessionCount} messages={messages} setActiveView={setActiveView} setPrefs={setPrefs} prefs={prefs}/>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
