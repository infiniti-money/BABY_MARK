# Backup and recovery — v1.2 candidate
Owner-only controlled procedure. No scheduled backup or restore is enabled.
## Before a change
- Record exact Git commit, Pages deployment ID, D1 database and KV namespace identity, applied migration history, timestamp and operator. Verify target in Cloudflare Dashboard.
- Export D1 using Cloudflare's authorized export facility (includes private employee data and credential verifiers). Store encrypted offline with access restricted to authorized administrators; never upload to GitHub or chat. Record SHA-256 and file size. D1 Time Travel coverage and quota must be checked in the account.
- D1 backup does not contain KV JPEGs. Separately inventory private KV photo keys, bytes and expiry with authorized access; export only under approved privacy/retention procedure to encrypted storage. Record gaps and expiry. Do not claim a transactionally consistent D1/KV backup during active writes. Arrange maintenance window if required.
## Restore rehearsal
- Use a new isolated local/staging database and namespace, not existing production; no production binding or secret. Verify target twice. Import only a trusted export using supported Cloudflare/local tools; never execute untrusted SQL.
- Compare tables, counts, integrity, foreign keys, migration history, constraints, original attendance and payroll revisions; sample photo hashes/expiry and preserve original evidence. Test access and session revocation. Do not expose staging to public.
- Production restore requires separate explicit approval, downtime plan and rollback point. Do not overwrite D1 or KV based on these instructions alone. Missing/expired photos may be unrecoverable.
## Stuck attendance
- Admin diagnostics reports old PROCESSING and lock/uncertain inventory counts (capped at 101). These indications do not prove an invocation stopped.
- Confirm original invocation is no longer running, then inspect D1 challenge, attendance, immutable inventory and actual KV object privately. Distinguish committed attendance, pending write and unknown state. Do not retry a new capture until outcome established.
- No automatic lease stealing, deletion, or blind reset. Require a separately reviewed reconciliation operation with affected records, evidence, expected old state, rollback plan and operator authorization. Keep retention and eviction unchanged.
