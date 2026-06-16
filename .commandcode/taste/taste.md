# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# workflow
- Organize implementation work into named phases (Phase 1, Phase 2, …) with prioritized tickets per phase, using H1/H2/… for high priority and M1/M2/… for medium. Each phase has its own verification gate before moving on. Confidence: 0.85
- Before declaring a phase complete, run `tsc --noEmit`, `tsup` build, and the full test suite (`npx vitest run`) and show all three as clean. Confidence: 0.85

# code-style
- For filesystem-backed resources that accept a user-supplied name in a URL, validate the name against `/^[a-zA-Z0-9._-]+$/` to block path traversal (e.g. `../config`). Apply this in both the storage layer (e.g. `SkillLoader.saveSkill`/`deleteSkill`) and the HTTP route handler. Confidence: 0.85
- Tag code blocks (comments above methods, doc comments, or inline notes) with the originating ticket ID (e.g. `H7`, `M8`) so future readers can trace implementation back to the issue tracker. Apply this when the change is part of a numbered ticket set. Confidence: 0.70
- Group phase-related test files under a single `security-phase<N>.test.ts` (or similar topic-phase name) in `src/`, rather than co-locating with the implementation files. Confidence: 0.75

# architecture
- For shared mutable state exposed to concurrent writers (e.g. short-term / long-term memory), use a per-resource-key async mutex around read-modify-write instead of the read → clear → re-add pattern, which loses concurrent writes. Confidence: 0.80
- When a REST endpoint mutates an in-memory service (scheduler, registry, etc.), inject the service via a `setX(...)` setter after construction rather than passing it through the constructor — matches the existing `TelegramChannel` pattern. Wire the setter call in the composition root (`index.ts`) right after both objects exist. Confidence: 0.75
- For channel pending-resolver maps (approvals, permission-mode replies, ask-to-continue), provide a `clearAll(onClear)` method that invokes a per-entry callback with a safe default (e.g. `'no'`, `false`, `'ask-me'`) and call it from the disconnect/stop path. Prevents leaked timers and cross-session prompt resolution. Confidence: 0.80
- For per-JID permission prompts (askPermissionMode/askPermission/askToContinue), guard against concurrent calls for the same JID by checking `has(jid)` first and returning the safe default with a warning log, rather than silently overwriting the previous resolver. Confidence: 0.75
- For client-side WebSocket reconnection, use exponential backoff (e.g. 1s → 30s cap) rather than a fixed interval; cap the outgoing message queue (e.g. 50, drop oldest) so a long disconnect doesn't grow memory unbounded. Use an `intentionalClose` flag to distinguish user-initiated disconnects from network drops. Confidence: 0.75
