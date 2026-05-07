# tota — Research & Notes

> Experiments, findings, and technical notes for tota-agent.
> GitHub: https://github.com/manu14357/tota-agent

## Token Budget Design

### Baseline Costs per Request

| Component | Est. Tokens |
|-----------|-------------|
| `soul.md` | ~200 |
| `persona.md` | ~150 |
| Short-term context (10 msgs) | ~500 |
| Second Brain recall (5 memories) | ~180 |
| User message | ~100 |
| Agent response | ~500 |
| **Total per request** | **~1,200–1,500** |

### Strategies

1. Only inject soul + persona by default (~350 tokens baseline)
2. `taste.md` and `heartbeat.md` loaded selectively (not every request)
3. Compress old conversation into 50-token summaries
4. FTS5 keyword search for Second Brain recall (top 5, 900-char budget)
5. Daily token budget with hard cap + auto-concise at 70%

## Telegram Streaming

- grammY + `@grammyjs/auto-retry` handles flood limits
- Stream plain text tokens, then edit final message with HTML formatting
- `editMessageText` used for live streaming — single message updated in place
- Markdown partial chunks break Telegram's parser — stream raw, format on completion
- Typing indicators sent before each tool call and response

## LLM Provider Notes

- DeepSeek uses OpenAI-compatible API — `createOpenAI({ baseURL })` works directly
- Vercel AI SDK `createOpenAI` accepts custom `baseURL` for any OpenAI-compatible endpoint
- Ollama Cloud uses `/v1/chat/completions` (OpenAI-compat), NOT `/api/chat` (local)
- Token counting: approximate via `js-tiktoken` for OpenAI; Anthropic tokenizer is different
- Provider fallback: last successful provider remembered per session, tried first next request

## Second Brain Memory Architecture

- SQLite WAL mode for concurrent read/write
- FTS5 virtual table on `summary` column for full-text search
- Conflict detection: negation patterns + semantic overlap via FTS5 similarity score
- Tiering: `active` (time-bound, 21-day staleness) → `durable` (long-lived, 120-day decay)
- Promotion: 3+ evidence count triggers active→durable upgrade
- Auto-consolidation: runs every 60 min, generates profile summary + reflections
- All data local: `~/.tota/memory/second-brain/second-brain.db`

## Daemon / Service Architecture

- Background spawn: `child_process.spawn({ detached: true, stdio: 'ignore' })` + `unref()`
- PID file: `~/.tota/daemon.pid` — checked on every `tota status` call
- Watchdog: exponential backoff (1s base, 1.25× multiplier, max 10 restarts/60s)
- macOS: `~/Library/LaunchAgents/com.tota.agent.plist` (no sudo)
- Linux: `~/.config/systemd/user/tota-agent.service` (no sudo, linger for boot)
- Windows: `schtasks` Task Scheduler (no admin)
