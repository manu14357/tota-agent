# Changelog

All notable changes to tota-agent will be documented here.

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
