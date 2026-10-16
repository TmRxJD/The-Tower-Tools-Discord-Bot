## 2026-10-16 - Creator code submissions

- Add the /creator add modal for a creator code and what the creator is known for. The last field checks the entered value against 1509606869336068347 and does not verify membership. Reject empty or overlong values, mentions, incorrect server IDs, duplicate users or codes; persist accepted submissions in SQLite so they appear in /creator list.

## 2026-10-16 - Creator add fixes

- Fix /creator add rejecting valid submissions: handles inside links (youtube.com/@name) and line breaks are now accepted; only real mentions (@everyone, @here, <@id>) are blocked.
- Limit creator codes to 30 characters and descriptions to the length of the longest current description.
- Expand bare domains in descriptions to https:// links so they render as links in the /creator list.

## 2026-10-16 - Deploy registry

- Keep @tmrxjd packages on GitHub Packages: the npm registry switch made the host's local @tmrxjd/platform patch fail to apply and broke the deploy install step. The pinned-version deploy preflight is kept.
- Add /creator add with a private form for code, what the creator is known for, and a final field matching 1509606869336068347. The ID match is not a membership check. Reject empty, overlong, mention-containing, or mismatched values and duplicate users/codes; persist submissions in SQLite and display them in /creator list.

## 2026-10-15 - Retire expired lab-session cleanup safely

- Bound the lab collector to the original interaction token deadline with 30 seconds of cleanup headroom, including time already spent rendering the first reply.
- Skip cleanup after token expiry; retire invalid/unknown webhook and deleted-response cleanup failures without retries or public fallback. Keep permission, malformed-request and network failures visible through existing diagnostics. Scoped-session release still happens before cleanup.
- Cover deadline calculations, successful cleanup, expired/unavailable responses and unexpected failures with isolated tests. No changes to lab settings, cloud schemas, credentials or permissions.

## 2026-10-13 - Share complete acronym list

- `/acronyms all` now privately returns the complete Markdown attachment with a Share button; remove `/acronyms export`. Share publishes the same file only after its requester clicks, in the same channel. Keep acknowledgements private, expire buttons after ten minutes, and prevent duplicate or uncertain-send retries.

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



## 2026-10-16 - Platform patch

- Regenerate patches/@tmrxjd__platform@0.2.4.patch in canonical git diff form. The hand-written hunk headers (`@@ -7,1 +7,2 @@`) made pnpm fail with "hunk header integrity check failed", which broke the deploy install step. Same Mythic and battle-payload-store changes; lockfile patch hash updated.
