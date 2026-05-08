<p align="center">
  <img alt="tota-agent" src="public/tota-agent-txt.png" width="340">
</p>

<p align="center">
  <strong>Soul-driven AI agent with permission-hardened tools, token budgets, and multi-channel access.</strong>
</p>

<p align="center">
  Remembers what matters. Asks before it acts. Runs 24/7 from CLI, Telegram, or REST API.<br>
  40+ built-in tools · Web search · Vision · Code sandbox · MCP plugins · Extensible skills · SQLite-backed Second Brain memory.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tota-agent"><img src="https://img.shields.io/npm/v/tota-agent?color=blue" alt="npm"></a>
  <a href="https://github.com/manu14357/tota-agent/blob/main/LICENSE"><img src="https://img.shields.io/github/license/manu14357/tota-agent" alt="license"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/tota-agent" alt="node"></a>
  <a href="https://github.com/manu14357/tota-agent"><img src="https://img.shields.io/github/stars/manu14357/tota-agent?style=social" alt="stars"></a>
</p>

---

## Quick Start

```bash
npx tota-agent
```

Or install globally:

```bash
npm i -g tota-agent
tota
```

First run launches the setup wizard — enter your name, an API key, and optionally a Telegram bot token. Takes about 30 seconds.

To reconfigure at any time:

```bash
tota doctor
```

---

## Why tota?

Every AI agent can read files and run commands. Most do it silently. **tota asks first — and remembers what matters.**

| Feature | What it means |
|---------|--------------|
| **Permission-hardened** | Shell blocklist, folder-level scoping, per-session approval modes. No surprises. |
| **Second Brain** | Persistent SQLite memory with FTS5 search. 10 memory types. Learns your preferences automatically. |
| **Soul-driven** | Personality from markdown files you own (`~/.tota/soul/`). No corporate wrapper. |
| **Token-aware** | Daily budget with auto-concise at 70%. `/budget` command to check, reset, or override. |
| **Live streaming** | Real-time token streaming on CLI with markdown re-render. Telegram streaming with editable messages. |
| **Always on** | Daemon mode with crash recovery and system service (macOS, Linux, Windows). |
| **Web search** | Built-in web search via Brave, Serper, or Tavily. Auto-detects from env keys. |
| **Vision** | Analyze local images and URLs with your AI provider's vision capabilities. |
| **Code sandbox** | Execute Python, JavaScript, Bash, TypeScript, Ruby, and Go in an isolated temp sandbox. |
| **Task delegation** | Agent can spawn sub-tasks and delegate to itself for complex multi-step workflows. |
| **MCP plugins** | Connect any MCP-compatible tool server over HTTP — tools appear instantly in the agent. |
| **REST API channel** | Control tota programmatically over HTTP with optional bearer-token auth. |
| **Extensible** | Install community skills with one command. Schedule skills as recurring tasks. |

---

## Daemon Mode

One command to make tota persistent:

```bash
tota up
```

This installs the system service, starts the background daemon, and confirms everything is running. If tota is already running, it just shows the PID.

```bash
tota restart      # Restart the background process
tota stop         # Stop the background process
tota start -d     # Start in background (no service install)
tota logs         # View recent daemon logs
tota status       # Show if daemon is running
```

### System Service (auto-start on boot)

`tota up` installs this automatically. Manage it directly:

```bash
tota service install
tota service status
tota service uninstall
```

| Platform | Method | Requires Admin |
|----------|--------|---------------|
| **macOS** | LaunchAgent (`~/Library/LaunchAgents/`) | No |
| **Linux** | systemd user unit (`~/.config/systemd/user/`) | No |
| **Windows** | Task Scheduler (`schtasks`) | No |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `tota up` | Install service + start daemon + confirm running |
| `tota` | Start the agent |
| `tota start` | Start in foreground |
| `tota start -d` | Start in background |
| `tota restart` | Restart background process |
| `tota stop` | Stop background process |
| `tota logs` | View daemon logs |
| `tota doctor` | Reconfigure (Enter to keep current values) |
| `tota setup` | Re-run setup wizard |
| `tota status` | Show config and daemon status |
| `tota help` | Show full manual |
| `tota upgrade` | Upgrade to latest version |
| `tota telegram list` | List Telegram users |
| `tota telegram approve <code>` | Approve a pairing code |
| `tota telegram reject <id>` | Reject a pending request |
| `tota telegram remove <id>` | Remove an approved user |
| `tota telegram promote <id>` | Promote member to admin |
| `tota telegram demote <id>` | Demote admin to member |
| `tota telegram reset` | Clear all Telegram access |
| `tota service install` | Install system service |
| `tota service uninstall` | Uninstall system service |
| `tota service status` | Show service status |
| `tota --verbose` | Start with debug logging |

