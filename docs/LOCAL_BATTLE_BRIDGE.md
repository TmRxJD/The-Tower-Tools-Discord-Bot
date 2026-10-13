# Local battle-condition payload bridge

ModBot is the authorized source reader. ToolsBot requests only Guilds and GuildMessages; it never fetches source message content. Define's message-context action and reads of ToolsBot's own giveaway messages use Discord's documented exceptions.

## Transport and storage

- The shared `@tmrxjd/platform/node` payload store is shipped in each repository's existing tracked platform patch. The lockfile pins its patch hash.
- ModBot writes source content, full embeds and bounded attachment bytes to `data/battle-payloads/<rank>/<version-hash>.json`. Publication uses a flushed temporary file and an atomic no-overwrite hard link. The current deployment uses the existing local NTFS volume.
- `data/battle-payloads/pending` retains validated capture jobs until their payload is durable. A single worker retries every 30 seconds; failed or malformed jobs remain for diagnosis. Attachments are limited to Discord CDN HTTPS origins, 20 MiB combined, 10 files; redirects are refused. No credentials or ACL changes are involved.
- The existing loopback metadata notification accelerates delivery; the existing fallback scheduler reads the durable local store if a notification is lost or ToolsBot is down.
- Existing subscription destinations, enabled flags, rendering and mention suppression are preserved. Failed sends do not advance subscription delivery receipts.

## No historical replay

`activation.json` records the initial activation time. Older events cannot become automatic deliveries. Startup reconciliation captures the latest six source messages as view-only, without sending them. Duplicate versions are immutable; a later duplicate cannot turn a seed into a live event. New live source posts/edits are eligible; superseded versions and past tournaments are excluded. `/battle_conditions view` can render captured entries locally. Older entries never captured by the bridge report unavailable rather than returning an invented reconstruction.

## Delivery safety and recovery

ToolsBot keeps `.data/battle-delivery-receipts/<nonce>.json`. A sent receipt returns the original message ID across restarts. A pending receipt after a transport failure or crash is deliberately held: delivery may have succeeded, so it must not be blindly replayed. Inspect the destination for the bot's message and reconcile the receipt before allowing another attempt. Explicit Discord 4xx rejections release the claim for a later retry. Existing Discord nonce deduplication remains enabled.

No historical uploads, cloud schema, authentication settings, source collection retention or unrelated bot modules are modified. Source-capture failures remain pending with warnings. Expired attachment URLs or inaccessible referenced messages may require a fresh capture by the authorized ModBot; ToolsBot does not bypass this boundary.

## Verification

Tests use temporary files, mocked Discord sends and an ephemeral loopback server, never the production port. Coverage includes byte/render preservation, duplicate/concurrent writes, stale and malformed input, restart/retry, source-access absence, stored successes and ambiguous-send holds. Deployment uses isolated TypeScript build output and copies only named bridge modules, preserving unrelated source changes.

After activation, verify both processes' fresh PID-bound readiness, the six local ranks, an empty pending queue, notifier state, and absence of new login failures. A naturally occurring source update/real user command is still required to observe a live public response; do not manufacture public tests.

Rollback: stop only the affected bots, restore the named deployed files from the incident manifest backups, and restore the platform patch/lockfile and modules consistently. Preserve all payloads, pending jobs, activation time, subscriptions and receipts. Do not restore ToolsBot's old privileged-intent request while that access remains absent; use the first recovered consumer build or keep ToolsBot stopped. Never erase receipts to force a replay.
