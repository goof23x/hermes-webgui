import express from 'express'
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

app.post('/api/webgui/sessions', async (_req, res) => {
  try {
    const session = await proxyHermes('/api/sessions', { method: 'POST', body: '{}' })
    res.status(session.status).json(session.body)
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