---

## In-Chat Commands

These work on both CLI and Telegram and do not consume API tokens.

| Command | Description |
|---------|-------------|
| `/help` | Show full manual |
| `/status` | Show config, budget, usage |
| `/tools` | List loaded tools |
| `/skills` | List installed skills |
| `/stream` | Toggle Telegram streaming |
| `/budget` | Show token budget |
| `/budget override` | Override budget for one request |
| `/budget reset` | Reset usage to zero |
| `/budget set <n>` | Change daily budget |
| `/permissions` | Change permission mode |
| `/tasks` | List scheduled tasks |
| `/memory` | View and manage Second Brain |
| `/unpair` | Reset all Telegram access |

---

## Built-in Tools

| Category | Tools |
|----------|-------|
| **Filesystem** | `read_file`, `write_file`, `create_file`, `edit_file`, `list_dir`, `delete_file`, `send_file`, `approve_scope` |
| **Shell** | `run_command`, `cd`, `approve_command` |
| **Code sandbox** | `run_code` — execute Python / JS / Bash / TS / Ruby / Go in an isolated sandbox |
| **Messaging** | `send_message` |
| **Git** | `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`, `git_push` |
| **Web** | `fetch_url`, `web_search` — search via Brave, Serper, or Tavily |
| **Vision** | `analyze_image` — analyze local images or image URLs |
| **Delegation** | `delegate_task` — spawn a focused sub-agent for a sub-task |
| **Skills** | `install_skill`, `list_skills`, `use_skill` |
| **Scheduler** | `schedule_task`, `list_scheduled_tasks`, `cancel_scheduled_task` |
| **System** | `budget_status` |
| **MCP** | `mcp_<server>_<tool>` — tools loaded dynamically from MCP servers |

---

## Web Search

tota can search the web using three providers — set one API key and it works automatically.

