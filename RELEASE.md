# Release v1.2.1

## tota-agent v1.2.1 — Web UI Bug Fix Patch

**Patch release** resolving 20 bugs in the Web UI introduced in v1.2.0 — including non-functional file upload, broken audio recording, 13+ missing API endpoints, and multiple CRUD operations that silently did nothing.

### What's fixed

#### File upload — now actually works
The Chat page's paperclip button was wired to a `POST /api/upload` endpoint that didn't exist in v1.2.0. v1.2.1 implements that endpoint with multipart/form-data parsing (no extra deps), saves the file to a temp path, and tells the agent `[User sent a file: ...]` with the path, filename, and MIME type. Supports up to 50 MB.

#### Audio/mic recording — now actually works
The mic button silently failed in v1.2.0. v1.2.1 implements `MediaRecorder` capture in the browser, uploads the WebM blob via `/api/upload`, and the agent auto-transcribes it with the `transcribe_audio` tool. A red pulse animation shows while recording; the square icon stops it.

#### 13+ missing API endpoints
The UI called these routes — the server returned 404 for all of them. Now implemented:

| Endpoint | Action |
|----------|--------|
| `GET /api/config/agent` | Read agent behaviour config |
| `PATCH /api/config/agent` | Save agent behaviour config |
| `POST /api/memory/short-term` | Add short-term memory entry |
| `DELETE /api/memory/short-term` | Clear all short-term memory |
| `DELETE /api/memory/short-term/:id` | Delete one short-term entry |
| `PATCH /api/memory/short-term/:id` | Edit one short-term entry |
| `POST /api/memory/long-term` | Add long-term memory entry |
| `DELETE /api/memory/long-term` | Clear all long-term memory |
| `DELETE /api/memory/long-term/:id` | Delete one long-term entry |
| `PATCH /api/memory/long-term/:id` | Edit one long-term entry |
| `DELETE /api/messages` | Clear chat history |
| `POST /api/schedules` | Create a new schedule |
| `PATCH /api/schedules/:id` | Edit or toggle a schedule |
| `DELETE /api/skills/:name` | Delete a skill |
| `PATCH /api/skills/:name` | Edit a skill |
| `POST /api/skills` | Create a new skill |

#### Other bugs fixed

| # | Bug | Fix |
|---|-----|-----|
| BUG-4 | `'file'` and `'askPermission'` missing from `WSMessage` union | Added to `api.ts` |
| BUG-5 | Sending state locked permanently after dropped response | 90-second safety timeout |
| BUG-6 | Chat history blank on load | Normalise `MemoryEntry` → `ChatMessage` shape |
| BUG-7 | Settings Agent tab couldn't save | Now uses working `/api/config/agent` |
| BUG-8 | Scheduler changes not persisted | CRUD writes to `schedules.yaml` |
| BUG-9 | Memory changes not persisted | CRUD writes to disk immediately |
| BUG-10 | Skills changes not persisted | CRUD via `SkillLoader` |
| BUG-11 | Danger Zone clear/reset did nothing | Buttons now delete the data files |
| BUG-13 | Path traversal in upload handler | Decode percent-encoding before sanitising |
| BUG-14 | No WebSocket disconnect feedback | `WifiOff` banner + `isConnected()` on `SocketClient` |
| BUG-19 | Logs page stale without refresh | Auto-polls every 5 seconds |
| BUG-12/20 | File input rejected audio/video/code | Accept attribute expanded |

### UI enhancements

- WebSocket disconnect banner with pulse animation
- Recording pulse animation on mic button
- Media bubbles for inline file/image preview in chat
- Permission request banner with **Allow All** / **Ask Me** buttons
- Enhanced card hover-lift animations (Dashboard, Memory pages)
- Glassmorphism compose bar with `backdrop-filter` blur
- Active nav-item glow-bar indicator
- Agent message bubble accent left border
- Button press scale animations

### Files changed

| File | Change |
|------|--------|
| `src/channels/ui-server.ts` | 13+ new REST endpoints; multipart file upload (`readBodyRaw`); path-traversal fix |
| `src/ui-app/src/api.ts` | `'file'`/`'askPermission'` in `WSMessage` union; `isConnected()` on `SocketClient` |
| `src/ui-app/src/pages/Chat.tsx` | File upload via `FormData`; mic recording via `MediaRecorder`; connection status banner |
| `src/ui-app/src/pages/Logs.tsx` | 5-second auto-refresh polling |
| `src/ui-app/src/index.css` | New component styles; enhanced animations |

