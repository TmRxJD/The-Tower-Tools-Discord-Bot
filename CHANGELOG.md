## 2026-10-02 — Mythic battle conditions

- Add Mythic source, shared validation and league selection using a reproducible platform package patch. Existing league destinations remain unchanged; Mythic requires an explicit destination.

# Changelog

## 2026-10-02

### Fixed
- Battle-condition fallback checks current/future tournaments every day and rechecks source updates. Concurrent push/poll deliveries are serialized; older tournaments cannot overwrite newer delivery receipts. Failed polling is contained and retried.

- Ensure fatal bootstrap/shutdown exits the process and disconnects before releasing locks; ordinary resumable gateway disconnects no longer shut down services.
