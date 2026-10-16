## 2026-10-16 - Creator code submissions

- Add `/creator add` with a private form for a creator code and what the creator is known for. Reject empty, overlong, mention-containing values and duplicate users or codes, and persist accepted submissions in the existing SQLite KV store so they appear in `/creator list`.