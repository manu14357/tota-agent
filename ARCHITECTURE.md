# tota — Architecture

> Source of truth for the technical design of tota-agent.
> GitHub: https://github.com/manu14357/tota-agent | npm: @manu14357/tota-agent

---

## Overview

tota is a **soul-driven AI agent** that runs 24/7 from CLI or Telegram. It combines:

- A **10-step agentic loop** (Vercel AI SDK `generateText` / `streamText`)
- A **permission system** that gates all tool calls
- A **Second Brain** that learns from every conversation
- A **daemon manager** for persistent background operation
- A **channel abstraction** for CLI and Telegram (more channels planned)

---

## Directory Structure

```
tota-agent/
├── src/
│   ├── index.ts              # CLI entry point, setup wizard, commander program
│   ├── capabilities/         # All 31 tools (filesystem, shell, git, web, etc.)
│   │   ├── registry.ts       # Tool registry and capability loading
│   │   ├── permissions.ts    # Permission system (scopes, approval modes)
│   │   ├── filesystem/       # File tools (read, write, create, edit, list, delete)
│   │   ├── shell/            # Shell tool (run_command, cd, approve_command)
│   │   ├── git/              # Git tools (status, diff, log, add, commit, push)
│   │   ├── github/           # GitHub API tool (raw REST calls)
│   │   ├── web/              # Web tool (fetch_url)
│   │   ├── messaging/        # Messaging tool (send_message)
│   │   ├── scheduler/        # Scheduler tools
│   │   ├── skills/           # Skill tools (install, list, use)
│   │   └── system/           # System tools (budget_status)
│   ├── channels/
│   │   ├── base.ts           # BaseChannel abstract class
│   │   ├── cli.ts            # CLI channel (readline, streaming, arrow menus)
│   │   ├── telegram.ts       # Telegram channel (grammY, editable streaming)
│   │   ├── registry.ts       # Channel registry
│   │   └── index.ts
│   ├── core/
│   │   ├── agent.ts          # Agent class — agentic loop, tool dispatch, memory
│   │   ├── lifecycle.ts      # Startup, shutdown, signal handlers
│   │   ├── scheduler.ts      # Cron + one-shot task scheduling
│   │   └── index.ts
│   ├── memory/
│   │   ├── store.ts          # Short-term, long-term, episodic JSONL stores
│   │   ├── user-memory.ts    # Second Brain business logic (UserMemoryStore)
│   │   ├── second-brain-db.ts # SQLite + FTS5 storage layer
│   │   └── user-memory.test.ts
│   ├── providers/
│   │   ├── registry.ts       # Provider routing (DeepSeek, OpenAI, Anthropic, etc.)
│   │   ├── anthropic.ts
│   │   ├── deepseek.ts
│   │   ├── openai-compat.ts  # OpenAI-compatible endpoint (Grok, Ollama Cloud, custom)
│   │   ├── ollama.ts
│   │   ├── mimo.ts
│   │   └── base.ts
│   ├── cli/
│   │   ├── daemon.ts         # Background spawn, PID file, log redirect
│   │   ├── service.ts        # macOS LaunchAgent, Linux systemd, Windows schtasks
│   │   └── watchdog.ts       # Crash recovery with exponential backoff
│   ├── skills/
│   │   ├── loader.ts         # SKILL.md parser and runtime loader
│   │   └── types.ts
│   ├── soul/
│   │   └── identity.ts       # Soul file loading, creator check
│   ├── types/                # Shared TypeScript types
│   └── utils/
│       ├── config.ts         # TotaConfig, getTotaHome(), saveConfig(), etc.
│       ├── logger.ts         # pino logger (name: 'tota')
│       ├── manual.ts         # In-chat /help text
│       ├── tokens.ts         # Token usage tracking, daily budget
│       ├── provider-models.ts # Model catalog builder, provider model fetching
│       ├── github.ts         # GitHub API helper (octokit-style fetch)
│       ├── markdown.ts       # Terminal markdown renderer
│       └── tool-label.ts     # Tool call display formatting
├── scripts/
│   ├── check-native-deps.js  # SQLite native dependency check
│   ├── verify-package.cjs    # Pack + install + smoke test
│   └── publish.sh
├── package.json              # @manu14357/tota-agent, bin: tota
├── tsconfig.json
├── tsup.config.ts
└── .env.example
```

---

## Core Data Flow

```
User input
    │
    ▼
Channel (CLI / Telegram)
    │
    ▼
Agent.run()
    ├── Inject soul + persona (~350 tokens)
    ├── Inject Second Brain recall (top 5, 900-char budget)
    ├── Inject conversation history
    │
    ▼
Vercel AI SDK — generateText / streamText
    ├── Tool calls → capability dispatch → permission check → execute
    ├── Results → next step (up to 10 steps)
    │
    ▼
Response → Channel output (streaming)
    │
    ▼
Background: Second Brain extraction (fire-and-forget)
```

---

## Permission System

Every tool call is gated by `permissions.ts`:

- **Ask Me** (default) — prompts before file writes, shell commands, scope changes
- **Allow All** — auto-approves everything for the session; resets on restart

Scopes are file/folder paths. Once a scope is approved, subsequent operations in that path don't re-prompt.

Shell blocklist: `sudo`, `rm -rf /`, `mkfs`, and other destructive patterns never execute regardless of mode.

---

## Second Brain

```
Conversation ends
    │
    ▼
LLM extraction prompt → 0–3 MemoryRecord objects
    │
    ▼
UserMemoryStore.remember()
    ├── Duplicate detection (FTS5 similarity)
    ├── Conflict detection (negation patterns)
    ├── Merge or dismiss
    ├── Scope assignment (active / durable)
    └── SQLite INSERT / UPDATE
    │
Every 60 minutes
    ▼
UserMemoryStore.consolidate()
    ├── Profile summary (durable memories)
    ├── Active-state summary (active memories)
    └── Reflection generation (patterns → insights)
```

Memory types: `identity`, `preference`, `goal`, `project`, `habit`, `decision`, `constraint`, `relationship`, `episode`, `reflection`.

---

## Daemon Architecture

```
tota up
    │
    ├── tota service install  (first time)
    │   └── macOS: ~/Library/LaunchAgents/com.tota.agent.plist
    │   └── Linux: ~/.config/systemd/user/tota-agent.service
    │   └── Windows: schtasks TotaAgent
    │
    └── tota start -d
        ├── child_process.spawn({ detached: true })
        ├── stdio redirected to ~/.tota/daemon.log
        ├── PID written to ~/.tota/daemon.pid
        └── Watchdog: exponential backoff (1s, 1.25×, max 10/60s)
```

---

## Config

All runtime state lives in `~/.tota/` (returned by `getTotaHome()`).

Key config function: `getDefaultConfig()` returns a typed `TotaConfig` object with sensible defaults. Config saved to `~/.tota/tota.yaml` on `tota doctor` or `tota setup`.

API keys are stored separately in `~/.tota/.env` and loaded alongside any project `.env` file.

---

## Provider Fallback

```
request
    │
    ▼
getActiveProvider()
    ├── Try lastSuccessful provider first
    ├── On failure → try next configured provider
    └── On all fail → throw ProviderFallbackError
```

Each provider implements `BaseProvider`: `generateText()`, `streamText()`, `isAvailable()`, `getModel()`.

---

## Build

```bash
npm run build     # tsup → dist/
npm run typecheck # tsc --noEmit
npm test          # vitest run
```

Output: `dist/index.js` (ESM, Node.js 20+), referenced by `bin.tota` in package.json.