### Migration from v1.2.0

No breaking changes. Drop-in upgrade.

```bash
npm i -g tota-agent
```

---

# Release v1.2.0

## tota-agent v1.2.0 — Local Web UI

**Minor release** shipping a full browser-based dashboard (`tota ui`) with 8 live pages, real-time WebSocket streaming, and a dedicated 9-page documentation section.

### Highlights

#### Web UI — local dashboard in your browser

```bash
tota ui
# Opens http://127.0.0.1:3001
```

Or with options:
```bash
tota ui --port 4000       # custom port
tota ui --no-open         # server-only, no browser tab
tota ui --attach          # proxy to already-running daemon
```

All data stays on your machine. The server binds to `127.0.0.1` loopback only.

#### 8 built-in pages

| Page | Path | What you get |
|------|------|-------------|
| **Chat** | `/chat` | Real-time streaming chat; slash-command autocomplete; file upload; voice input (browser mic); tool-step display; code blocks with copy button |
| **Dashboard** | `/dashboard` | Live status badge, active model, provider, uptime, token budget, permission mode — auto-refreshes every 8 s |
| **Memory** | `/memory` | Browse and manage Second Brain entries; add/edit/delete; instant SQLite sync |
| **Scheduler** | `/scheduler` | All scheduled tasks with cron, last/next run, status; one-click cancel |
| **Skills** | `/skills` | Installed skill list — name, description, version, active state |
| **Settings** | `/settings` | Provider config, API key status, channel config (read-only) |
| **Logs** | `/logs` | Live log stream with severity filter (debug/info/warn/error); WebSocket push |
| **Integrations** | `/integrations` | Channel status pills; tool category grid; GitHub, web-search, provider overview |

#### Auto-start with daemon

```json
// ~/.tota/config.json
{
  "channels": {
    "ui": {
      "enabled": true,
      "port": 3001
    }
  }
}
```

Or run `tota setup ui` interactively.

#### Remote access via SSH tunnel

```bash
ssh -L 3001:127.0.0.1:3001 user@your-server
# then open http://127.0.0.1:3001 locally
```

### Files changed

| File | Change |
|------|--------|
| `src/channels/ui-server.ts` | **New** — HTTP + WebSocket server; 8 REST API endpoints; file upload; loopback-only binding; static SPA serving |
| `src/cli/ui-command.ts` | **New** — `tota ui` CLI command with `--port`, `--no-open`, `--attach` flags |
| `src/ui-app/` | **New** — React 18 + Vite + React Router + Tailwind SPA (18 source files) |
| `src/channels/registry.ts` | Register `UiServerChannel` |
| `src/types/channel.ts` | Add `'ui'` to `ChannelType` union |
| `src/utils/config.ts` | UI channel config schema |
| `src/index.ts` | Wire `tota ui` command + `tota setup ui` |
| `package.json` | `build:ui`, `build:all`, `prepublishOnly` scripts |
| `README.md` | New `## Web UI` section with options, pages table, config, security |
| `tota-web/content/web-ui/` | **New** — 9-page dedicated docs section |
| `tota-web/src/lib/nav.ts` | Add Web UI section (9 slugs) to sidebar nav |
| `tota-web/src/components/docs/Sidebar.tsx` | Monitor icon for Web UI section |
| `tota-web/content/index.mdx` | Updated landing page cards linking to new docs |

### Migration from v1.1.x

No breaking changes. The Web UI is opt-in — `tota ui` starts it on demand. No config changes required to continue using tota as before.

```bash
npm i -g tota-agent
```

---

# Release v1.0.2

## tota-agent v1.0.2 — Patch Release

**Patch release** fixing a regression in `tota whatsapp link` introduced in v1.0.1, plus two additional WhatsApp startup improvements.

### Bug Fixes

#### `tota whatsapp link` QR code not shown (regression)
v1.0.1 added a guard to skip connecting when no saved creds exist (to avoid spurious QR noise on `tota start`). That guard accidentally also blocked the explicit `tota whatsapp link` command — the whole point of which is to generate a QR on a fresh auth dir. Fixed by adding a `{ forLink: true }` option to `WhatsAppChannel.start()` that bypasses the creds check. The link command now passes this flag.

**Files changed**: `src/channels/whatsapp.ts`, `src/channels/base.ts`, `src/index.ts`

#### WhatsApp session-expiry `console.log` noise on startup
Removed two `console.log('[WhatsApp] Session expired…')` calls that bypassed the silent pino logger and printed on every startup even when the user had never configured WhatsApp. The `logger.warn` path already handles it (silent by default).

