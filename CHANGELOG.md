# Changelog

All notable changes to tota-agent will be documented here.

## 1.0.0 — Stable Release (2026-05-16)

First stable release of tota-agent. Production-ready milestone built on v0.0.4 with Windows reliability improvements, security hardening, complete documentation overhaul, and CI fixes.

### Windows Reliability

- **npx daemon fix** — `autoDaemonize` now skips when run via `npx` (detects temp cache paths); post-setup shows `npx tota-agent start` and global install tip instead of bare `tota start`
- **schtasks fix** — Removed `/rl` flag that caused Access Denied on restricted accounts; captures schtasks errors with `stdio:pipe`, bails early with Administrator instructions on failure
- **`getDistPath` fix** — Handles Windows global npm paths correctly; removes stale `@manu14357/tota-agent` package name candidates

### Security

- **Excel CVE fix** — Replaced `xlsx` (SheetJS) with `exceljs` to eliminate two unpatched HIGH severity vulnerabilities:
  - `GHSA-4r6h-8v6p-xvw6` — Prototype Pollution when parsing malicious files
  - `GHSA-5pgg-2g8v-p4x9` — ReDoS (Regular Expression DoS)
  - `npm audit --audit-level=high` now exits 0; CI security check passes cleanly

### Documentation

- **CLI reference** — Complete rewrite to accurately match all commands in the codebase
- **Reference pages** — 5 pages corrected: built-in tools, second brain, provider fallback, permissions, skills
- **LLM providers guide** — New dedicated guide with step-by-step setup for all 11 providers
- README tagline and site layout improvements
- Community docs contributions (PR #2 by @prasanna919)

### CI / Tests

- Fixed `clipboard_read` test timeout on headless Windows CI

### npm

- Keywords synced with GitHub topics for improved discoverability

---

## 0.0.4 — (2026-05-13)

### New LLM Providers

- **NVIDIA NIM** (`nvidia`) — OpenAI-compatible API at `https://integrate.api.nvidia.com/v1`; default model `nvidia/nemotron-3-super-120b-a12b` (262k context); key format `nvapi-…`; live `/models` fetch with 4-model static fallback catalog; fully integrated into setup wizard (option 10)
- **OpenRouter** (`openrouter`) — Routes to 300+ models via a single API key at `https://openrouter.ai/api/v1`; default model `openrouter/auto` (automatic routing); key format `sk-or-…`; live `/models` fetch with 4-model static fallback; integrated into setup wizard (option 11)
- tota now supports **11 LLM providers** with automatic fallback chain

### New Browser Tools (26 added, total 36)

- **`browser_fetch`** — HTTP GET with headers + JSON/text response
- **`browser_navigate`** — Navigate to a URL with wait-for-load control
- **`browser_evaluate`** — Execute arbitrary JavaScript in page context (IIFE-wrapped, returns real values)
- **`browser_cookies_get`** / **`browser_cookies_set`** / **`browser_cookies_clear`** — Cookie management
- **`browser_storage_get`** / **`browser_storage_set`** / **`browser_storage_clear`** — `localStorage` / `sessionStorage` access
- **`browser_pdf`** — Print current page to PDF with paper/margin options
- **`browser_viewport`** — Set viewport width and height
- **`browser_select`** — Choose a `<select>` option by value or label
- **`browser_hover`** — Hover over an element
- **`browser_focus`** — Focus an input element
- **`browser_check`** / **`browser_uncheck`** — Check or uncheck checkboxes
- **`browser_upload`** — Upload files to `<input type="file">` elements
- **`browser_dialog`** — Accept or dismiss browser dialogs (alert / confirm / prompt)
- **`browser_network`** — Intercept and inspect network requests
- **`browser_frame`** — Switch execution context to an iframe
- **`browser_new_tab`** / **`browser_close_tab`** / **`browser_tabs`** — Multi-tab management
- **`browser_back`** / **`browser_forward`** / **`browser_reload`** — Navigation history

### Security Fixes

- **API channel auth bypass** — Unauthenticated requests now restricted to loopback (`127.0.0.1` / `::1`) only
- **DoS body size limit** — HTTP 413 enforced at 10 MB on the API channel
- **Git command injection** — All 6 git tools (`git-add`, `git-commit`, `git-diff`, `git-log`, `git-push`, `git-status`) converted from `execSync` string interpolation to `execFileSync` with array arguments
- **ADB command injection** — `adb.ts` converted to `execFileSync` array args; temp filenames use `randomUUID()` instead of `Date.now()+Math.random()`
- **TOCTOU symlink attack** — `read-file.ts` now resolves symlinks with `realpathSync` after permission check and re-validates the real path is inside the approved scope
- **Processing flag deadlock** — `agent.ts` message queue wrapped in `try/finally` so `processing` flag is always cleared on exception
- **Skill HTTPS enforcement** — Remote skill URLs validated for HTTPS; 1 MB download cap added
- **`delay_seconds` overflow** — Added `positive()` and `.max(365 * 86400)` validation in `schedule-task.ts`
- **Conversation file permissions** — `store.ts` writes conversation files with `0o600` (owner-only)
- **protobufjs CVE** — Overridden to `>=7.5.5` to fix GHSA-xq3m-2v4x-88gg (critical)
- **NVIDIA model-id validation** — Fixed 1273 Vercel AI SDK schema errors by routing NVIDIA through `useChatApi: true`

### Bug Fixes

- **npx detection** — `tota-agent` bin alias added; detects when run via `npx` and prompts for global install
- **Termux / Android install** — Detects `spawn git ENOENT` failures; shows platform-specific instructions including SSH→HTTPS git-config rewrite needed for `@whiskeysockets/libsignal-node`
- **Windows upgrade hint** — `EEXIST` shim-delete error now shows PowerShell commands (`Remove-Item`) alongside Unix ones
- **Duplicate `/stream off` handler** — Dead code removed from `agent.ts`

### CI / DevOps

- **Security workflow** — `npm audit` + CodeQL analysis added to GitHub Actions; runs on push and weekly schedule
- README badges updated (security workflow, npm version, license)

### Docs / Web

- Landing page Hero updated: animated terminal demo, mobile search, responsive layout fixes
- `tota-web` docs: v0.0.3 content updates backported; mobile layout fixes (code block padding, text size, search overflow, TOC border)

## 0.0.3 — (2026-05-11)

### New Channels

- **WhatsApp Channel** — Full bidirectional WhatsApp integration via `@whiskeysockets/baileys`; QR-code device linking (no Business API needed); phone allowlist with per-number approval flow; typing indicators; file/image sending; group support; auto-reconnect with exponential backoff
- **`whatsapp_send` tool** — Agent can proactively message any approved E.164 number from within a conversation

### New Tools

#### Document Readers
- **`read_pdf`** — Extract text, page count, and metadata from PDF files via pdf-parse
- **`read_excel`** — Read `.xlsx` / `.xls` / `.ods` / `.csv` files as markdown table or JSON via exceljs
- **`write_excel`** — Create `.xlsx` files with styled headers from JSON or markdown table
- **`read_docx`** — Extract text or HTML from `.docx` Word documents via mammoth

#### Advanced File Finder
- **`find_files`** — Glob, content keyword, type, date range, and size filters; recursive traversal with depth limit; skips `node_modules/.git/dist`

#### Browser Automation (10 tools total)
- **`browser_open`**, **`browser_click`**, **`browser_type`**, **`browser_screenshot`**, **`browser_extract`**, **`browser_scroll`**, **`browser_close`** — Playwright-powered automation
- **`browser_key`** — Press Enter / Tab / Escape / arrow keys between steps (required for login flows, dropdowns)
- **`browser_wait`** — Wait for a CSS selector to appear or navigation to complete
- **`browser_engine`** — Switch between Chromium, Firefox, and WebKit at runtime

#### Computer-Use / Desktop (9 tools)
- **`computer_screenshot`**, **`computer_see`**, **`computer_click`**, **`computer_move`**, **`computer_type`**, **`computer_key`**, **`computer_scroll`**, **`computer_drag`**, **`computer_screen_size`** — Desktop control via `@nut-tree-fork/nut-js`; gated behind `COMPUTER_USE_ENABLED=true`

#### Android ADB (10 tools)
- **`adb_devices`**, **`adb_screenshot`**, **`adb_see`**, **`adb_tap`**, **`adb_swipe`**, **`adb_type`**, **`adb_key`**, **`adb_shell`**, **`adb_pull`**, **`adb_push`** — Android device control via ADB CLI; gated behind `COMPUTER_USE_ENABLED=true`

#### Voice — Multi-provider TTS & STT
- **`text_to_speech`** — Three TTS providers: OpenAI `tts-1`, ElevenLabs `eleven_multilingual_v2`, Google Cloud TTS `Journey-F`; optional `provider` param to override configured default per call
- **`transcribe_audio`** — Two STT providers: OpenAI Whisper `whisper-1`, Groq `whisper-large-v3`; optional `provider` param

#### Google Calendar (5 tools)
- **`calendar_auth`** — Manual OAuth2 fallback for headless environments
- **`list_events`** — List upcoming calendar events with date/time filtering
- **`create_event`** — Create new events with attendees, location, and description
- **`check_availability`** — Query free/busy slots via Google Calendar free-busy API
- **`delete_event`** — Delete events by ID

#### System Utilities
- **`secret_store`** / **`secret_get`** / **`secret_list`** / **`secret_delete`** — AES-256-GCM encrypted secrets vault; keytar-backed key storage with derived-key fallback; vault path `~/.tota/vault.enc.json`
- **`clipboard_read`** / **`clipboard_write`** — System clipboard access via clipboardy
- **`notify`** — Desktop notifications (osascript on macOS, notify-send on Linux, node-notifier on Windows)
- **`spawn_agent`** — Multi-agent crew spawning; delegates focused sub-tasks with custom role and tool restrictions

### New CLI Commands

#### `tota whatsapp` (9 subcommands)
- `tota whatsapp link` — Display QR code to link a WhatsApp device (waits 120 s)
- `tota whatsapp status` — Show linked state and access lists
- `tota whatsapp setup` — Re-run the WhatsApp wizard
- `tota whatsapp allow <phone>` — Add phone to allowFrom list
- `tota whatsapp disallow <phone>` — Remove phone from allowFrom list
- `tota whatsapp pending` — List pending access requests from unknown numbers
- `tota whatsapp approve <phone>` — Approve a pending number
- `tota whatsapp reject <phone>` — Reject a pending number
- `tota whatsapp revoke <phone>` — Delete WhatsApp auth and restart daemon

#### Per-feature Setup Wizards
- `tota setup browser` — Run `npx playwright install` for Chromium / Firefox / WebKit
- `tota setup computer` — Enable / disable `COMPUTER_USE_ENABLED` with nut-js / ADB instructions
- `tota setup calendar` — Guide Google Calendar OAuth2 credential setup
- `tota setup voice` — Arrow-key TTS/STT provider selection, API key prompts
- `tota setup vault` — Show vault backend and usage instructions
- `tota setup websearch` — Brave / Serper / Tavily key entry with validation
- `tota setup api` — Enable REST API, configure port and optional auth key

#### `tota logs` Improvements
- `tota logs -f` / `--follow` — Live tail (like `tail -f`) of daemon log
- `tota logs -n <count>` / `--lines` — Limit output to N most recent lines
- `tota logs --clear` — Clear daemon log file

#### In-Chat
- `/` → **Configure** — Feature picker shows exact `tota setup <feature>` command; no restart needed

### Core Improvements

- **Force-upgrade check** — `enforceUpToDate()` queries the npm registry on every command (24 h cache); blocks execution if a newer version is available; shows exact self-heal command; skipped only for `tota upgrade`
- **Multi-engine Browser** — `BROWSER_ENGINE` env var selects Chromium / Firefox / WebKit default; browser opens as a **visible window** by default (`PLAYWRIGHT_HEADLESS=true` or `CI=true` to force headless)
- **Per-channel Permission Modes** — Replaced shared `autoApproveAll` boolean with per-channel `channelModes` map; Telegram and WhatsApp each maintain independent Allow All / Ask Me state
- **WhatsApp Bidirectional Hint** — System prompt now explicitly tells the model it has both inbound and outbound WhatsApp access, preventing hallucinated "I can only send" responses
- **Tool Labels & Result Hints** — `tool-label.ts` now covers all 60+ registered tools (was missing ~60 entries); `RESULT_HINTS` map added for every tool
- **npm Package** — Added `exports` field; fixed double-build in `publish.sh` (`--ignore-scripts`); version bump `0.0.2 → 0.0.3`

### Bug Fixes

- **Google Calendar OAuth** — Replaced deprecated OOB redirect (`urn:ietf:wg:oauth:2.0:oob`) with `http://localhost:8765/oauth2callback`; adds `openBrowser()` (cross-platform) and `waitForOAuthCallback()` one-shot HTTP server; no copy-paste needed
- **WhatsApp: infinite reconnect on conflict** — Detects `DisconnectReason.connectionReplaced` (code 440) and stops immediately; exponential backoff (`min(2s × 2^n, 60s)`, max 10 attempts) for all other disconnects
- **WhatsApp: permission race condition** — `askPermissionMode` resolver registered _before_ the prompt message is sent; agent can no longer start executing tools before the user selects a mode
- **WhatsApp: send_file wrong channel** — `send_file` no longer falls through to Telegram when the WhatsApp socket is unavailable; throws a clear error instead
- **WhatsApp: Baileys console noise** — `installConsoleFilter()` monkey-patches `console.log` / `console.warn` to drop known Baileys / libsignal patterns; pino logger replaced with silent stub
- **WhatsApp: session-expired false positives** — `hasEverConnected` flag prevents "Session expired" from printing during normal auto-reconnect cycles
- **Computer-use after setup** — Fixed YAML-overrides-env-var bug where `saveConfig()` wrote `enabled: false` after `tota setup computer`, leaving computer-use disabled on next start
- **setup/doctor hang** — `arrow-select.ts` now calls `stdin.pause()` in cleanup; `process.exit(0)` added after wizard completion as belt-and-suspenders
- **Windows schtasks spaces** — `/tr` argument now escapes inner double-quotes with backslashes so `node.exe` paths containing spaces (e.g. `C:\Program Files\nodejs\`) work correctly
- **macOS notifications** — Replaced `node-notifier` (requires `terminal-notifier` binary) with `execFile('osascript')` which is always available on macOS
- **Telegram Allow All button** — Fixed `checkFsAccess` early-exit when `autoApproveAll=true`; fixed root path `'/'` scope matching; `setOnPermissionMode` now resets flag when Ask Me is selected
- **Package rename** — All references to `@manu14357/tota-agent` replaced with `tota-agent`; Windows `EEXIST` binary-conflict fix documented and shown in blocking banner
- **Calendar test timeout** — `process.env.VITEST` guard in `runAuthFlow()` prevents tests hanging on a real browser/server

### Tests

- **184 tests across 17 files** — all passing (was 85 tests / 10 files in 0.0.2)
- New test files: `secrets` (14), `notify` (6), `clipboard` (6), `crew` (7), `voice` (18), `calendar` (12), `browser` (13), `whatsapp` (10)

### Documentation & Landing Page

- Docs site UI revamp: header search, mobile/desktop TOC, copy buttons for code blocks, new fonts (DM Sans + Fragment Mono)
- New docs pages: WhatsApp integration, Google Calendar setup, Voice TTS/STT multi-provider, Secrets Vault, Computer-Use, Android ADB, Browser Automation
- Configuration reference: Browser, Computer-Use, Voice, Calendar, Vault, Loop Guard sections
- CLI commands reference: all new `tota whatsapp`, `tota setup`, `tota logs` entries
- README: 60+ tool count; WhatsApp, Calendar, Voice, Vault, Computer-Use, Browser feature rows; Google Calendar Cloud Console setup guide; upgrade-from-`@manu14357/tota-agent` notice

---

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
- npm: `tota-agent`
- Author: [manohar](https://github.com/manu14357)
