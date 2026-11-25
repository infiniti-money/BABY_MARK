# RC.16 — Security and recovery review (baseline RC.15)
Source review of all 25 API modules plus middleware, not a penetration test or proof of absence of vulnerabilities.

| Route family | Intended authorization |
| --- | --- |
| cloudflare/health GET | Public readiness booleans, no employee records |
| auth login/password-salt POST | Public, bounded payload; credential verification and per-account login throttling |
| auth me/sessions/devices/self-salt, logout/change-password/revoke | Current authenticated account; self password change non-admin |
| auth accounts/create/reset/set-active/rename | Admin; no creating or modifying admin accounts through these actions |
| admin resource/audit-log/diagnostics/employment/operations/overview/payroll/rosters | Admin; audit view metadata only |
| assignments/reports/workforce/extra-attendance GET | Own assignment, manager assigned branches and own, admin all |
| alerts | Manager scoped and admin |
| workforce/extra-attendance decide | Admin or assigned manager; no self approval |
| attendance prepare/submit/status/cancel/history, timemark-preview | Own account/assignment; no admin bypass |
| cloudflare/photo/[id] | Own, assigned manager or admin; D1 session, scope and lifecycle before/after KV read |
| handover | Own/authorized manager/admin or eligible following shift at branch; own checkout to write |
| messages | Authenticated contacts/system announcements; only member private reads; admin only system send |
| my-decisions | Own decisions only |
| push config/status/subscribe/unsubscribe/test | Authenticated; subscription ownership relies on endpoint secrecy, admin settings only |
| maintenance retention/push/rosters POST | Dedicated configured secret, no ordinary user session access |

## Changes
- Revalidate admin session/role and target at create/enable/disable write; guarded audit and session removal. No credential or attendance data in new logs.
- Private image route revalidates session, branch scope and expiry after async KV read; return no image if revoked meanwhile.
- Extra approval revalidates current actor at write and writes audit only when change succeeds.
- Message send validates session and enforces 30/min inside INSERT.
- Add negative route matrix and deterministic revocation race tests. Existing audit metadata pagination and ownership tests retained.

## Residual risks / next gates
- Many other write endpoints authorize at request entry, not every mutation boundary. Expand per-write session and scope guards with fault tests; do not claim comprehensive TOCTOU protection.
- Browser bearer storage remains accessible to same-origin script; audit DOM sinks, plan CSP and HttpOnly-cookie transition separately. Existing salt endpoint does not guarantee enumeration resistance. Push endpoint ownership is not device attestation. No E2EE for chat. Staff contacts and eligible branch notes deliberately visible; review business policy, including rejected extra shifts.
- Admin audit logs are application metadata, not tamper-evident external logs. No automatic immutable ledger, no session lifecycle log added. Database administrators retain direct SQL access.
- Recovery: retain RC.15 owner-scoped status/cancel, do not reset PROCESSING or release uncertain photo bytes automatically. D1 export and separate encrypted KV backup; isolated restore with row counts/hash/sample photos, no production restore without approval. Verify production backup and physical devices separately.
- Health catalog only, not schema checksum. Existing photo eviction enabled per user-provided health; no change to policy. Verify Cloudflare settings, real secrets, quotas and network in authorized environment.
- No migration, production changes or secrets used; test fixtures isolated. No claim of production security certification.
