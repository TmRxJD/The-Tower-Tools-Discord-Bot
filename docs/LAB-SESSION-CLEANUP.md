# Lab interaction cleanup

## Five-row layout and validation diagnostics: 2026-10-30

Legacy Discord messages allow at most five action rows. Selecting an Ultimate
Weapon lab needs category, weapon type, lab and speedup select rows, followed by
the control buttons. Lab therefore puts its existing Share button into that
four-button control row when a separate Share row would become a sixth row.
Its label, custom ID and enabled state are preserved. Existing layouts that fit
the limit keep their separate Share row. Cleanup rebuilds this same layout and
disables every control, including after a rejected refresh.

Lab failures record a caller-owned operation, action, stage and route kind,
hashed interaction/session correlations, acknowledgement state and stage timings.
Modal-wait timing includes the user's wait for submission. Payload diagnostics
contain bounded counts and lengths only. Discord 50035 validation metadata is
limited to 16 schema paths/codes, with depth/node/child limits, cycle protection
and redaction of unknown keys/codes. Raw request/response bodies, validation
messages, tokens, identities, full URLs, filenames and input contents are omitted.

The October 30 historical logs lacked the rejected field and stage, so the
six-row defect is an offline reproduction consistent with the observed component
and cleanup failures, rather than proof of every historical 50035 field.
Regression coverage invokes the actual handler, Share helper, builders and
webhook serializer with all Discord writes intercepted. It covers all 211
reachable selections (33 Ultimate Weapon labs), follow-on settings/range/toggle/
speedup actions, cleanup after rejection, and real PNG attachment references.
The offline suite uses at most four workers on the shared Windows runner host.

See the [Discord component limit](https://docs.discord.com/developers/components/reference#legacy-message-component-behavior),
[lab handler](../src/commands/lab.ts) and [layout regressions](../src/commands/lab-layout.test.ts).

## Original token lifetime repair

The observed 2026-10-15 cleanup failure was Discord error 50027, Invalid Webhook Token. The lab collector previously ran for 15 minutes starting after initial rendering, then called the original interaction's `editReply`. Discord's [interaction documentation](https://docs.discord.com/developers/interactions/receiving-and-responding) gives that original token a 15-minute lifetime from interaction creation. Thus normal collector expiry could run cleanup after the token had expired; this was not evidence that the bot's login token was invalid.

The lab collector now uses the earlier of its configured duration and the original token deadline minus 30 seconds. Time already spent creating the first reply is included. Scoped ownership is still released when the collector ends, before cleanup.

Cleanup skips an already-expired original token. An invalid webhook token (50027), unknown webhook (10015) or deleted response (10008) is terminal for this best-effort cleanup only: no retry, alternate credential, channel send or public fallback occurs. Permission failures, malformed payloads, transport errors and other unexpected exceptions still reach `runCollectorTask` diagnostics.

Isolated tests cover deadline/headroom calculations, shorter configured sessions, expired tokens, one successful edit, terminal cleanup responses, and propagation of unrelated errors. Existing collector acknowledgement tests remain in the focused run. No real Discord response or live settings are used for testing.

## Verified routine deployment: 2026-10-15

- Full isolated regression: 43 files / 173 tests passed in 32.74 seconds. Build, type check and changed-file lint passed. The existing lab fixture now supplies Discord's real `createdTimestamp` field; integration cases verify ownership release before unavailable cleanup and no edit after expiry. The helper/acknowledgement focused run passed 18 tests.
- Deployed with the existing `node scripts/deploy.mjs activate`, without staging, commits or pushes. PID `11584`, restart count `74`; the verifier observed no further restart during its 30-second window (64 seconds online at completion).
- Process-bound telemetry at `2026-10-15T22:12:20.997Z` matched PID `11584`, reported ready and contained 26 gateway dispatches / 24 incoming message events since restart. No error entries appeared after startup in the read-only log evaluation at `22:12:55Z`.
- No natural lab expiry had occurred in the short post-deploy window. Cleanup behavior is established by isolated tests, while process readiness and gateway activity are live evidence. No synthetic post, credential/access change or live user-state replay was used. The unrelated `.npmrc` edit was preserved byte-for-byte.
