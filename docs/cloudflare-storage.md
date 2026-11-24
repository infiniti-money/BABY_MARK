# Cloudflare D1 + R2 migration (pilot)
Goal: business records in D1, server-stamped JPEGs in private R2. Current operational code remains PostgreSQL/Next.js until replacement is tested. Do not point real staff at the pilot. Supabase Auth remains identity provider during the pilot; its database and storage are not the target for business records. Replacing Auth is a separate decision.

## Cloudflare dashboard
1. Create D1 database `babymark-db`. In D1 Console execute cloudflare/d1/0001_initial.sql then 0002_store_catalog.sql once, in a new database. Confirm 14 branches. Do not use guessed GPS.
2. Enable R2, create Standard bucket `babymark-timemark`. Leave public development URL and public domain disabled. Billing activation may be required. Never upload employee data for tests.
3. On Pages project babymark → Settings → Bindings, add D1 binding DB and R2 binding TIMEMARKS. Set SUPABASE_AUTH_URL and SUPABASE_PUBLISHABLE_KEY for read-only photo pilot. No service role key in Pages frontend. Root repo, output docs, no framework/build command. Redeploy. Verify /api/cloudflare/health returns ready:true; this means bindings/schema only, not a working attendance service.
4. Photo pilot GET /api/cloudflare/photo/<record-id> requires bearer access token, checks active profile and owner/admin/branch-manager scope, looks up R2 key via D1, and never exposes the bucket. No existing images are migrated by this commit.

## Required before replacing the existing system
- Implement D1-backed employee management, authenticated attendance write with server-generated timestamps, geofence and image stamping. Current sharp native image processing cannot be assumed to work in Pages runtime; retain trusted image processor or implement and test a compatible processor. Do not trust client-only timestamps/overlays.
- Implement scoped query APIs for all reports, shifts, approvals, notifications, cron, audit and authorization. D1 does not implement PostgreSQL RLS. Test denial for cross-branch reads/writes and direct photo paths.
- Replace Supabase queries in web/mobile, provide authenticated endpoints and realtime strategy. Move secrets only via dashboard. Keep same API contracts or explicitly version them.
- If any production records exist, export with consent/authorization; import and verify counts, foreign keys, timestamps and checksums, copy private JPEG objects, reconcile missing files. Do not dual-write or delete original data without reconciliation and rollback plan. No migration has run.
- Define retention and recovery policy; audit storage billing. R2 10 GB-month free tier is not an unlimited quota; D1 has read/write quotas.
