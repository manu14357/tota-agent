# tota — Architecture Decisions

> Decision records for tota-agent. New ones appended as the project evolves.
> GitHub: https://github.com/manu14357/tota-agent

## ADR-001: TypeScript + Node.js

- **Context**: Need a runtime for a 24/7 headless agent with future GUI, mobile, and chat integrations.
- **Decision**: TypeScript on Node.js (ESM).
- **Consequence**: Best AI SDK ecosystem (Vercel AI SDK), grammY for Telegram, easiest path to every future channel.

## ADR-002: Vercel AI SDK for LLM

- **Context**: Multiple providers (OpenAI, Anthropic, DeepSeek, Grok, Ollama) with streaming.
- **Decision**: Vercel AI SDK (`ai` package) with provider-specific adapters.
- **Consequence**: Unified API, built-in streaming, tool calling. Provider swaps are one-line changes.

## ADR-003: Flat-file memory + SQLite Second Brain

- **Context**: Memory needs both simple inspectability and powerful search.
- **Decision**: JSONL for short-term/episodic, SQLite + FTS5 for Second Brain (structured, searchable, persistent).
- **Consequence**: No external DB dependency for basic use. Second Brain gives full-text search and conflict resolution.

## ADR-004: grammY for Telegram

- **Context**: Need Telegram integration with streaming and typing indicators.
- **Decision**: grammY + @grammyjs/auto-retry.
- **Consequence**: Best TypeScript Telegram framework. Active community.

## ADR-005: Soul as markdown files

- **Context**: Agent personality must be editable, versionable, and token-efficient.
- **Decision**: Four markdown files in `~/.tota/soul/`: `soul.md`, `persona.md`, `taste.md`, `heartbeat.md`.
- **Consequence**: ~350 token baseline for identity. Owner edits personality without touching code.

## ADR-006: Agent Skills specification

- **Context**: Skills must be modular, installable at runtime, and token-efficient.
- **Decision**: `SKILL.md` with YAML frontmatter + markdown instructions stored in `~/.tota/skills/`. Progressive disclosure — only name+description loaded at startup; full instructions loaded on invocation.
- **Consequence**: Skills are human-readable markdown, no code required.

## ADR-007: Scheduler with YAML persistence

- **Context**: tota needs reminders, periodic tasks, and skill triggers on a schedule.
- **Decision**: `schedule_task`, `list_scheduled_tasks`, `cancel_scheduled_task` as AI-callable tools. Persist to `~/.tota/schedules.yaml`.
- **Consequence**: Tasks survive restarts. Internal execution keeps scheduled tasks invisible to channels unless the agent explicitly sends output.

## ADR-008: Custom hybrid daemon manager

- **Context**: tota should run 24/7 without requiring PM2, forever, or manual systemd setup.
- **Decision**: Three-layer approach: background spawn + PID file, watchdog crash recovery, platform service generators (macOS LaunchAgent, Linux systemd user unit, Windows Task Scheduler). Zero external dependencies.
- **Consequence**: Boot services are user-level (no sudo on Mac/Linux). Foreground mode unchanged — daemon is opt-in.

## ADR-009: All data in `~/.tota/`

- **Context**: State scattered across CWD caused files appearing in random project directories.
- **Decision**: All runtime data lives in `~/.tota/` — config, soul, memory, permissions, skills, schedules, daemon state.
- **Consequence**: Clean separation between project code and agent state. Easy to backup or wipe.

## ADR-010: Second Brain — autonomous structured memory

- **Context**: Flat JSONL memory lacks search, structure, merge, and conflict handling.
- **Decision**: SQLite (better-sqlite3) + UserMemoryStore business logic. 10 memory types. Automatic conflict resolution by confidence. Staleness pruning. FTS5 full-text search. Fire-and-forget background extraction after each response.
- **Consequence**: tota learns and recalls user context persistently without user intervention. All data stays local.
