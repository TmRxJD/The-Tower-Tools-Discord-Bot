# Changelog

## 2026-10-02

### Fixed
- Battle-condition fallback checks current/future tournaments every day and rechecks source updates. Concurrent push/poll deliveries are serialized; older tournaments cannot overwrite newer delivery receipts. Failed polling is contained and retried.
