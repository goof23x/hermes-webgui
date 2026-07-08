import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  createSession,
  health,
  models,
  modes,
  sessionChat,
  sessionMessages,
  sessions,
  skills,
  toolsetsApi,
  yolo,
  setYolo,
  type ChatMessage,
  type ModeOption,
  type SessionMessageRecord,
  type SessionSummary
} from './api'
import { friendlySkillName, friendlyToolDescription, friendlyToolName, friendlyToolsetName, toolCatalog, toolsets } from './toolCatalog'

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
  ensureSession: (model?: string) => Promise<string>
  exportSession: (session: SessionSummary) => void
  openSession: (session: SessionSummary) => void
  openSessionWindow: (session: SessionSummary) => void
  pinSession: (session: SessionSummary) => void
  refreshSessionMessages: (sessionId: string) => Promise<void>
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

function asList(data: any): any[] { return data?.sessions || data?.messages || data?.items || data?.data || data?.skills || data?.toolsets || [] }
function downloadText(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url) }
function formatClock(timestamp?: number) { if (!timestamp) return ''; return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000)) }
function formatCompactNumber(value?: number) { if (!value) return '0'; return value >= 1000000 ? `${(value / 1000000).toFixed(1)}m` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value) }
function formatDuration(totalSeconds: number) { const minutes = Math.floor(totalSeconds / 60); const seconds = totalSeconds % 60; return `${minutes}:${String(seconds).padStart(2, '0')}` }
function sessionActivity(session: SessionSummary) { return session.last_active || session.started_at || 0 }
function sessionBucket(session: SessionSummary) {
  const ts = sessionActivity(session)
  if (!ts) return 'Older'
  const days = Math.floor((Date.now() / 1000 - ts) / 86400)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'Previous 7 days'
  if (days < 30) return 'Previous 30 days'
  return 'Older'
}
function readableId(id?: string) { if (!id) return 'No ID'; return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id }
function pickPreview(session: SessionSummary) { return session.preview || session.model || session.source || 'Continue this Hermes conversation.' }
function loadJson<T>(key: string, fallback: T): T { try { return { ...(fallback as any), ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return fallback } }
function loadPrefs(): UiPrefs {
  const prefs = loadJson('hermes-webgui:prefs', defaultPrefs)
  return prefs.themeVersion === defaultPrefs.themeVersion ? prefs : { ...defaultPrefs, density: prefs.density || defaultPrefs.density, fontScale: prefs.fontScale || defaultPrefs.fontScale, showToolMessages: !!prefs.showToolMessages, simplifyCards: prefs.simplifyCards ?? defaultPrefs.simplifyCards }
}
function messageVerb(role: string) { return role === 'user' ? 'sent' : role === 'assistant' ? 'received' : role }
function sessionId(session: SessionSummary) { return String(session.id || session.session_id || '') }
function sessionTitle(session: SessionSummary, titleOverrides: Record<string, string> = {}) { const id = sessionId(session); return titleOverrides[id] || session.title || session.name || session.id || session.session_id || 'Untitled' }
function shortJson(value: unknown, max = 2400) { return JSON.stringify(value, null, 2).slice(0, max) }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error || new Error('Could not read file')); reader.readAsDataURL(file) }) }
function screenshotName(type = 'image/png') { const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'png'; return `pasted-screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}` }
function messageTextFromContent(content: string | Array<Record<string, unknown>>) { return Array.isArray(content) ? String((content.find(part => part.type === 'text') as any)?.text || 'Attached image for review.') : content }
function buildUserContent(text: string, attachments: NonNullable<ChatMessage['attachments']>) {
  const prompt = text.trim() || (attachments.some(file => file.kind === 'image') ? 'Please analyze this screenshot.' : 'Attached files for review.')
  const imageParts = attachments.filter(file => file.kind === 'image' && file.dataUrl).map(file => ({ type: 'image_url', image_url: { url: file.dataUrl, detail: 'high' }, name: file.name }))
  return imageParts.length ? [{ type: 'text', text: prompt }, ...imageParts] : prompt
}

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

