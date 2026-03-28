# Tower Tools Bot Architecture

## Project Goals

- Keep command, component, and modal handling predictable across the bot.
- Route persistent interactions through one global registry instead of scattering lookup logic across command files.
- Preserve command-local ownership for collector and modal flows so unrelated interactions are ignored quietly instead of producing false errors.
- Keep interaction id construction explicit so future commands can extend the bot without introducing collisions.

## Core Interaction Files

```text
src/
  bot.ts                                  # client bootstrap and startup wiring
  core/
    interaction-router.ts                 # single global interactionCreate listener
    component-registry.ts                 # kind-aware component and modal registry
    scoped-interaction-session-registry.ts# command-local ownership guard for collector flows
  interactions/
    index.ts                              # startup registration for persistent handlers
  services/
    modal-submit.ts                       # shared helper for owned modal submit waits
```

## Interaction Flow

1. `bot.ts` creates `ToolsBotClient` and registers commands plus persistent component handlers at startup.
2. `interaction-router` listens once to `interactionCreate` and dispatches in this order:
   - slash commands
   - message context menu commands
   - registered message components or modals through `component-registry`
3. Before global component dispatch, the router checks `scopedInteractionSessions.owns(interaction)`.
4. Interactions already claimed by a command-local session are ignored by the global registry so collector-owned flows do not collide with persistent handlers.

## Interaction Rules

- Persistent components belong in `src/interactions/index.ts` and must be registered through `component-registry`.
- Command-local sessions should claim ownership through `scoped-interaction-session-registry.ts` instead of adding temporary global registrations.
- Command-local modal flows should use `showModalAndAwaitSubmit(...)` from `src/services/modal-submit.ts` rather than inlining `awaitModalSubmit(...)` filters.
- Any modal or collector wait must be scoped by both user id and a unique interaction-specific custom id.
- Router support must remain broad enough for buttons, all select-menu variants, and modals even if a specific component kind is not used yet.
- Unregistered component or modal submissions should fail quietly at the router level unless the interaction is genuinely expected to be persistent.

## Custom Id Conventions

- Use stable prefixes for persistent handlers so the registry can route them by exact or longest-prefix match.
- Use unique session suffixes for command-local interactions so multiple active sessions cannot collide.
- Keep id construction near the feature config or shared helper that owns the interaction family.

## Parity Notes

- ToolsBot now follows the same core routing model as ModBot and TrackerBot: one router, one kind-aware registry, quiet fallthrough for unclaimed interactions, and shared helpers for owned modal waits.
- Feature sets still differ across bots, but the interaction framework contract should stay aligned across all three repositories.
