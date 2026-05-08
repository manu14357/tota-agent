# Release v0.0.2

## tota-agent v0.0.2

**Feature release** by [manu14357](https://github.com/manu14357).

### Highlights

- **40+ built-in tools** — added `web_search`, `analyze_image`, `run_code`, `delegate_task`, and MCP-prefixed plugin tools
- **Web Search** — Brave, Serper, and Tavily support; auto-detected from env keys
- **Vision** — analyze local images or URLs with any vision-capable provider
- **Code Sandbox** — Python, JS, TS, Bash, Ruby, Go; isolated temp dir; auto-cleanup
- **Task Delegation** — sub-agent for complex sub-tasks via `delegate_task`
- **MCP Plugins** — connect any JSON-RPC MCP server; tools auto-prefixed `mcp_<server>_<tool>`
- **REST API Channel** — `GET /status` + `POST /message`; Bearer auth; port 3001
- **Loop Guard** — MAX_STEPS 50, configurable detector window/threshold
- **Tool Truncation** — 12k char cap prevents context overflow
- **85 tests** across 10 files — all passing
- **Bug fix** — `run_code` stderr no longer leaks to parent terminal

### Install / Upgrade

```sh
npm i -g tota-agent          # fresh install
npm i -g tota-agent@0.0.2   # pin version
```

### Repository

- GitHub: <https://github.com/manu14357/tota-agent>
- npm: `npm i -g tota-agent`

---

**Full Changelog**: https://github.com/manu14357/tota-agent/compare/v0.0.1...v0.0.2

---

# Release v0.0.1

## tota-agent v0.0.1

**Initial public release** by [manu14357](https://github.com/manu14357).

### Highlights

- Soul-driven AI agent with permission-hardened tools and token budgets
- Second Brain — SQLite + FTS5 persistent memory with 10 memory types
- Multi-channel: CLI with real-time streaming + Telegram with editable messages
- Daemon mode with crash recovery and system service (macOS, Linux, Windows)
- 31 built-in tools: filesystem, shell, git, web, messaging, skills, scheduler, system
- Provider fallback: DeepSeek, OpenAI, Anthropic, Grok, Ollama Cloud, Ollama Local, OpenAI-compatible
- Agent Skills: install and run community skills at runtime

### Repository

- GitHub: <https://github.com/manu14357/tota-agent>
- npm: `npm i -g tota-agent`

---

**Full Changelog**: https://github.com/manu14357/tota-agent/commits/v0.0.1
