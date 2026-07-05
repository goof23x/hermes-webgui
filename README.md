# Hermes WebGUI

A browser-hosted Hermes Desktop parity shell. It is intended to put the Hermes Desktop experience on a web server while reusing the real Hermes Agent API server instead of reimplementing the agent core.

## What is included

- Desktop-like three-pane UI: sessions/nav, chat canvas, right rail.
- Hermes API Server integration (`/v1/chat/completions`, `/v1/models`, `/v1/capabilities`, sessions API).
- Web terminal using `node-pty` + Socket.IO.
- Capabilities/tools view listing the Hermes Desktop/API tool surface: browser, terminal, files, code execution, delegation, cron, memory, skills, session search, computer-use, project, image/video/TTS, home assistant, Discord, Spotify, kanban, X search, and more.
- Designed to serve the UI on port **9119** and the API helper server on **9120**.

## Architecture

```text
Browser (:9119 Vite or static build)
  -> Hermes WebGUI server (:9120 Express + Socket.IO)
       -> Hermes API Server (:8642, OpenAI-compatible)
       -> local shell PTY for web terminal
```

Hermes itself remains authoritative for model routing, tools, approvals, memory, sessions, skills, and gateway behavior.

## Prerequisites

1. Hermes gateway API Server enabled and listening (normally `http://127.0.0.1:8642`).
2. If your Hermes API server is protected, export the same key for this server:

```bash
export HERMES_API_KEY="$API_SERVER_KEY"
```

## Development

```bash
npm install
npm run dev
# open http://127.0.0.1:9119
```

## Production-ish local serving

```bash
npm run build
npm run server:build
PORT=9119 node dist-server/index.js
```

For a split deployment, keep `PORT=9120` for the API server and serve `dist/` with any static web server.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9120` | Express/Socket.IO server port |
| `HERMES_API_URL` | `http://127.0.0.1:8642` | Hermes API Server origin |
| `HERMES_API_KEY` / `API_SERVER_KEY` | empty | Bearer token for Hermes API Server |
| `HERMES_TERMINAL_CWD` | process cwd | Starting directory for the web terminal |

## Roadmap

- Streamed run/event UI using `/v1/runs/{id}/events`.
- Full persisted session CRUD/fork controls.
- Browser-based approvals for dangerous tool calls.
- Artifacts/media gallery backed by Hermes session files.
- Messaging/gateway setup forms mirroring Desktop's platform cards.
- Tool invocation inspectors for every tool result.
- Authentication and multi-user isolation for LAN/internet exposure.

## Security note

This exposes shell access in a browser. Bind only to trusted networks, put it behind authentication, and do not expose it directly to the public internet.