function Sidebar({ activeView, contextActions, pinnedIds, selectedSessionId, sessionActions, sessionRefreshKey, setActiveView, startNewSession, titleOverrides }: { activeView: View; contextActions: ContextActions; pinnedIds: string[]; selectedSessionId?: string; sessionActions: SessionActions; sessionRefreshKey: number; setActiveView: (view: View) => void; startNewSession: () => void; titleOverrides: Record<string, string> }) {
  return <aside className="sidebar" onContextMenu={event => contextActions.openMenu(event, 'Sidebar', [
    { icon: Plus, label: 'New session', onSelect: startNewSession },
    { icon: Brain, label: 'Open Capabilities', onSelect: () => setActiveView('capabilities') },
    { icon: Copy, label: 'Copy current view', onSelect: () => contextActions.copyText(activeView) }
  ])}>
    <div className="brand"><Bot size={28}/><div><b>Hermes WebGUI</b><span>desktop parity browser shell</span></div></div>
    <div className="nav">{nav.map(([view, name, Icon]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => view === 'chat' ? startNewSession() : setActiveView(view)}><Icon size={18}/>{name}</button>)}</div>
    <label className="search"><Search size={16}/><input placeholder="Search sessions..." onFocus={() => setActiveView('chat')} /></label>
    <SessionList contextActions={contextActions} pinnedIds={pinnedIds} selectedSessionId={selectedSessionId} sessionActions={sessionActions} sessionRefreshKey={sessionRefreshKey} titleOverrides={titleOverrides}/>
  </aside>
}

