# 🧡 Claude Chat

A Claude.ai-style chat frontend that connects to **any third-party relay/proxy API** (中转站), not the official Anthropic API.

**No login page** — directly open chat. API configuration in sidebar.

## Features

- 💬 **Streaming Chat** — Real-time SSE streaming with thinking/thought process display
- 🛠️ **Tool Use** — 12 built-in tools (weather, time, memory, notes, Ombre Brain, project files)
- 🧠 **Ombre Brain** — Memory integration with auto breath-hook injection
- 📂 **Projects** — Create projects, upload files, per-project instructions injected into system prompt
- 🎤 **Voice Recognition** — Web Speech API (zh-CN/en-US)
- 📎 **File Upload** — Drag & drop images and files into chat
- 📋 **Export** — Export conversations as Markdown or JSON
- 🌙 **Dark/Light Theme** — Toggle or follow system preference
- ⏹️ **Stop Generation** — Abort streaming responses mid-way
- 📱 **Mobile Responsive** — Touch-optimized, safe-area aware
- 🔐 **No Gate** — Open directly to chat, configure API in sidebar

## Quick Start

### Local Development

```bash
npm install
node backend.js
# Open http://localhost:4567
```

### Docker

```bash
docker compose up -d
# Open http://localhost:4567
```

### VPS Deployment

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/claude-chat.git
cd claude-chat

# Start with Docker
docker compose up -d

# Or without Docker
npm install
node backend.js
```

## Configuration

1. Open the sidebar (☰ menu)
2. Enter your **Base URL** (relay/proxy API endpoint, e.g. `https://your-relay.com`)
3. Enter your **API Key**
4. Click **Save** — you're ready to chat!

### Optional: Ombre Brain

In the sidebar, enter your Ombre Brain password to enable memory tools. The breath-hook is automatically injected into the system prompt.

## Tech Stack

- **Frontend**: Single-file SPA (`static/index.html`) from original design, heavily patched
- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **Streaming**: SSE proxy with Anthropic format conversion
- **Tools**: Custom tool execution loop (weather, time, memory, notes, Ombre Brain, project files)

## Project Structure

```
├── backend.js          # Express + SQLite backend
├── static/
│   ├── index.html      # Main SPA (~389KB)
│   ├── design-system.css
│   └── marked.min.js
├── data/               # Auto-created (SQLite + uploads)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT
