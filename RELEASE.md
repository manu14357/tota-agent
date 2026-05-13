# Release v0.0.4

## tota-agent v0.0.4

**Security & Providers release** by [manu14357](https://github.com/manu14357). This release hardens the agent against 9 security vulnerabilities, expands the browser automation suite to 36 tools, and adds 2 new LLM providers — NVIDIA NIM and OpenRouter — bringing the total to **11 providers with automatic fallback**.

### Highlights

- **NVIDIA NIM** — Access `nvidia/nemotron-3-super-120b-a12b` and hundreds more via `integrate.api.nvidia.com/v1`. Key prefix `nvapi-`. Integrated into setup wizard as option 10.
- **OpenRouter** — Route to 300+ models through a single `sk-or-…` key at `openrouter.ai/api/v1`. Default model `openrouter/auto` lets OpenRouter pick the best available. Integrated as wizard option 11.
- **9 Security Fixes** — Git/ADB command injection, API auth bypass, body-size DoS, TOCTOU symlink attack, processing flag deadlock, skill HTTPS enforcement, delay_seconds overflow, file permission hardening, and protobufjs CVE (GHSA-xq3m-2v4x-88gg).
- **26 new browser tools** — Total browser capability: 36 tools covering cookies, storage, PDF, viewport, multi-tab, file upload, dialogs, network interception, iframes, and navigation history.
- **Termux / Android install fix** — Detects missing `git` and shows the exact `pkg install git` + SSH→HTTPS rewrite steps.
- **CodeQL + npm audit CI** — Automated security scanning on every push.
- **312 tests, 19 files** — All passing.

### What's New In Detail

#### New LLM Providers (total: 11)

| Provider | Key env var | Default model | Notes |
|----------|------------|---------------|-------|
| NVIDIA NIM | `NVIDIA_API_KEY` | `nvidia/nemotron-3-super-120b-a12b` | 262k context, 8192 max tokens |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/auto` | Routes to 300+ models |

Both providers:
- Use `useChatApi: true` (OpenAI-compatible chat completions path) — avoids Vercel AI SDK model-id validation
- Live `/models` endpoint fetch during setup wizard → falls back to curated 4-model static catalog
- Key format validation in wizard (`nvapi-…` / `sk-or-…`)
- `OPENROUTER_MODEL`, `NVIDIA_MODEL` env vars for CI/CD

#### New Browser Tools (26 added → 36 total)

| Category | Tools |
|---|---|
| HTTP | `browser_fetch` |
| Navigation | `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload` |
| JavaScript | `browser_evaluate` (IIFE-wrapped, real return values) |
| Cookies | `browser_cookies_get/set/clear` |
| Storage | `browser_storage_get/set/clear` |
| PDF | `browser_pdf` |
| Viewport | `browser_viewport` |
| Form elements | `browser_select`, `browser_check/uncheck`, `browser_upload`, `browser_focus` |
| Mouse | `browser_hover` |
| Dialogs | `browser_dialog` |
| Network | `browser_network` |
| iframes | `browser_frame` |
| Tabs | `browser_new_tab`, `browser_close_tab`, `browser_tabs` |

#### Security Fixes (9)

| Area | Fix |
|---|---|
| API channel | Restrict unauthenticated access to loopback only; 10 MB body-size cap (HTTP 413) |
| Git tools (6) | `execFileSync` array args instead of `execSync` string interpolation |
| ADB tools | `execFileSync` array args; `randomUUID()` for temp filenames |
| `read-file.ts` | `realpathSync` + re-validate real path after permission check (TOCTOU) |
| `agent.ts` | `try/finally` around message queue so `processing` flag always clears |
| `install-skill.ts` | HTTPS-only for remote URLs; 1 MB download cap |
| `schedule-task.ts` | `positive().max(365d)` on `delay_seconds` |
| `store.ts` | Conversation files written with `0o600` permissions |
| protobufjs | Overridden to `>=7.5.5` (GHSA-xq3m-2v4x-88gg, critical) |

#### Bug Fixes

| Area | Fix |
|---|---|
| npx | `tota-agent` bin alias added; detects `npx` run and prompts global install |
| Termux/Android | Detects `spawn git ENOENT`; shows `pkg install git` + SSH→HTTPS rewrite |
| Windows upgrade | `EEXIST` hint now shows `Remove-Item` PowerShell commands |
| NVIDIA provider | Fixed 1273 Vercel AI SDK schema errors — use `useChatApi:true` |
| Duplicate handler | Removed dead `/stream off` handler in `agent.ts` |

#### CI / DevOps

- GitHub Actions: `npm audit` + CodeQL (push + weekly schedule)
- README security workflow + npm version badges added

### Migration from v0.0.3

No breaking changes. Just `npm i -g tota-agent` or `npx tota-agent`. Run `tota setup` to add NVIDIA NIM or OpenRouter to your provider chain.

---

# Release v0.0.3

## tota-agent v0.0.3

**Major feature release** by [manu14357](https://github.com/manu14357). This is the biggest update since the initial release — adding WhatsApp, Google Calendar, multi-provider Voice, an encrypted Secrets Vault, Computer-Use, 10 Android ADB tools, 10 Browser Automation tools, Document Readers, and dozens of bug fixes.

### Highlights

- **WhatsApp Channel** — Full bidirectional WhatsApp via `@whiskeysockets/baileys`; QR-code linking, phone allowlist, 9 CLI management commands, `whatsapp_send` tool
- **Google Calendar** — OAuth2 with auto-browser flow (localhost redirect); 5 tools: `list_events`, `create_event`, `check_availability`, `delete_event`, `calendar_auth`
- **Multi-provider Voice** — TTS: OpenAI TTS-1 / ElevenLabs / Google Cloud TTS; STT: OpenAI Whisper / Groq Whisper; optional `provider` param per call
- **Secrets Vault** — AES-256-GCM encrypted at `~/.tota/vault.enc.json`; keytar-backed; 4 tools: `secret_store/get/list/delete`
- **Computer-Use** — 9 desktop tools via `@nut-tree-fork/nut-js`; 10 Android ADB tools; gated behind `COMPUTER_USE_ENABLED=true`
- **Browser Automation** — 10 Playwright tools; Chromium + Firefox + WebKit support; opens as visible window by default; `browser_key`, `browser_wait`, `browser_engine` added
- **Document Readers** — `read_pdf`, `read_excel`, `write_excel`, `read_docx`; Telegram file ingestion (documents, photos, audio, video, stickers)
- **Advanced File Finder** — `find_files` with glob, content, type, date, size filters
- **System Tools** — `clipboard_read/write`, `notify` (desktop notifications), `spawn_agent` (multi-agent crew)
- **60+ tools total** — up from 40+ in 0.0.2
- **184 tests** across 17 files — all passing (was 85 / 10)
- **Per-feature setup wizards** — `tota setup browser/computer/calendar/voice/vault/websearch/api`
- **Force-upgrade check** — blocks stale installs and shows exact self-heal command

### What's New In Detail

#### New Channels
- **WhatsApp** via `@whiskeysockets/baileys` — no Business API / Meta account needed
  - QR-code device linking: `tota whatsapp link`
  - Phone allowlist + per-number approval flow (pending queue)
  - Per-channel permission modes (Allow All / Ask Me independent of Telegram)
  - Typing indicators, file/image sending, group support
  - Auto-reconnect with exponential backoff; code 440 conflict detection
  - 9 CLI subcommands: `link`, `status`, `setup`, `allow`, `disallow`, `pending`, `approve`, `reject`, `revoke`
  - `whatsapp_send` tool: agent can proactively message any approved number

#### New Tools (30+ added)
| Category | Tools |
|---|---|
| Document Readers | `read_pdf`, `read_excel`, `write_excel`, `read_docx` |
| File Finder | `find_files` |
| Browser (10) | `browser_open/click/type/screenshot/extract/scroll/close/key/wait/engine` |
| Computer-Use (9) | `computer_screenshot/see/click/move/type/key/scroll/drag/screen_size` |
| Android ADB (10) | `adb_devices/screenshot/see/tap/swipe/type/key/shell/pull/push` |
| Google Calendar (5) | `calendar_auth`, `list_events`, `create_event`, `check_availability`, `delete_event` |
| Voice TTS/STT (2) | `text_to_speech`, `transcribe_audio` |
| Secrets Vault (4) | `secret_store`, `secret_get`, `secret_list`, `secret_delete` |
| System (3) | `clipboard_read`, `clipboard_write`, `notify` |
| Multi-agent (1) | `spawn_agent` |
| WhatsApp (1) | `whatsapp_send` |

#### CLI Commands Added
- `tota whatsapp link/status/setup/allow/disallow/pending/approve/reject/revoke`
- `tota setup browser/computer/calendar/voice/vault/websearch/api`
- `tota logs -f` (follow), `-n <count>` (lines), `--clear`
- `/` → **Configure** menu in-chat

#### Bug Fixes
- **Google Calendar OAuth** — OOB redirect replaced with `localhost:8765` + auto-browser (`xdg-open` / `open` / `start`); no copy-paste required
- **WhatsApp infinite reconnect** on code 440 (conflict); exponential backoff for all other disconnects
- **WhatsApp permission race condition** — resolver registered before prompt is sent
- **WhatsApp send_file wrong channel** — no longer silently routes to Telegram
- **WhatsApp Baileys noise** — console filter + silent pino stub eliminates Signal protocol dumps
- **Computer-use not loading after setup** — YAML override bug fixed
- **setup/doctor hang** — `stdin.pause()` + `process.exit(0)` after wizard
- **Windows schtasks spaces** — cmd.exe quote escaping for paths with spaces
- **macOS notifications** — `osascript` replaces `node-notifier` (no binary dependency)
- **Telegram Allow All button** — `checkFsAccess` early-exit fixed
- **Package rename** — `@manu14357/tota-agent` → `tota-agent`; EEXIST Windows fix documented

### Install / Upgrade

```sh
npm i -g tota-agent          # fresh install
npm i -g tota-agent@0.0.3   # pin version
```

> **Upgrading from `@manu14357/tota-agent`?** Uninstall the old package first:
> ```sh
> npm uninstall -g @manu14357/tota-agent
> npm i -g tota-agent
> ```

### Repository

- GitHub: <https://github.com/manu14357/tota-agent>
- npm: `npm i -g tota-agent`

---

**Full Changelog**: https://github.com/manu14357/tota-agent/compare/v0.0.2...v0.0.3

---

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