| Provider | Env Var | Sign up |
|----------|---------|---------|
| **Brave Search** | `BRAVE_API_KEY` | [brave.com/search/api](https://brave.com/search/api/) |
| **Serper** | `SERPER_API_KEY` | [serper.dev](https://serper.dev) |
| **Tavily** | `TAVILY_API_KEY` | [tavily.com](https://tavily.com) |

Auto-detection: if `WEB_SEARCH_PROVIDER=auto` (default), tota picks whichever key it finds. Or pin a specific provider:

```bash
# ~/.tota/.env
WEB_SEARCH_PROVIDER=brave
BRAVE_API_KEY=your-key-here
```

Disable entirely: `WEB_SEARCH_ENABLED=false`

---

## Vision / Image Analysis

tota can analyze images — local files or URLs — using your provider's vision model.

```
Analyze this screenshot: /path/to/screenshot.png
What's in this image? https://example.com/chart.jpg
```

The `analyze_image` tool automatically detects MIME types from magic bytes, supports JPEG, PNG, GIF, and WebP, and works with any provider that supports vision.

---

## Code Sandbox

The `run_code` tool executes code in an isolated temporary directory — no access to your project files.

Supported languages: **Python**, **JavaScript (Node.js)**, **Bash**, **TypeScript**, **Ruby**, **Go**

```
Run this Python script and show me the output:
  import json; print(json.dumps({"x": 42}))
```

- Timeout: 30 s default, configurable up to 120 s
- Output capped at 8,000 characters
- Sandbox cleaned up after each run
- Accepts optional stdin input

---

## REST API Channel

Control tota programmatically over HTTP:

```bash
# Enable in ~/.tota/.env
API_CHANNEL_ENABLED=true
API_CHANNEL_PORT=3001
API_CHANNEL_KEY=your-secret-key   # optional
```

**Endpoints:**

```
GET  /status          → { "status": "ok", "ready": true }
POST /message         → { "content": "your message", "timeout": 30 }
                      ← { "requestId": "...", "response": "..." }
```

**Authentication** (if `API_CHANNEL_KEY` set):
```
Authorization: Bearer your-secret-key
# or
X-Api-Key: your-secret-key
```

---

## MCP Plugins

Connect any [Model Context Protocol](https://modelcontextprotocol.io) server to tota. Tools load automatically at startup and appear with the prefix `mcp_<server>_<tool>`.

```yaml
# ~/.tota/tota.yaml
mcp:
  servers:
    - name: filesystem
      url: http://localhost:8080/mcp
      enabled: true
    - name: my-db
      url: http://localhost:9090/mcp
      apiKey: secret-token
      enabled: true
```

Any MCP server speaking the JSON-RPC `tools/list` + `tools/call` protocol over HTTP is supported.

---

## Second Brain

tota builds structured persistent memory that grows with every conversation.

- **10 memory types** — identity, preference, goal, project, habit, decision, constraint, relationship, episode, reflection
- **Automatic extraction** — after each response, 0–3 facts extracted with confidence, importance, and durability scores
- **Relevant recall** — top 5 matching memories (900-char budget) injected before each message
- **Auto-consolidation** — every 60 min: profile summary, active-state summary, reflections from patterns
- **Conflict resolution** — opposing memories resolved by confidence (higher wins) or recency
- **Auto-pruning** — active memories stale after 21 days; inferred memories decay; low-confidence dismissed after 120 days
- **User controls** — `/memory` for overview, search, pause, resume, clear
- **Disable** — set `SECOND_BRAIN_ENABLED=false` or `memory.secondBrain.enabled: false` in config

All data stored locally at `~/.tota/memory/second-brain/second-brain.db`. No cloud.

---

## Configuration

All runtime data lives in `~/.tota/`.

| Path | Purpose |
|------|---------|
| `~/.tota/tota.yaml` | Main config (providers, channels, budget) |
| `~/.tota/.env` | API keys and tokens |
| `~/.tota/soul/*.md` | Agent personality files |
| `~/.tota/permissions.yaml` | Capabilities and approval rules |
| `~/.tota/skills/` | Installed skills |
| `~/.tota/schedules.yaml` | Scheduled tasks |
| `~/.tota/token-usage.json` | Daily token usage |
| `~/.tota/memory/` | All memory data |
| `~/.tota/daemon.pid` | Background process PID |
| `~/.tota/daemon.log` | Daemon logs |

---

## Providers

| Provider | Default Model | API Key Env |
|----------|--------------|-------------|
| **DeepSeek** | deepseek-chat | `DEEPSEEK_API_KEY` |
| **OpenAI** | gpt-4o-mini | `OPENAI_API_KEY` |
| **Anthropic** | claude-sonnet-4 | `ANTHROPIC_API_KEY` |
| **Grok (xAI)** | grok-4 | `GROK_API_KEY` |
| **Ollama Cloud** | gpt-oss:120b | `OLLAMA_CLOUD_API_KEY` |
| **Ollama Local** | gpt-oss:20b | — |
| **OpenAI-compat** | custom | `OPENAI_COMPAT_BASE_URL` |

tota tries providers in order and falls back automatically on failure.

---

## Telegram Access

tota uses an organization access model with admins and members.

1. Send `/start` to your bot → receive a pairing code
2. Run `tota telegram approve <code>` in CLI → you become the first admin
3. Additional users send `/start` → admins approve from CLI
4. Admins: approve/reject requests, promote/demote users, reset access
5. Members: chat with tota

Private chats only. Group messages are always ignored.

---

## Architecture

- **TypeScript + Node.js 20+** — ESM, tsup build
- **Vercel AI SDK v6** — `generateText` + `streamText`, 50-step (configurable) agentic loop, provider fallback
- **grammY** — Telegram bot with typing indicators, editable streaming, file uploads
- **REST API channel** — Node.js `http.createServer`, bearer-token auth, request/response pairing
- **SQLite + FTS5** — Second Brain with full-text search and auto-consolidation
- **JSONL** — Short-term, long-term, and episodic conversation memory
- **Custom daemon manager** — Background spawn + PID file + watchdog crash recovery
- **Platform services** — macOS LaunchAgent, Linux systemd, Windows Task Scheduler
- **MCP loader** — JSON-RPC `tools/list` + `tools/call` over HTTP, dynamic tool registration
- **Code sandbox** — Isolated `os.tmpdir()/tota-sandbox/<runId>/` with cleanup after each run
- **Tool truncation** — All tool outputs capped at 12,000 chars with clear truncation notice

---

## Contributing

Contributions welcome. Please read the guidelines before submitting.

- Fork the repo: <https://github.com/manu14357/tota-agent>
- Run `npm install` and `npm run build`
- Test locally with `tota`
- Open a PR with a clear description

---

## License

MIT © [manu14357](https://github.com/manu14357)

---

> **Disclaimer:** This is AI software. Use at your own risk.
