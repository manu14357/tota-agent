# Changelog

All notable changes to tota-agent will be documented here.

## 0.0.2 — (2026-05-08)

### New Tools

- **`web_search`** — Web search via Brave, Serper, or Tavily; auto-detected from env keys; results as numbered markdown
- **`analyze_image`** — Vision tool; analyze local images or URLs; auto-detects MIME type from magic bytes
- **`run_code`** — Code sandbox; execute Python, JavaScript, TypeScript, Bash, Ruby, Go in an isolated temp dir; auto-cleanup
- **`delegate_task`** — Spawn a focused sub-agent for complex sub-tasks and return the result
- **`mcp_<server>_<tool>`** — MCP plugin tools; connect any JSON-RPC MCP server over HTTP

### New Channels

- **REST API Channel** — HTTP server (default port 3001); `GET /status`, `POST /message`; optional Bearer / X-Api-Key auth; enable with `API_CHANNEL_ENABLED=true`

### Core Improvements

- **Loop Guard** — `MAX_STEPS` raised to 50; configurable `ToolCallLoopDetector` (windowSize, threshold) via env vars
- **Tool Output Truncation** — `applyTruncation` caps tool output at 12,000 chars to prevent context overflow
- **MCP Plugin Support** — `loadMCPTools()` / `registerMCPTools()`; tools prefixed `mcp_<server>_<tool>`
- **Task Delegation** — `runSubTask()` in agent core; `DelegateHandler` wired through registry
- **Bug fix** — `execSync` in `run_code` now uses `stdio: 'pipe'`; child stderr no longer leaks to parent terminal

### Tests

- 85 tests across 10 files — all passing
- New test files: `run-code`, `web-search`, `analyze-image`, `delegate-task`, `mcp-loader`, `api`, `loop-guard-config`

### Documentation & Landing Page

- README: tagline updated to 40+ tools; new feature rows and sections for all new capabilities
- Docs: new pages for Web Search, REST API, MCP Plugins; updated Built-in Tools and Configuration references
- Landing page: Hero badge/subtitle, 13-card Features grid, 4-panel Integrations section

---

## 0.0.1 — Initial Release (2026-05-06)

First public release of **tota** — a soul-driven AI agent by [manu14357](https://github.com/manu14357).

### Features

- **Soul-driven identity** — personality defined by markdown files (`soul.md`, `persona.md`, `taste.md`, `heartbeat.md`) stored in `~/.tota/soul/`
- **Second Brain memory** — SQLite + FTS5 persistent memory with 10 memory types, auto-extraction, conflict resolution, and auto-consolidation
- **Permission-hardened tools** — shell blocklist, folder-level scoping, per-session approval modes (Ask Me / Allow All)
- **Token budget** — daily budget enforcement with auto-concise mode at 70%, `/budget` command
- **Multi-channel** — CLI with real-time streaming and Telegram with editable messages, typing indicators, file uploads
- **Daemon mode** — background process with crash recovery, system service install on macOS, Linux, and Windows
- **31 built-in tools** — filesystem, shell, git, web, messaging, skills, scheduler, system
- **Agent Skills** — install and run community skills at runtime (`~/.tota/skills/`)
- **Scheduler** — cron and one-shot tasks persisted to `~/.tota/schedules.yaml`
- **Provider fallback** — DeepSeek, OpenAI, Anthropic, Grok, Ollama Cloud, Ollama Local, OpenAI-compatible endpoints
- **Telegram org access** — admin/member roles with approve/reject/promote/demote flows

### Repository

- GitHub: <https://github.com/manu14357/tota-agent>
- npm: `@manu14357/tota-agent`
- Author: [manohar](https://github.com/manu14357)
