export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

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
export function skills() { return api<Record<string, unknown>>('/api/webgui/skills') }
export function toolsetsApi() { return api<Record<string, unknown>>('/api/webgui/toolsets') }
export async function createSession() { return api<Record<string, unknown>>('/api/webgui/sessions', { method: 'POST', body: '{}' }) }
export async function chat(messages: ChatMessage[], sessionId?: string) {
  return api<{ choices?: Array<{ message: ChatMessage }> }>('/api/webgui/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, sessionId })
  })
}
