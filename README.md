# BABY_MARK — Cloudflare attendance
Active target: static `public/` + root `functions/` on **Cloudflare Pages/Functions + D1 + KV only**. No Supabase, R2, Node server, Sharp, or Images binding is used by this target.

Audited from main `de439b9e48e86ec179b769ebd9ec88c78a8a37c7` on 24 November 2026. The old Next.js/Expo/Supabase folders remain historical source and are excluded from the active build. No production deployment, resource creation, remote migration, or live deletion was performed.

## Working target
- Administrator-issued accounts, one-time random access codes, reset/lock and immediate session revocation; no public signup.
- Fourteen catalog stores with administrator-managed verified GPS/address/radius; fifty active staff and managers, excluding administrators.
- Employee camera/GPS capture, server-issued 90-second challenge, browser Timemark with 40% translucent cards, JPEG at most **200,000 bytes**, private KV photo history.
- D1 validates active identity, assignment, allowed time window, GPS range/accuracy, server distance, IN-before-OUT, duplicate/replay, and current session at finalization.
- Branch/employee/shift/overnight assignment and manager-scope management; overlap/history guards and audit records.
- Scoped reports and formula-safe UTF-8 CSV for Excel; leave/correction submission and approval preserve original evidence.

**Image trust:** the photograph is composed on the device. A stored hash/challenge does not establish liveness, real GPS, visible stamp correctness or shutter time. D1 `server_timestamp` is accepted-upload time; `stamp_issued_at` is preparation time, at most 90 seconds earlier. [Trust/runtime details](docs/cloudflare-runtime-audit.md).

## Local validation
Node >=22.13 (Node 22 in CI; local checks used Node 26.13). Install and lock development tools, then:
```text
npm ci
npm test
npm run check:runtime
npx playwright install chromium
npm run test:browser
```
Windows browser tests use installed Microsoft Edge; Linux CI uses Chromium. The acceptance server uses ephemeral workerd/D1/KV and generated test accounts only. It never connects to an existing Cloudflare account or database. Test mutations/deletions affect disposable local fixtures.

`npm run dev` starts Pages locally with local bindings; it requires local schema and administrator initialization. See [operations](docs/cloudflare-operations.md). No publish command is included in CI.

## Storage and deployment gates
Photo payload budget **900,000,000 bytes**, oldest first; maximum TTL sixty days. At 100 photos/day of 200 KB, budget holds about **45 days**, not sixty guaranteed days. D1 attendance retention is two calendar years, with dispute holds. Capacity eviction and attendance cleanup are **disabled by default** until the operator reviews the policy and inventory.

Production still needs actual binding IDs, only unapplied migrations, a securely bootstrapped administrator, real GPS verification for all stores, approved retention, recovery procedure, physical-device acceptance and free-tier CPU/quota measurement. Pages alone has no scheduled handler: guaranteed no-traffic D1 cleanup remains a scheduling decision. Native Expo migration, push/realtime, shift swaps, XLSX workbooks and payroll are pending.

- [Audit and remaining blockers](docs/audit-2026-11-24.md)
- [Local/production operations and recovery](docs/cloudflare-operations.md)
- [Hosting target](docs/hosting.md)
- [Release checklist](docs/release-checklist.md)
- [Storage](docs/cloudflare-storage.md) · [Internal accounts](docs/internal-auth.md) · [Timemark](docs/timemark.md)
