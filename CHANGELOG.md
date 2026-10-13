## 2026-10-13 - Private acronym Markdown export

- Add `/acronyms export`: download every active acronym and alias with its definition in `tower-acronyms.md`, generated from the live managed registry. Defer privately before data access; preserve `/acronyms all`.

## 2026-10-13 — Local battle-condition payload bridge

- Preserve exact source payloads and bounded attachment bytes in a durable local platform store; ToolsBot no longer requests Message Content or reads source message content from Discord. Historical startup captures are view-only; live delivery retains existing receipts, destinations, retry polling and version checks.

## 2026-10-06 - Lab collector acknowledgement safety

- Acknowledge selectors, toggles and submitted modals before saving settings or rendering. Reuse each acknowledgement promise so failed or ambiguous callbacks are never retried.
- Contain expired/already-acknowledged, network and unexpected failures in lab collector, reconciliation and cleanup tasks; keep unexpected diagnostics with callback URLs redacted.
- Keep scoped session ownership through refreshes and release it when the collector ends, preventing a competing global callback.
- Full isolated validation passed: 128 tests across 37 files, type checking, lint and build. Existing RxDB Node transport memory repair and 1500 MiB/15-second PM2 guard remain intact.

## 2026-10-06 - Define response length

- Keep slash and message-context definition responses within Discord's 2000-unit content limit. Long output includes a Unicode-safe preview and the complete original result in definition.txt; no definitions are discarded.
- Defer the private message-context response before expansion, preserving existing slash public/private policy. Boundary, long Unicode and both command-path regressions passed.
## 2026-10-03 - RxDB idle broadcast memory leak

- Select the supported Node socket broadcast transport before opening RxDB. The Node IndexedDB shim made automatic selection use browser IndexedDB polling; fake-indexeddb retained completed polling transactions indefinitely, even after channel close.
- Keep Dexie storage, shared schemas, durable sqlite settings and RxDB multi-instance notifications unchanged. Pin broadcast-channel 7.3.0, matching the existing RxDB dependency; no dependency upgrade or internal monkeypatch.
- An isolated two-database, three-minute control retained 2,305 additional transactions. Settled post-GC heap grew about 113 MiB/hour; the Node transport remained at 26 transactions with effectively flat heap. Regression coverage checks idle retention, settings writes, enabled multi-instance behavior and broadcast delivery; full 105 tests, type check, lint, build and offline frozen lockfile validation passed.
- Retain the 1500 MiB RSS restart guard and bounded passive diagnostics. The original crashed heap was unavailable; the reproduced mechanism matches the later natural-workload growth, while full-day production stability remains to be observed.
## 2026-10-03 - Passive memory diagnostics

- Capture numeric-only memory, Discord cache/listener/event counts, RxDB scopes/subscriptions, identity/session cache sizes, pending battle deliveries and KB artifact sizes every minute under natural workload.
- Overwrite one small local snapshot atomically; remove the diagnostic listener and timer during shutdown. No user/message content or identifiers enter telemetry, and diagnostic I/O failures do not affect commands.
- Privacy/lifecycle regressions and all 104 tests, full type checking, lint and build passed in isolation. Root cause remains unconfirmed; no additional owner notification or shared PM2 save was performed.

## 2026-10-03 - Heap exhaustion containment

- Confirmed ToolsBot exhausted its approximately 4 GiB V8 heap after 27.7 hours; PM2 recovered automatically.
- Add a 1500 MiB PM2 RSS restart guard and a 15-second graceful shutdown allowance. This limits recurrence impact without increasing Node's heap limit; the retained-object cause remains unconfirmed.
- Bounded offline probes did not reproduce sustained growth in repeated RxDB subscription/read cycles or Appwrite requests. Preserve incident evidence and live PM2 samples for follow-up.

## 2026-10-02 — Mythic battle conditions

- Add Mythic source, shared validation and league selection using a reproducible platform package patch. Existing league destinations remain unchanged; Mythic requires an explicit destination.

# Changelog

## 2026-10-02

### Fixed
- Battle-condition fallback checks current/future tournaments every day and rechecks source updates. Concurrent push/poll deliveries are serialized; older tournaments cannot overwrite newer delivery receipts. Failed polling is contained and retried.

- Ensure fatal bootstrap/shutdown exits the process and disconnects before releasing locks; ordinary resumable gateway disconnects no longer shut down services.
