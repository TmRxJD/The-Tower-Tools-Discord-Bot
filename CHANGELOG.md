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
