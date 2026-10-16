## 2026-10-16 - Creator code submissions

- Add the /creator add modal for a creator code and what the creator is known for. The last field checks the entered value against 1509606869336068347 and does not verify membership. Reject empty or overlong values, mentions, incorrect server IDs, duplicate users or codes; persist accepted submissions in SQLite so they appear in /creator list.

## 2026-10-16 - Creator add fixes

- Fix /creator add rejecting valid submissions: handles inside links (youtube.com/@name) and line breaks are now accepted; only real mentions (@everyone, @here, <@id>) are blocked.
- Limit creator codes to 30 characters and descriptions to the length of the longest current description.
- Expand bare domains in descriptions to https:// links so they render as links in the /creator list.
