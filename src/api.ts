export type ChatAttachment = { dataUrl?: string; kind: 'image' | 'audio' | 'file'; name: string; type: string; url: string; modelHint: string }

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  timestamp?: number
  attachments?: ChatAttachment[]
}

export type ModeOption = { id: string; label: string; model?: string; provider?: string; source?: string }
export type YoloState = { enabled: boolean; mode: string }

export type SessionSummary = {
  id?: string
  session_id?: string
  title?: string | null
  name?: string | null
  message_count?: number
  tool_call_count?: number
  input_tokens?: number
  output_tokens?: number
  reasoning_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  last_active?: number
  started_at?: number
  ended_at?: number | null
  source?: string | null
  model?: string | null
  preview?: string | null
}

export type SessionMessageRecord = {
  id?: number | string
  role: ChatMessage['role'] | string
  content?: string | null
  tool_calls?: unknown
  tool_name?: string | null
  timestamp?: number
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message || body?.error || body?.message || `${res.status} ${res.statusText}`)
  return body as T
}

export function health() { return api<Record<string, unknown>>('/api/webgui/health') }
export function capabilities() { return api<Record<string, unknown>>('/api/webgui/capabilities') }
export function models() { return api<Record<string, unknown>>('/api/webgui/models') }
export function modes() { return api<{ modes: ModeOption[]; current?: string }>('/api/webgui/modes') }
export function yolo() { return api<YoloState>('/api/webgui/yolo') }
export function setYolo(enabled: boolean) { return api<YoloState>('/api/webgui/yolo', { method: 'POST', body: JSON.stringify({ enabled }) }) }
export function sessions() { return api<Record<string, unknown>>('/api/webgui/sessions') }
export function sessionMessages(sessionId: string) { return api<Record<string, unknown>>(`/api/webgui/sessions/${encodeURIComponent(sessionId)}/messages`) }
export function skills() { return api<Record<string, unknown>>('/api/webgui/skills') }
export function toolsetsApi() { return api<Record<string, unknown>>('/api/webgui/toolsets') }
export async function createSession(model?: string) { return api<Record<string, unknown>>('/api/webgui/sessions', { method: 'POST', body: JSON.stringify(model ? { model } : {}) }) }
export async function sessionChat(sessionId: string, message: string | Array<Record<string, unknown>>, model?: string) {
  return api<{ session_id?: string; message?: ChatMessage; usage?: Record<string, number> }>(`/api/webgui/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, ...(model ? { model } : {}) })
  })
}
export async function chat(messages: ChatMessage[], sessionId?: string) {
  const apiMessages = messages
    .filter(message => message.role !== 'tool')
    .map(({ role, content }) => ({ role, content }))
  return api<{ choices?: Array<{ message: ChatMessage }> }>('/api/webgui/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: apiMessages, sessionId })
  })
}