function SessionList({ contextActions, pinnedIds, selectedSessionId, sessionActions, sessionRefreshKey, titleOverrides }: { contextActions: ContextActions; pinnedIds: string[]; selectedSessionId?: string; sessionActions: SessionActions; sessionRefreshKey: number; titleOverrides: Record<string, string> }) {
  const { data, error } = useJsonLoader(sessions, [sessionRefreshKey])
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

function ChatPane({ contextActions, ensureSession, messages, refreshSessionMessages, selectedSessionId, selectedTitle, setMessages }: { contextActions: ContextActions; ensureSession: (model?: string) => Promise<string>; messages: ChatMessage[]; refreshSessionMessages: (sessionId: string) => Promise<void>; selectedSessionId?: string; selectedTitle?: string; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> }) {
  const [attachments, setAttachments] = useState<NonNullable<ChatMessage['attachments']>>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const modeData = useJsonLoader(modes, [])
  const modeOptions = useMemo<ModeOption[]>(() => modeData.data?.modes?.length ? modeData.data.modes : [{ id: 'hermes-agent', label: 'Hermes Agent', source: 'default' }], [modeData.data])
  const [selectedMode, setSelectedMode] = useState('hermes-agent')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const isEmpty = messages.length <= 1 && messages[0]?.role === 'assistant' && /ready|fresh local chat/i.test(messages[0]?.content || '')
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length, busy, selectedTitle])

  useEffect(() => { if (modeData.data?.current) setSelectedMode(modeData.data.current) }, [modeData.data?.current])

  async function attachFiles(files: FileList | File[] | null) {
    if (!files?.length) return
    const next = await Promise.all(Array.from(files).map(async file => {
      const kind: 'image' | 'audio' | 'file' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file'
      const modelHint = kind === 'image' ? 'screenshot / vision input' : kind === 'audio' ? 'audio/transcription input' : 'general file context'
      const dataUrl = kind === 'image' ? await fileToDataUrl(file) : undefined
      return { dataUrl, kind, modelHint, name: file.name || screenshotName(file.type), type: file.type || 'application/octet-stream', url: dataUrl || URL.createObjectURL(file) }
    }))
    setAttachments(current => [...current, ...next])
  }

  async function attachClipboard(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.files || []).filter(file => file.type.startsWith('image/'))
    const imageItems = Array.from(event.clipboardData.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean) as File[]
    const images = imageFiles.length ? imageFiles : imageItems
    if (!images.length) return
    event.preventDefault()
    await attachFiles(images.map((file, index) => new File([file], file.name || screenshotName(file.type), { type: file.type || 'image/png', lastModified: Date.now() + index })))
  }

  async function submit() {
    if ((!input.trim() && !attachments?.length) || busy) return
    const now = Date.now() / 1000
    const userContent = buildUserContent(input, attachments)
    const attachNote = attachments?.length ? `\n\nAttachments: ${attachments.map(file => `${file.name} (${file.modelHint})`).join(', ')}` : ''
    const visibleText = `${messageTextFromContent(userContent)}${attachNote}`
    const next = [...messages, { role: 'user' as const, content: visibleText, timestamp: now, attachments }]
    setMessages(next); setInput(''); setAttachments([]); setBusy(true)
    try {
      const targetSessionId = selectedSessionId || await ensureSession(selectedMode)
      const res = await sessionChat(targetSessionId, userContent, selectedMode)
      const reply = res.message || { role: 'assistant' as const, content: JSON.stringify(res, null, 2) }
      setMessages([...next, { ...reply, timestamp: Date.now() / 1000 }])
      await refreshSessionMessages(res.session_id || targetSessionId)
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
    <div className={`messages chatReadable ${isEmpty ? 'isEmpty' : ''}`}>{!isEmpty && messages.map((message, index) => <article key={index} className={`msg ${message.role} ${index === messages.length - 1 ? 'latest' : ''}`} onContextMenu={event => contextActions.openMenu(event, `${message.role} message`, [
      { icon: Copy, label: 'Copy message', onSelect: () => contextActions.copyText(message.content) },
      { icon: Copy, label: 'Copy role + message', onSelect: () => contextActions.copyText(`${message.role}: ${message.content}`) },
      { icon: Clock, label: 'Copy timestamp', disabled: !message.timestamp, onSelect: () => contextActions.copyText(formatClock(message.timestamp)) }
    ])}>
      <div className="msgHeader"><b>{message.role}</b><span>{message.timestamp ? `${messageVerb(message.role)} ${formatClock(message.timestamp)}` : 'time unavailable'}</span></div>
      <pre>{message.content}</pre>
      {!!message.attachments?.length && <div className="attachmentPreview">{message.attachments.map(file => <div key={file.url} className="attachmentCard"><span>{file.kind === 'image' ? 'Image' : file.kind === 'audio' ? 'Audio' : 'File'}</span>{file.kind === 'image' && <img src={file.url} alt={file.name}/>} {file.kind === 'audio' && <audio src={file.url} controls/>}<b>{file.name}</b><small>{file.modelHint}</small></div>)}</div>}
    </article>)}<div ref={bottomRef} className="chatEnd" aria-hidden="true"/></div>
    <div className="composer chatgptComposer">
      <input id="chat-file-input" type="file" multiple accept="image/*,audio/*,.txt,.md,.pdf,.csv,.json" onChange={event => { void attachFiles(event.currentTarget.files); event.currentTarget.value = '' }} hidden />
      <button title="Attach image/audio/file" onClick={() => document.getElementById('chat-file-input')?.click()}><Plus size={20}/></button>
      <div className="composerStack">
        {!!attachments?.length && <div className="pendingAttachments">{attachments.map(file => <button key={file.url} onClick={() => setAttachments(current => current?.filter(item => item.url !== file.url))}>{file.kind}: {file.name} · {file.modelHint} ×</button>)}</div>}
        <textarea value={input} onPaste={event => { void attachClipboard(event) }} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder="Ask Hermes, or paste a screenshot..."/>
        <div className="composerMeta"><span>Mode</span><select value={selectedMode} onChange={event => setSelectedMode(event.target.value)}>{modeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>{modeData.error && <em>{modeData.error}</em>}</div>
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

function ProjectsView({ contextActions, selectedSessionId, sessionActions, titleOverrides }: { contextActions: ContextActions; selectedSessionId?: string; sessionActions: SessionActions; titleOverrides: Record<string, string> }) {
  const { data, error, loading } = useJsonLoader(sessions, [])
  const items = (asList(data) as SessionSummary[]).sort((a, b) => sessionActivity(b) - sessionActivity(a))
  const buckets = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older']
  return <main className="workspace"><section className="widePanel refinedPage projectsPage">
    <div className="pageTitle"><FolderKanban size={24}/><div><h2>Projects & chats</h2><p>Recent Hermes work, grouped like a clean chat history. Open one to continue from the latest message.</p></div></div>
    {loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}
    <div className="projectStats"><article><b>{items.length}</b><span>Total chats</span></article><article><b>{items.filter(s => sessionBucket(s) === 'Today').length}</b><span>Today</span></article><article><b>{items.reduce((sum, s) => sum + (s.message_count || 0), 0)}</b><span>Messages</span></article></div>
    <div className="historyGroups">{buckets.map(bucket => {
      const group = items.filter(session => sessionBucket(session) === bucket)
      if (!group.length) return null
      return <section key={bucket}><h3>{bucket}</h3><div className="historyList">{group.slice(0, 18).map(session => {
        const id = sessionId(session)
        return <button key={id} className={selectedSessionId === id ? 'selected' : ''} onClick={() => sessionActions.openSession(session)} onContextMenu={event => contextActions.openMenu(event, sessionTitle(session, titleOverrides), sessionMenu(session, sessionActions, contextActions, titleOverrides))}>
          <div><b>{sessionTitle(session, titleOverrides)}</b><p>{pickPreview(session)}</p></div><span>{formatClock(sessionActivity(session)) || readableId(id)}</span>
        </button>
      })}</div></section>
    })}</div>
  </section></main>
}

function ArtifactsView({ contextActions }: { contextActions: ContextActions }) {
  const { data, error, loading } = useJsonLoader(models, [])
  const rows = asList(data)
  return <main className="workspace"><section className="widePanel refinedPage artifactsPage" onContextMenu={event => contextActions.openMenu(event, 'Artifacts', [{ icon: Copy, label: 'Copy models JSON', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) }])}>
    <div className="pageTitle"><Box size={24}/><div><h2>Artifacts & model output</h2><p>A friendlier place for generated files, images, audio, and model capabilities.</p></div></div>
    {loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}
    <div className="artifactHero"><article><Image size={22}/><b>Images</b><span>Attach or generate visuals from chat.</span></article><article><Mic size={22}/><b>Audio</b><span>Attach voice clips or route to audio models.</span></article><article><Code2 size={22}/><b>Files</b><span>Keep code, documents, and exports organized.</span></article></div>
    <h3>AVAILABLE MODELS {rows.length || ''}</h3><div className="recordGrid polishedRecords">{rows.slice(0, 48).map((row: any, index) => <article key={row.id || row.name || index}><b>{row.label || row.name || row.id || `Model ${index + 1}`}</b><p>{row.description || row.owned_by || row.provider || 'Model available through Hermes.'}</p><small>{row.id || row.name || 'model'}</small></article>)}</div>
  </section></main>
}

function MemoryView({ contextActions, prefs }: { contextActions: ContextActions; prefs: UiPrefs }) {
  const caps = useJsonLoader(capabilities, [])
  const skillData = useJsonLoader(skills, [])
  const skillRows = asList(skillData.data)
  return <main className="workspace"><section className="widePanel refinedPage memoryPage" onContextMenu={event => contextActions.openMenu(event, 'Memory', [{ icon: Copy, label: 'Copy memory summary', onSelect: () => contextActions.copyText(shortJson({ capabilities: caps.data, skills: skillData.data }, 20000)) }])}>
    <div className="pageTitle"><Sparkles size={24}/><div><h2>Memory</h2><p>What Hermes can remember, reuse, and turn into repeatable workflows.</p></div></div>
    {(caps.loading || skillData.loading) && <p className="muted">Loading…</p>}{(caps.error || skillData.error) && <p className="warn">{caps.error || skillData.error}</p>}
    <div className="memoryTiles"><article><Brain size={22}/><b>User memory</b><span>Durable preferences and environment facts stay compact and reusable.</span></article><article><Wrench size={22}/><b>{skillRows.length || '—'} skills</b><span>Reusable playbooks Hermes can load for repeat tasks.</span></article><article><Database size={22}/><b>{String((caps.data?.features as any)?.tools ? 'Enabled' : 'Available')}</b><span>Tool and memory surfaces are reachable from this WebGUI.</span></article></div>
    <h3>RECENT PLAYBOOKS</h3><div className="skillList compactSkills">{skillRows.slice(0, 12).map((row: any, index) => { const rawName = row.name || row.id || `skill-${index + 1}`; return <article key={rawName}><div><b>{friendlySkillName(rawName)}</b><small>{rawName}</small></div><p>{row.description || 'Reusable Hermes workflow.'}</p></article> })}</div>
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
  const filtered = useMemo(() => toolCatalog.filter(tool => `${friendlyToolName(tool.name)} ${tool.name} ${friendlyToolsetName(tool.toolset)} ${tool.description}`.toLowerCase().includes(filter.toLowerCase())), [filter])
  const mostUseful = ['web_search', 'vision_analyze', 'image_generate', 'read_file', 'search_files', 'terminal', 'computer_use', 'delegate_task']
  const featured = filtered.filter(tool => mostUseful.includes(tool.name))
  const rest = filtered.filter(tool => !mostUseful.includes(tool.name))
  const toolsToShow = filter ? filtered : [...featured, ...rest]
  return <section className={`panel tools friendlyTools ${large ? 'large' : ''}`}>
    <div className="panelTitle"><Wrench/> Tools <span>{filtered.length}/{toolCatalog.length}</span></div>
    {large && <p className="toolIntro">Hermes tools are the things I can do for you — browse sites, use your desktop, read files, run commands, create images, remember preferences, and schedule work.</p>}
    <input className="toolSearch" placeholder="Search by what you want to do…" value={filter} onChange={event => setFilter(event.target.value)} />
    <div className="chips toolsetChips">{toolsets.map(toolset => <button key={toolset} onClick={() => setFilter(friendlyToolsetName(toolset))}>{friendlyToolsetName(toolset)}</button>)}</div>
    {!filter && <h3>MOST USEFUL</h3>}
    <div className="toolGrid">{toolsToShow.map(tool => <article key={tool.name} className={mostUseful.includes(tool.name) ? 'featuredTool' : ''} onContextMenu={event => contextActions.openMenu(event, friendlyToolName(tool.name), [{ icon: Copy, label: 'Copy tool name', onSelect: () => contextActions.copyText(tool.name) }, { icon: Copy, label: 'Copy tool JSON', onSelect: () => contextActions.copyText(shortJson(tool, 20000)) }, { icon: Search, label: `Show ${friendlyToolsetName(tool.toolset)}`, separatorBefore: true, onSelect: () => setFilter(friendlyToolsetName(tool.toolset)) }])}>
      <b>{friendlyToolName(tool.name)}</b><small>{friendlyToolsetName(tool.toolset)}</small><p>{friendlyToolDescription(tool.name, tool.description)}</p><code>{tool.name}</code>{!simplifyCards && <pre>{shortJson(tool, 500)}</pre>}{tool.requires && <em>Needs {tool.requires}</em>}
    </article>)}</div>
  </section>
}

function SkillsView({ contextActions, prefs }: { contextActions: ContextActions; prefs: UiPrefs }) {
  const { data, error, loading } = useJsonLoader(skills, [])
  const rows = asList(data)
  return <main className="workspace"><section className="widePanel friendlySkills" onContextMenu={event => contextActions.openMenu(event, 'Skills', [{ icon: Copy, label: 'Copy skills JSON', onSelect: () => contextActions.copyText(shortJson(data || error || {}, 20000)) }])}>
    <div className="pageTitle"><Wrench size={24}/><h2>Skills</h2></div>
    <p className="toolIntro">Skills are reusable playbooks Hermes can follow. Friendly names explain what each one helps with; the original skill name stays visible for power users.</p>
    {loading && <p className="muted">Loading…</p>}{error && <p className="warn">{error}</p>}
    <div className="skillList">{rows.slice(0, 80).map((row: any, index) => {
      const rawName = row.name || row.id || row.title || `skill-${index + 1}`
      return <article key={rawName}><div><b>{friendlySkillName(rawName)}</b><small>{row.category || row.domain || 'Hermes skill'} · <code>{rawName}</code></small></div><p>{row.description || row.summary || 'A reusable Hermes workflow for this kind of request.'}</p><button onClick={() => contextActions.copyText(rawName)}>Use name</button></article>
    })}</div>
  </section><ToolMatrix contextActions={contextActions} large simplifyCards={prefs.simplifyCards}/></main>
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

function BottomBar({ activeView, healthData, messages, selectedSession, sessionCount, setActiveView, setPrefs, prefs, yoloActive, yoloBusy, toggleYolo }: { activeView: View; healthData: Record<string, unknown> | null; messages: ChatMessage[]; selectedSession: SessionSummary | null; sessionCount: number; setActiveView: (view: View) => void; setPrefs: (prefs: UiPrefs) => void; prefs: UiPrefs; yoloActive: boolean; yoloBusy: boolean; toggleYolo: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => { const started = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000); return () => window.clearInterval(timer) }, [])
  const usedTokens = (selectedSession?.input_tokens || 0) + (selectedSession?.output_tokens || 0) + (selectedSession?.reasoning_tokens || 0)
  const tokenLimit = 272000
  const tokenPercent = Math.min(100, Math.round((usedTokens / tokenLimit) * 100))
  const version = String((healthData?.hermes as any)?.version || 'Hermes')
  const state = healthData?.hermesReachable ? 'Online' : 'Checking'
  return <footer className="bottomBar proBar">
    <div className="barGroup primaryStatus"><button title="Gateway health" onClick={() => setActiveView('capabilities')}><Circle size={10}/><b>{state}</b><span>Gateway</span></button><button title="Current view" onClick={() => setActiveView(activeView)}><Layers size={14}/><span>{activeView}</span></button></div>
    <div className="barGroup navShortcuts"><button onClick={() => setActiveView('messaging')}><MessageSquare size={14}/> Chats <b>{sessionCount || '—'}</b></button><button onClick={() => setActiveView('projects')}><FolderKanban size={14}/> Projects</button><button onClick={() => setActiveView('artifacts')}><Box size={14}/> Artifacts</button><button onClick={() => setActiveView('memory')}><Sparkles size={14}/> Memory</button><button onClick={() => setActiveView('skills')}><Wrench size={14}/> Tools</button></div>
    <button className="tokenMeter" title="Approximate selected-session token usage" onClick={() => setActiveView('messaging')}><span>{formatCompactNumber(usedTokens)}</span><i><b style={{ width: `${tokenPercent}%` }}/></i><span>{tokenPercent}%</span></button>
    <div className="barGroup utility"><button className={`yoloToggle ${yoloActive ? 'active' : ''}`} title={yoloActive ? 'YOLO mode is on: Hermes will skip command approval prompts.' : 'YOLO mode is off: Hermes asks before risky actions.'} onClick={toggleYolo} disabled={yoloBusy}><Zap size={14}/> <b>{yoloActive ? 'YOLO On' : 'Safe Mode'}</b></button><button title="Toggle compact density" onClick={() => setPrefs({ ...prefs, density: prefs.density === 'compact' ? 'cozy' : 'compact' })}>{prefs.density === 'compact' ? 'Compact' : 'Cozy'}</button><button title="Toggle tools/terminal rail" onClick={() => setPrefs({ ...prefs, showRightRail: !prefs.showRightRail })}><TerminalIcon size={14}/> Rail</button><button title="Hermes version" onClick={() => window.open('https://github.com/NousResearch/hermes-agent', '_blank', 'noopener,noreferrer')}><Hash size={14}/> {version}</button><span><Clock size={14}/> {formatDuration(elapsed)}</span></div>
    <span className="footerRight"><Monitor size={14}/> {selectedSession ? sessionTitle(selectedSession) : `${messages.length} visible messages`}</span>
  </footer>
}

function ActiveView({ activeView, contextActions, messages, prefs, selectedSessionId, selectedTitle, sessionActions, setMessages, setPrefs, titleOverrides }: { activeView: View; contextActions: ContextActions; messages: ChatMessage[]; prefs: UiPrefs; selectedSessionId?: string; selectedTitle?: string; sessionActions: SessionActions; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; setPrefs: (prefs: UiPrefs) => void; titleOverrides: Record<string, string> }) {
  if (activeView === 'capabilities') return <CapabilityView contextActions={contextActions} prefs={prefs} />
  if (activeView === 'messaging') return <MessagingView contextActions={contextActions} selectedSessionId={selectedSessionId} sessionActions={sessionActions} titleOverrides={titleOverrides}/>
  if (activeView === 'artifacts') return <ArtifactsView contextActions={contextActions} />
  if (activeView === 'projects') return <ProjectsView contextActions={contextActions} selectedSessionId={selectedSessionId} sessionActions={sessionActions} titleOverrides={titleOverrides} />
  if (activeView === 'memory') return <MemoryView contextActions={contextActions} prefs={prefs} />
  if (activeView === 'skills') return <SkillsView contextActions={contextActions} prefs={prefs} />
  if (activeView === 'settings') return <SettingsView contextActions={contextActions} prefs={prefs} setPrefs={setPrefs} />
  return <ChatPane contextActions={contextActions} ensureSession={sessionActions.ensureSession} messages={messages} refreshSessionMessages={sessionActions.refreshSessionMessages} selectedSessionId={selectedSessionId} selectedTitle={selectedTitle} setMessages={setMessages} />
}

function App() {
  const [activeView, setActiveView] = useState<View>('chat')
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null)
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'Hermes WebGUI is ready. Click a session in the left rail to load the conversation.', timestamp: Date.now() / 1000 }])
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('hermes-webgui:pinned') || '[]'))
  const [prefs, setPrefsState] = useState<UiPrefs>(loadPrefs)
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null)
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0)
  const [sessionCount, setSessionCount] = useState(0)
  const [yoloActive, setYoloActive] = useState(false)
  const [yoloBusy, setYoloBusy] = useState(false)
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(() => JSON.parse(localStorage.getItem('hermes-webgui:title-overrides') || '{}'))

  useEffect(() => { localStorage.setItem('hermes-webgui:prefs', JSON.stringify(prefs)); document.documentElement.style.setProperty('--accent', prefs.accent); document.documentElement.style.setProperty('--assistant-bubble', prefs.assistantBubble); document.documentElement.style.setProperty('--font-scale', String(prefs.fontScale)); document.documentElement.style.setProperty('--user-bubble', prefs.userBubble) }, [prefs])
  useEffect(() => { localStorage.setItem('hermes-webgui:pinned', JSON.stringify(pinnedIds)) }, [pinnedIds])
  useEffect(() => { localStorage.setItem('hermes-webgui:title-overrides', JSON.stringify(titleOverrides)) }, [titleOverrides])
  useEffect(() => { health().then(setHealthData).catch(() => setHealthData(null)); sessions().then(data => setSessionCount(asList(data).length)).catch(() => undefined) }, [])
  useEffect(() => { yolo().then(state => setYoloActive(state.enabled)).catch(() => setYoloActive(false)) }, [])

  function copyText(text: string) { void navigator.clipboard?.writeText(text).catch(() => undefined) }
  function setPrefs(next: UiPrefs) { setPrefsState(next) }
  const contextActions: ContextActions = { copyText, openMenu: (event, title, items) => { event.preventDefault(); event.stopPropagation(); setMenu({ items, title, x: event.clientX, y: event.clientY }) } }

  async function toggleYolo() {
    const next = !yoloActive
    setYoloActive(next)
    setYoloBusy(true)
    try {
      const state = await setYolo(next)
      setYoloActive(state.enabled)
    } catch {
      setYoloActive(!next)
    } finally {
      setYoloBusy(false)
    }
  }

  async function refreshSessionMessages(sessionId: string) {
    const response = await sessionMessages(sessionId)
    const records = asList(response) as SessionMessageRecord[]
    setMessages(normalizeMessages(records, prefs.showToolMessages))
    setSessionRefreshKey(key => key + 1)
  }

  async function ensureSession(model?: string) {
    if (selectedSession) return sessionId(selectedSession)
    const response = await createSession(model)
    const session = ((response as any).session || response) as SessionSummary
    const id = sessionId(session)
    if (!id) throw new Error('Hermes API did not return a session id')
    setSelectedSession(session)
    setSessionCount(count => Math.max(count, 0) + 1)
    setSessionRefreshKey(key => key + 1)
    return id
  }

  async function openSession(session: SessionSummary) {
    const id = sessionId(session)
    if (!id) return
    setActiveView('chat')
    setSelectedSession(session)
    setMessages([{ role: 'assistant', content: `Loading conversation: ${sessionTitle(session, titleOverrides)}…`, timestamp: Date.now() / 1000 }])
    try {
      await refreshSessionMessages(id)
    } catch (error) {
      setMessages([{ role: 'assistant', content: `Could not load session ${id}: ${error instanceof Error ? error.message : String(error)}`, timestamp: Date.now() / 1000 }])
    }
  }

  const sessionActions: SessionActions = {
    archiveSession: session => setMessages([{ role: 'assistant', content: `Archive requested for ${sessionTitle(session, titleOverrides)}. API support is pending; action recorded locally.`, timestamp: Date.now() / 1000 }]),
    branchSession: session => { const id = sessionId(session); window.open(`/?branch=${encodeURIComponent(id)}`, '_blank', 'noopener,noreferrer') },
    deleteSession: session => setMessages([{ role: 'assistant', content: `Delete requested for ${sessionTitle(session, titleOverrides)}. Destructive API support is pending; no remote deletion was performed.`, timestamp: Date.now() / 1000 }]),
    ensureSession,
    exportSession: async session => { const id = sessionId(session); const response = await sessionMessages(id); downloadText(`${id || 'session'}.json`, shortJson(response, 1000000)) },
    openSession,
    openSessionWindow: session => window.open(`/?session=${encodeURIComponent(sessionId(session))}`, '_blank', 'noopener,noreferrer'),
    pinSession: session => setPinnedIds(ids => ids.includes(sessionId(session)) ? ids : [sessionId(session), ...ids]),
    refreshSessionMessages,
    renameSession: session => { const id = sessionId(session); const next = window.prompt('Rename session locally', sessionTitle(session, titleOverrides)); if (next) setTitleOverrides(current => ({ ...current, [id]: next })) }
  }

  async function startNewSession() {
    setActiveView('chat')
    setMessages([{ role: 'assistant', content: 'Starting a fresh Hermes session…', timestamp: Date.now() / 1000 }])
    try {
      const response = await createSession()
      const session = ((response as any).session || response) as SessionSummary
      setSelectedSession(session)
      setSessionCount(count => Math.max(count, 0) + 1)
      setSessionRefreshKey(key => key + 1)
      setMessages([{ role: 'assistant', content: 'Fresh Hermes session ready. Messages sent here will be saved to Desktop history.', timestamp: Date.now() / 1000 }])
    } catch (error) {
      setSelectedSession(null)
      setMessages([{ role: 'assistant', content: `Could not create a Hermes session yet: ${error instanceof Error ? error.message : String(error)}`, timestamp: Date.now() / 1000 }])
    }
  }

  return <div className={`app density-${prefs.density} ${prefs.showRightRail ? '' : 'noRightRail'}`}>
    <Sidebar activeView={activeView} contextActions={contextActions} pinnedIds={pinnedIds} selectedSessionId={selectedSession ? sessionId(selectedSession) : undefined} sessionActions={sessionActions} sessionRefreshKey={sessionRefreshKey} setActiveView={setActiveView} startNewSession={startNewSession} titleOverrides={titleOverrides}/>
    <ActiveView activeView={activeView} contextActions={contextActions} messages={messages} prefs={prefs} selectedSessionId={selectedSession ? sessionId(selectedSession) : undefined} selectedTitle={selectedSession ? sessionTitle(selectedSession, titleOverrides) : undefined} sessionActions={sessionActions} setMessages={setMessages} setPrefs={setPrefs} titleOverrides={titleOverrides}/>
    <RightRail contextActions={contextActions} prefs={prefs}/>
    <ContextMenuOverlay menu={menu} close={() => setMenu(null)}/>
    <BottomBar activeView={activeView} healthData={healthData} selectedSession={selectedSession} sessionCount={sessionCount} messages={messages} setActiveView={setActiveView} setPrefs={setPrefs} prefs={prefs} yoloActive={yoloActive} yoloBusy={yoloBusy} toggleYolo={() => { void toggleYolo() }}/>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
