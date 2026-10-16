# Lab interaction cleanup

The observed 2026-10-15 cleanup failure was Discord error 50027, Invalid Webhook Token. The lab collector previously ran for 15 minutes starting after initial rendering, then called the original interaction's `editReply`. Discord's [interaction documentation](https://docs.discord.com/developers/interactions/receiving-and-responding) gives that original token a 15-minute lifetime from interaction creation. Thus normal collector expiry could run cleanup after the token had expired; this was not evidence that the bot's login token was invalid.

The lab collector now uses the earlier of its configured duration and the original token deadline minus 30 seconds. Time already spent creating the first reply is included. Scoped ownership is still released when the collector ends, before cleanup.

Cleanup skips an already-expired original token. An invalid webhook token (50027), unknown webhook (10015) or deleted response (10008) is terminal for this best-effort cleanup only: no retry, alternate credential, channel send or public fallback occurs. Permission failures, malformed payloads, transport errors and other unexpected exceptions still reach `runCollectorTask` diagnostics. Other lab callbacks and their acknowledgement/error behavior are unchanged.

Isolated tests cover deadline/headroom calculations, shorter configured sessions, expired tokens, one successful edit, terminal cleanup responses, and propagation of unrelated errors. Existing collector acknowledgement tests remain in the focused run. No real Discord response or live settings are used for testing.

## Verified routine deployment: 2026-10-15

- Full isolated regression: 43 files / 173 tests passed in 32.74 seconds. Build, type check and changed-file lint passed. The existing lab fixture now supplies Discord's real `createdTimestamp` field; integration cases verify ownership release before unavailable cleanup and no edit after expiry. The helper/acknowledgement focused run passed 18 tests.
- Deployed with the existing `node scripts/deploy.mjs activate`, without staging, commits or pushes. PID `11584`, restart count `74`; the verifier observed no further restart during its 30-second window (64 seconds online at completion).
- Process-bound telemetry at `2026-10-15T22:12:20.997Z` matched PID `11584`, reported ready and contained 26 gateway dispatches / 24 incoming message events since restart. No error entries appeared after startup in the read-only log evaluation at `22:12:55Z`.
- No natural lab expiry had occurred in the short post-deploy window. Cleanup behavior is established by isolated tests, while process readiness and gateway activity are live evidence. No synthetic post, credential/access change or live user-state replay was used. The unrelated `.npmrc` edit was preserved byte-for-byte.