**Files changed**: `src/channels/whatsapp.ts`

#### Stale auth auto-cleanup on `loggedOut`
When WhatsApp revokes the session (`DisconnectReason.loggedOut`), the auth directory is now automatically deleted so the next `tota start` does not attempt to reconnect with invalid credentials and immediately crash/loop.

**Files changed**: `src/channels/whatsapp.ts`

### Migration from v1.0.1
No breaking changes.

```bash
npm i -g tota-agent
```

---

# Release v1.0.1

## tota-agent v1.0.1 — Patch Release

**Patch release** by [manu14357](https://github.com/manu14357). Fixes the MiMo provider crash in thinking mode and the CI port-conflict test failure.

### Highlights

- **MiMo `reasoning_content` fix** — `mimo-v2-omni` now works reliably. The provider was sending requests with `createOpenAI` which stripped `reasoning_content` from message history. MiMo's API requires it to be echoed back on every turn (same as DeepSeek-Reasoner). Switched to `createDeepSeek` with `thinking: enabled` provider options.
- **CI fix** — `api.test.ts` no longer hard-codes port 34500. Uses OS-assigned port 0 via new `APIChannel.getPort()` method. Eliminates `EADDRINUSE` failures on CI.

### Changes

#### Providers

| File | Change |
|------|--------|
| `src/providers/mimo.ts` | Replace `createOpenAI` with `createDeepSeek`; set `isReasoner = true` |
| `src/core/agent.ts` | Include `MiMoProvider` in `deepseekProviderOptions` check (thinking enabled) |

#### Tests / CI

| File | Change |
|------|--------|
| `src/channels/api.ts` | Add `getPort()` method — reads actual bound port from `server.address()` |
| `src/channels/api.test.ts` | Use port `0` (OS ephemeral); destructure `{ ch, port }` from `startChannel()` |

### Migration from v1.0.0

No breaking changes.

```bash
npm i -g tota-agent
```

---

# Release v1.0.0

## tota-agent v1.0.0 — Stable Release

**First stable release** by [manu14357](https://github.com/manu14357). tota-agent is now production-ready. This release delivers Windows reliability improvements, security hardening (Excel CVE elimination), a complete documentation overhaul, and a CI fix — building on the strong foundation of v0.0.4.

### Highlights

- **Stable milestone** — tota-agent graduates from pre-release to stable. All core features (60+ tools, 11 LLM providers, browser automation, computer-use, WhatsApp, Telegram, REST API, daemon mode, Second Brain) are production-ready.
- **Windows reliability** — Fixed `npx` daemon mis-detection, `schtasks /rl` Access Denied, and `getDistPath` path resolution for Windows global npm installs.
- **Excel CVE elimination** — Replaced `xlsx` (SheetJS) with `exceljs` to clear two unpatched HIGH severity CVEs; `npm audit --audit-level=high` now exits 0 cleanly.
- **Complete docs overhaul** — CLI reference rewritten to match code; 5 reference pages corrected; new LLM providers guide; community contributions merged.
- **CI stability** — Fixed `clipboard_read` timeout on headless Windows CI.

### What's New Since v0.0.4

#### Windows Fixes

| Area | Fix |
|------|-----|
| npx daemon | Skip `autoDaemonize` when run via npx (temp cache path detection) |
| Post-setup hints | Show `npx tota-agent start` + global install tip for npx users |
| schtasks | Remove `/rl` flag (caused Access Denied); bail on create failure with admin instructions |
| `getDistPath` | Handle Windows global npm paths; remove old scoped package name candidates |

#### Security

| CVE | Package | Fix |
|-----|---------|-----|
| `GHSA-4r6h-8v6p-xvw6` | xlsx (SheetJS) | Prototype Pollution — replaced with exceljs |
| `GHSA-5pgg-2g8v-p4x9` | xlsx (SheetJS) | ReDoS — replaced with exceljs |

#### Documentation

- Full CLI reference rewrite — every command verified against code
- 5 reference page corrections: built-in tools, second brain, provider fallback, permissions, skills
- New LLM providers guide with all 11 providers documented
- README tagline update and site layout improvements
- Merged community PR #2 (docs updates by @prasanna919)

#### CI / Tests

- `clipboard_read` test no longer times out on headless Windows CI

### Migration from v0.0.4

No breaking changes.

```bash
npm i -g tota-agent
```

Or with npx:

```bash
npx tota-agent
```

---

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
