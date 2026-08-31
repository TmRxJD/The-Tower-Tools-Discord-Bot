# Bot command harness

Test bot commands offline — no Discord, no login, no live server. Discord
interactions are just data, so a command's `execute(interaction)` can be driven by
a mock. The mock is **protocol-enforcing**: it models the interaction lifecycle and
flags the bugs that only ever surface live — late acks, double acks, editing before
acking, `showModal` after deferring, and deferrals that never resolve.

Run everything from the **monorepo root** (`the-tower-run-tracker`), where this
bot's `@tmrxjd/platform` peer (and its `thetowersdk`/`tracker-languages` transitive
deps) resolve.

## CLI

```bash
npx tsx ../../TowerToolsBot/The-Tower-Tools-Discord-Bot/test-harness/cli.ts enemy-stats --tier 5 --wave 1000
```

Prints the interaction-flow verdict, each response (defer/reply/editReply with
timing), embed titles/fields, and writes any chart PNG to `test-harness/out/`.
Exit code is non-zero if the flow has a violation — usable in CI.

## Playground (web UI)

```bash
npx tsx ../../TowerToolsBot/The-Tower-Tools-Discord-Bot/test-harness/playground-server.ts
# open http://localhost:8420
```

Pick a command, fill options, Run — the page shows the embed, the real chart, and
the flow verdict. This is the closest thing to "test it in the UI" for a bot.

## What the flow check catches

| Rule | Meaning |
|---|---|
| `late-ack` | The handler awaited real I/O (cloud/DB) before acknowledging — under real latency this expires the interaction ("Unknown interaction"). Defer/reply first, then do the work. |
| `double-ack` | `reply`/`deferReply` after the interaction was already acknowledged. |
| `edit-before-ack` | `editReply`/`followUp` before any ack. |
| `modal-not-first` | `showModal` after a defer/reply — a modal must be the first response. |
| `unresolved-defer` | `deferReply` with nothing to resolve it — the reply stays "thinking…" forever. |

Detection is patch-free: a correct handler acks before yielding to the first
macrotask (real I/O). Proven by planting the fault — moving enemy-stats' defer
after its cloud reads makes the harness report `late-ack`; moving it back to the
top passes.

## Scope

v1 drives the **initial** command response (defer + first render). Commands that
continue through buttons/selects/modals (a `createMessageComponentCollector` or
`showModalAndAwaitSubmit`) expose a `__emit` hook on the mock collector for a
follow-on that pushes simulated component interactions — not wired into the CLI or
playground yet. So for enemy-stats the playground shows the default view; tier/wave
are entered via its modal, which the interactive extension will drive.
