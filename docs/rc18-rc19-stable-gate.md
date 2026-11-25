# RC.18 / RC.19 — performance and operations
## Implemented
- Chat: scoped known-message cursor, unchanged response without reading message bodies or members; compact list skips contact lookup and truncates preview at SQL source. Read cursor only advances; adaptive 30/60/120s polling, pause hidden tabs, manual refresh resets, no automatic network retries during a failed write. Limit expanded DOM history to 250 messages; return to latest via refresh. Older messages remain in D1.
- Push: original cap 12 claims per invocation, batches of at most 3 concurrent sends, unique receipt claim and no automatic retry of uncertain sends. No new external destination, schedule, or data deletion policy. Provider acceptance is not receipt.
- Glass: solid fallback on small coarse-pointer displays; preserve desktop and reduced-motion behavior. No camera/print changes.
- D1: remove repeated contact reads / full body previews; bounded queue counts and existing indexed cursors. No speculative index/migration beyond 0021.
- Operations: per-request UUID and Server-Timing duration, sanitized unhandled API failure, in-session capped HTTP error references, read-only probe durations and capped queue counts. Not persistent logs, not real CPU, not p95 or global metrics. No personal payload or credentials recorded. 
- CI regression: use SQL RETURNING target rows rather than meta.changes (trigger writes can affect D1 count), update 0021 expectations. Verify actual workerd CI, not just SQLite.
## Stable release gate (manual, no auto-publish)
- [ ] All Node and workerd browser suites green on exact final commit, no P0/P1 open.
- [ ] Review CI evidence and physical iOS/Android/PC acceptance (camera/GPS, network loss/recovery, notification, responsive).
- [ ] Confirm D1 migration 0021 table + two triggers and production health schema ready after deployment; verify 14 store coordinates and scoped users.
- [ ] Real payroll policy validated, golden fixtures and exports compared; no unreviewed anomaly.
- [ ] Back up D1 and KV independently and restore in isolation; verify integrity and photo access.
- [ ] Record production CPU, request latency p50/p95/p99 and actual account-wide D1/KV usage; check no unexpected fees.
- [ ] Confirm scheduler secrets and enabled policy, alert delivery on devices, retention/eviction approval.
- [ ] Security residual risks in RC.16 reviewed; explicit release sign-off, rollback commit and deployment verification.
No release, merge or production migration in this change. Health and CI alone do not satisfy the Stable gate.
