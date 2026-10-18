# Runner-controlled deployment

Commit reviewed sources, push main, and let the repository's existing self-hosted
GitHub Actions runner pull with --ff-only. The runner rejects local changes,
wrong repositories, non-main branches and stale jobs. HEAD, live origin/main and
the triggering GITHUB_SHA must match before production commands run.

Production npm scripts and deployment activation check runner context. Every
activation compiles sources, records the expected Git revision and previous PID,
and passes DEPLOYED_GIT_SHA into PM2. Verification requires a fresh online process
with that SHA, no restarts during its observation window and no new stderr since
activation. ModBot additionally requires fresh Discord gateway readiness bound
to that process PID. ToolsBot currently has no equivalent Discord readiness
telemetry: its process checks alone do not prove Discord connectivity.

Repository dispatch no longer deploys unpushed dependency changes. Platform
updates must be reviewed, committed and pushed first. Rollbacks follow the same
push and runner sequence. No manual PM2 fallback or direct restart is authorized.

Local .npmrc contains host credentials and stays untracked and byte-for-byte
preserved. Use .npmrc.example for credential-free defaults. Runtime databases,
delivery queues, .env files and .data are host state, never source artifacts.

These checks prevent accidental direct deployments, not an administrator bypass.
Anyone able to edit source, forge environment variables, invoke PM2 directly or
write production files can bypass them. Strong enforcement requires separate
deployment identities, filesystem permissions and protected repository settings;
none of those access or credential changes were made here.
