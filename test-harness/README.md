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
timing + which interaction produced it), embed titles/fields, and writes any chart
PNG to `test-harness/out/`. Exit code is non-zero if the flow has a violation.

### Multi-step flows (buttons / selects / modals)

`--steps` takes a JSON array of interaction steps pushed through the command's
component collector after the initial response. Each button/select/modal gets the
same protocol grading as the first ack.

```bash
npx tsx .../test-harness/cli.ts enemy-stats \
  --steps '[{"type":"button","customId":"enemy_stats_set_inputs",
            "modalValues":{"enemy_stats_tier":"9","enemy_stats_wave":"3000",
                           "enemy_stats_health_skip":"0","enemy_stats_attack_skip":"0"}}]'
```

- `{"type":"select","customId":"...","values":["hp"]}` — choose select values.
- `{"type":"button","customId":"..."}` — click a button.
- add `"modalValues":{fieldId:value}` to a button that opens a modal — the mock
  drives `showModalAndAwaitSubmit` and fills the submitted fields.

## Sweep (test everything)

```bash
npx tsx .../test-harness/sweep.ts
```

Runs every real slash command with default options and prints a one-line verdict
each. `ERR missing-required-option/subcommand` just means the command needs input
the sweep doesn't supply — not a defect. `VIOL late-ack` is the one to act on.

## Playground (web UI)

```bash
npx tsx ../../TowerToolsBot/The-Tower-Tools-Discord-Bot/test-harness/playground-server.ts
# open http://localhost:8420
```

Pick a command, fill options, Run — the page shows the embed, the real chart, and
the flow verdict. Then **click the buttons/selects it renders** to drive the flow:
a select applies its values, a button that opens a modal shows the modal's real
fields to fill and submit. Every step is re-graded, so a late/double ack in a
button or modal handler shows up here too.

## What the flow check catches

| Rule | Meaning |
|---|---|
| `late-ack` | The handler awaited real I/O (cloud/DB) before acknowledging — under real latency this expires the interaction ("Unknown interaction"). Defer/reply first, then do the work. |
| `double-ack` | `reply`/`deferReply` after the interaction was already acknowledged. |
| `edit-before-ack` | `editReply`/`followUp` before any ack. |
| `modal-not-first` | `showModal` after a defer/reply — a modal must be the first response. |
| `unresolved-defer` | `deferReply` with nothing to resolve it — the reply stays "thinking…" forever. |
| `unresolved-modal` | a modal was submitted but its handler never acked (`reply`/`deferUpdate`/`update`) — the modal hangs. |

Component (button/select) and modal-submit interactions carry their **own** ack
lifecycle, so a `deferUpdate` after a cloud write in a select handler is flagged
just like a late initial defer.

Detection is patch-free: a correct handler acks before yielding to the first
macrotask (real I/O). Proven by planting the fault — moving enemy-stats' defer
after its cloud reads makes the harness report `late-ack`; moving it back to the
top passes.

## What it caught

A sweep found the same late-ack shape across the calculator commands: they read
user storage / ran queries **before** deferring (`resolveUserStorageState`,
`expandManagedAcronymsInText`, usage queries). Fixed by deferring first in
enemy-stats (init + all 6 select/modal handlers), module, thorns, workshop, stone,
bots, remind, guardian, shard-splitter, analytics, settings, checklist.

`define` is left as-is on purpose: its ephemeral-vs-public choice depends on the
acronym lookup, so acking first would change behavior — a product decision, not a
mechanical fix.

## Scope

Drives the initial response **and** scripted button/select/modal steps (CLI
`--steps`, or click-through in the playground). Not modeled: autocomplete
interactions, real collector timeouts/`end` events, and attachment content
(files are captured but their upload isn't simulated).
