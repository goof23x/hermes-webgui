export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  timestamp?: number
}

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
export function sessions() { return api<Record<string, unknown>>('/api/webgui/sessions') }
export function sessionMessages(sessionId: string) { return api<Record<string, unknown>>(`/api/webgui/sessions/${encodeURIComponent(sessionId)}/messages`) }
export function skills() { return api<Record<string, unknown>>('/api/webgui/skills') }
export function toolsetsApi() { return api<Record<string, unknown>>('/api/webgui/toolsets') }
export async function createSession() { return api<Record<string, unknown>>('/api/webgui/sessions', { method: 'POST', body: '{}' }) }
export async function chat(messages: ChatMessage[], sessionId?: string) {
  const apiMessages = messages
    .filter(message => message.role !== 'tool')
    .map(({ role, content }) => ({ role, content }))
  return api<{ choices?: Array<{ message: ChatMessage }> }>('/api/webgui/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: apiMessages, sessionId })
  })
}
