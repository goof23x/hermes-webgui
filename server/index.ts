import express from 'express'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import pty from 'node-pty'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: true, credentials: true } })

const PORT = Number(process.env.PORT || 9120)
const HERMES_API_URL = (process.env.HERMES_API_URL || 'http://127.0.0.1:8642').replace(/\/$/, '')
const HERMES_API_KEY = process.env.HERMES_API_KEY || process.env.API_SERVER_KEY || ''
const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')

app.use(express.json({ limit: '20mb' }))

function hermesHeaders(extra: HeadersInit = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(extra as Record<string, string>) }
  if (HERMES_API_KEY) headers.authorization = `Bearer ${HERMES_API_KEY}`
  return headers
}

async function proxyHermes(pathname: string, init: RequestInit = {}) {
  const res = await fetch(`${HERMES_API_URL}${pathname}`, {
    ...init,
    headers: hermesHeaders(init.headers)
  })
  const text = await res.text()
  let body: unknown = text
  try { body = text ? JSON.parse(text) : null } catch {}
  return { ok: res.ok, status: res.status, body }
}

function configuredModelFallback() {
  try {
    const text = fs.readFileSync(path.join(HERMES_HOME, 'config.yaml'), 'utf8')
    const current = text.match(/^model:\s*[\s\S]*?^\s{2}default:\s*([^\n#]+)/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || 'hermes-agent'
    const provider = text.match(/^model:\s*[\s\S]*?^\s{2}provider:\s*([^\n#]+)/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || 'configured'
    return { current: 'hermes-agent', modes: [{ id: 'hermes-agent', label: `${current} (${provider})`, model: current, provider, source: 'config.yaml' }] }
  } catch {
    return { current: 'hermes-agent', modes: [{ id: 'hermes-agent', label: 'Hermes Agent', source: 'default' }] }
  }
}

function normalizeModes(body: any) {
  const fallback = configuredModelFallback()
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : []
  const modes = rows.map((row: any) => {
    const id = String(row.id || row.name || row.model || '').trim()
    if (!id) return null
    const root = row.root && row.root !== id ? ` → ${row.root}` : ''
    return { id, label: `${id}${root}`, model: row.root || id, provider: row.owned_by || row.provider || 'hermes', source: 'api-server' }
  }).filter(Boolean)
  return { current: modes[0]?.id || fallback.current, modes: modes.length ? modes : fallback.modes }
}

function configPath() { return path.join(HERMES_HOME, 'config.yaml') }

function readYoloState() {
  try {
    const text = fs.readFileSync(configPath(), 'utf8')
    const mode = text.match(/^approvals:\s*[\s\S]*?^\s{2}mode:\s*([^\n#]+)/m)?.[1]?.trim().replace(/^[\"']|[\"']$/g, '') || 'manual'
    return { enabled: mode === 'off', mode }
  } catch {
    return { enabled: false, mode: 'manual' }
  }
}

function writeYoloState(enabled: boolean) {
  const file = configPath()
  const previousPath = path.join(HERMES_HOME, '.webgui-yolo-previous-mode')
  const current = readYoloState().mode
  if (enabled && current !== 'off') fs.writeFileSync(previousPath, current)
  const restored = (() => {
    try { return fs.readFileSync(previousPath, 'utf8').trim() || 'manual' } catch { return 'manual' }
  })()
  const mode = enabled ? 'off' : restored
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch {}
  if (/^approvals:\s*$/m.test(text)) {
    if (/^approvals:\s*[\s\S]*?^\s{2}mode:\s*[^\n#]+/m.test(text)) text = text.replace(/^approvals:\s*[\s\S]*?^\s{2}mode:\s*[^\n#]+/m, match => match.replace(/^\s{2}mode:\s*[^\n#]+/m, `  mode: ${mode}`))
    else text = text.replace(/^approvals:\s*$/m, `approvals:\n  mode: ${mode}`)
  } else {
    text = `${text.trimEnd()}\n\napprovals:\n  mode: ${mode}\n`
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return { enabled, mode }
}

app.get('/api/webgui/health', async (_req, res) => {
  const checks: Record<string, unknown> = { webgui: 'ok', hermesApiUrl: HERMES_API_URL, apiKeyConfigured: Boolean(HERMES_API_KEY) }
  try {
    const health = await proxyHermes('/health')
    checks.hermes = health.body
    checks.hermesReachable = health.ok
    res.status(health.ok ? 200 : 503).json(checks)
  } catch (error) {
    checks.hermesReachable = false
    checks.error = error instanceof Error ? error.message : String(error)
    res.status(503).json(checks)
  }
})

app.get('/api/webgui/capabilities', async (_req, res) => {
  try {
    const capabilities = await proxyHermes('/v1/capabilities')
    res.status(capabilities.status).json(capabilities.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error), fallback: true })
  }
})

app.get('/api/webgui/models', async (_req, res) => {
  try {
    const models = await proxyHermes('/v1/models')
    res.status(models.status).json(models.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/webgui/modes', async (_req, res) => {
  try {
    const models = await proxyHermes('/v1/models')
    if (models.ok) return res.json(normalizeModes(models.body))
    res.status(200).json({ ...configuredModelFallback(), warning: typeof models.body === 'object' ? (models.body as any)?.error : models.body })
  } catch (error) {
    res.status(200).json({ ...configuredModelFallback(), warning: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/webgui/yolo', (_req, res) => {
  res.json(readYoloState())
})

app.post('/api/webgui/yolo', (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled)
    res.json(writeYoloState(enabled))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/webgui/skills', async (_req, res) => {
  try {
    const skills = await proxyHermes('/v1/skills')
    res.status(skills.status).json(skills.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/webgui/toolsets', async (_req, res) => {
  try {
    const toolsets = await proxyHermes('/v1/toolsets')
    res.status(toolsets.status).json(toolsets.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/webgui/sessions', async (_req, res) => {
  try {
    const sessions = await proxyHermes('/api/sessions?limit=60&order=recent')
    res.status(sessions.status).json(sessions.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/webgui/sessions/:sessionId/messages', async (req, res) => {
  try {
    const messages = await proxyHermes(`/api/sessions/${encodeURIComponent(req.params.sessionId)}/messages`)
    res.status(messages.status).json(messages.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/webgui/sessions', async (_req, res) => {
  try {
    const session = await proxyHermes('/api/sessions', { method: 'POST', body: '{}' })
    res.status(session.status).json(session.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/webgui/sessions/:sessionId/chat', async (req, res) => {
  try {
    const chat = await proxyHermes(`/api/sessions/${encodeURIComponent(req.params.sessionId)}/chat`, {
      method: 'POST',
      body: JSON.stringify(req.body ?? {})
    })
    res.status(chat.status).json(chat.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/webgui/chat', async (req, res) => {
  const { messages, model = 'hermes-agent', sessionId } = req.body ?? {}
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] is required' })
  try {
    const response = await proxyHermes('/v1/chat/completions', {
      method: 'POST',
      headers: sessionId ? { 'X-Hermes-Session-Id': String(sessionId) } : {},
      body: JSON.stringify({ model, messages, stream: false })
    })
    res.status(response.status).json(response.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/*path', async (req, res) => {
  const raw = req.params.path
  const suffix = Array.isArray(raw) ? raw.join('/') : raw
  try {
    const response = await proxyHermes(`/api/${suffix}`, { method: 'POST', body: JSON.stringify(req.body ?? {}) })
    res.status(response.status).json(response.body)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.use(express.static(path.resolve(__dirname, '..', 'dist')))
app.get('*splat', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'dist', 'index.html'))
})

io.on('connection', socket => {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.env.HERMES_TERMINAL_CWD || process.cwd(),
    env: process.env
  })
  term.onData(data => socket.emit('terminal:data', data))
  socket.on('terminal:input', data => term.write(String(data)))
  socket.on('terminal:resize', ({ cols, rows }) => term.resize(Number(cols) || 100, Number(rows) || 30))
  socket.on('disconnect', () => term.kill())
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hermes WebGUI server listening on http://0.0.0.0:${PORT}`)
  console.log(`Proxying Hermes API at ${HERMES_API_URL}`)
})
