# Cloudflare operations and acceptance

This is the operating guide for the new Pages application. No production resources were created, changed, deployed, migrated or deleted during this upgrade. The repository configuration contains placeholder resource IDs. The deletion policies below remain disabled by default.

## Active application

Run commands from the repository root. `public/` is the browser application; `scripts/build.mjs` copies it and the shared Timemark layout to `dist/`. `functions/` supplies Pages Functions, `DB` binds D1, and `TIMEMARKS` binds ordinary Workers KV. The active application has no Supabase, R2, Cloudflare Images or native Sharp dependency. `apps/web`, `apps/mobile` and `supabase/` remain historical source, outside the active build. Do not deploy `docs/` as the attendance application.

| Configuration | Meaning |
| --- | --- |
| Pages build command | `npm run build` |
| Pages output | `dist` |
| Functions | Repository-root `functions/` |
| Compatibility date | `2026-11-24` |
| D1 binding / migrations | `DB` / `cloudflare/d1` |
| Private photo binding | `TIMEMARKS` |
| `PHOTO_EVICTION_ENABLED` | Default `false`; capacity overflow fails closed until an operator separately enables oldest-first eviction |
| `ATTENDANCE_RETENTION_ENABLED` | Default `false`; authenticated attendance cleanup is unavailable until separately enabled |
| `RETENTION_SECRET` | Required secret of at least 32 characters for an enabled maintenance endpoint; never place it in source or browser configuration |

The placeholder IDs in `wrangler.toml` are not deployment-ready resource identifiers. There is no deploy step or production credential in the verification workflow.

## Local verification

Use Node 22.13 or later and the committed lockfile. The verification recorded for this upgrade used Node 26 locally. GitHub Actions is configured for Node 22; a workflow definition is not a recorded successful CI run.

```sh
npm ci
npm test
npm run check:runtime
npm run test:browser
```

`check:runtime` builds the static application and compiles Pages Functions with pinned Wrangler 4.167.0; it does not deploy. Browser tests use `scripts/local-test-server.mjs`, local workerd/Miniflare, real ephemeral D1/KV bindings, synthetic accounts, a fake camera and synthetic GPS. Windows uses the installed Microsoft Edge; CI installs Chromium. Run the build/runtime check before browser tests so `dist/` and the Functions bundle exist.

`npm run dev` starts local Pages development but does not bootstrap a real administrator or apply remote migrations. Disposable acceptance data is created only by the test server. Its known test credentials and coordinates are fixtures; never import them into production.

For a separate persistent **local-only** development database, initialize it explicitly:

```sh
npx wrangler d1 migrations apply DB --local
node cloudflare/scripts/bootstrap-admin.mjs admin-local
npx wrangler d1 execute DB --local --file=bootstrap-admin.local.sql
npm run dev
```

The bootstrap command displays a newly generated local secret; save it privately. The SQL file is ignored by Git and must not be shared or committed. These commands are instructions, not commands executed in this audit. The `--local` flags are essential; do not substitute remote resources during source verification.

## Accounts and responsibilities

There is no public registration. A trusted operator bootstraps the first administrator; administrators issue staff/manager accounts, reset their access codes, lock/unlock accounts and edit profiles. Issued access codes are 192 random bits represented as 48 hexadecimal characters. They are intentionally machine-generated secrets, not human-password hashes. Displayed codes must be saved securely by the authorized administrator and handed to the intended employee; do not paste them into tickets, logs or source control.

Login issues a random bearer session lasting eight hours. D1 stores its hash and checks current account activation and credential version on requests. Reset and disable revoke sessions. The first-administrator helper writes an ignored local SQL file and displays a new secret; running that helper and applying its output are separate operator actions, not automatic deployment steps.

The D1 trigger caps active staff plus managers at 50, excluding administrators. The catalog seeds 14 named stores with intentionally unverified coordinates. An administrator must confirm actual GPS, radius and address. Attendance is rejected while the assigned store lacks GPS. Managers read and approve their assigned stores plus their own records; they cannot administer global accounts, stores or shifts. Nobody may approve their own leave/correction request.

Schedules use Vietnam dates and UTC epoch milliseconds. End times earlier than start times mean the next day; equal start/end times are rejected. D1 prevents overlapping employee assignments, edits to assignments with history, and relevant schedule/store edits while a submission is `PROCESSING`. Changing a shift template does not recalculate existing assignment timestamps.

## Attendance and image trust

The browser obtains live camera/GPS permissions, requests server metadata, blends the transparent SVG overlay into the photo, and repeatedly adjusts JPEG quality/dimensions to stay at or below **200,000 bytes**. The overlay uses 40% floating information panels and a clear central area; the finished JPEG has no alpha channel.

`POST /api/attendance/prepare` creates an authenticated, assignment-bound challenge valid for 90 seconds. `POST /api/attendance/submit` accepts that challenge and one JPEG. It validates request/byte limits and JPEG structure/dimensions, rechecks the assignment and active session, stores the image through D1 inventory and KV, and writes attendance with unique `(assignment_id,type)` protection. OUT requires an accepted IN. Replaying a completed challenge with the same image hash returns the accepted record; different bytes are rejected.

The accepted record explicitly carries `photo_source='CLIENT_RENDERED'` and SHA-256. `server_timestamp` and `received_at` are the server's upload acceptance time; attendance lateness/early departure is calculated from that time. `stamp_issued_at` is the earlier server preparation time displayed in the image, at most 90 seconds before accepted submission. `metadata_json` preserves the issued metadata. An older image timestamp must not be represented as the final attendance timestamp.

These checks bind authenticated metadata and accepted bytes. They do **not** prove camera liveness, genuine GPS, the capture location, or that the visible text matches the server record. JPEG structure checks are not a full server pixel decode. The browser's rendered stamp is not a server-rendered evidentiary seal. Sharp/native addons cannot simply be imported into Workers; a separate server compositor would need measured runtime support and would still not prove physical location or liveness. See [the runtime audit](./cloudflare-runtime-audit.md).

## Photos, capacity and recovery

Photo reads use `/api/cloudflare/photo/{attendance_id}` with bearer authorization. D1 applies owner/admin/scoped-manager access and checks retention/lifecycle state before KV reads. Responses are private/no-store. KV is eventually consistent, so a new photo can temporarily return unavailable even when attendance is accepted. Check history and use a bounded photo retry; do not create a second attendance merely to recover the preview.

The inventory counts `pending`, `stored` and `evicting` bytes against **900,000,000 bytes**. KV TTL is set from the server challenge issue time plus 60 days, so it may expire up to 90 seconds before a 60-day period measured from final upload. Reads also deny expired attendance photos independently. Reconciliation keeps a two-minute grace before releasing expired inventory accounting.

At 50 staff × two images/day × 200,000 bytes, 60 days would require 1.2GB. The 900MB budget holds about **45 days** at that maximum size/frequency. Sixty days is a maximum lifetime, not guaranteed availability. Sixty days at two images/day requires an average at or below 150,000 bytes/image; extra shifts/retakes reduce the window.

With `PHOTO_EVICTION_ENABLED=false`, an upload that would exceed capacity returns an unavailable-storage response rather than deleting photos. When separately enabled, the helper evicts oldest-first, hides each candidate in D1 before KV deletion, and bounds one request to ten evictions. Attendance metadata remains even after photo eviction.

D1 and KV do not share a transaction. An uncertain put remains `pending` and counted. A failed delete remains `evicting`, counted and inaccessible through the photo endpoint. A terminated invocation can leave `photo_storage_lock` owned or a challenge `PROCESSING`; there is deliberately no automatic lease stealing. Such states can block writes or schedule edits.

For recovery, an authorized operator must first establish that the original invocation has stopped, inspect the challenge, attendance, inventory and relevant KV state, and reconcile the actual result. Confirm whether attendance was committed before inviting a new capture. Do not free counted bytes solely because a call failed, blindly clear locks, reuse immutable photo keys or delete unknown KV objects. Recovery actions require a separately reviewed production procedure; this upgrade does not execute them.

## Reports and maintenance

`/api/assignments` and `/api/reports` scope data by authenticated role before applying date/store/employee filters. Reports accept at most 93 days and 5,000 assignments per request; larger requests fail explicitly so the operator can narrow them. CSV is UTF-8, Excel-readable and formula-escaped; native XLSX is not implemented. Original IN/OUT times and approved correction times have separate columns. Approved corrections do not modify raw attendance, GPS or photos. Outside-region evidence remains flagged and excluded from the reported completed-work minutes. Reports are not payroll calculations.

`POST /api/workforce` submits per-assignment leave/corrections or records a scoped decision. D1 prevents an approved-leave/attendance race. Pending/recent requests and decisions can hold old assignments beyond the nominal retention cutoff for review.

`POST /api/maintenance/attendance-retention` requires both `ATTENDANCE_RETENTION_ENABLED=true` and a matching bearer `RETENTION_SECRET`. There is no destructive GET handler. Cleanup uses two calendar years at Vietnam midnight, clamps leap dates, preserves pending/recent disputes and evidence plus `PROCESSING` submissions, and removes at most 50 eligible assignments with dependents per atomic D1 batch. Photo TTL and image-budget policy are independent.

Pages routes do not create a scheduler. No scheduled Worker or external caller was added. With maintenance disabled or no authorized calls, old D1 data remains. Decide the deletion policy, operational ownership and any separately authorized scheduler before promising automatic two-year deletion.

## Before a separately authorized production rollout

1. Confirm the actual Pages project and D1/KV resources, existing deployments, bindings and account-wide quota use. Keep placeholder/test identifiers out of a release.
2. Back up existing D1 and relevant photo inventory/KV evidence, record applied migrations, and rehearse restore on an isolated copy. Apply only unapplied migrations in order; these scripts are not rerunnable setup scripts.
3. Review existing overlapping schedules, more than 50 active non-admin accounts, missing credentials and unverified GPS. New triggers prevent future invalid writes but do not retrospectively repair existing rows. Do not resolve conflicts by deleting production data during this audit.
4. Rehearse migrations `0001`–`0008` and operator bootstrap against an empty database and a representative existing copy. Validate current role scopes and original-evidence preservation.
5. Test actual Android/iOS camera permissions, HTTPS, GPS accuracy, Vietnamese text/logo legibility, weak networks, session revocation, duplicate submissions and recovery procedures. Measure deployed free-tier CPU, memory, D1/KV quotas and storage growth separately from local compatibility tests.
6. Review retention/eviction activation and any scheduler as explicit production changes. Deploy only after that review; the current work stops at verified source and documented blockers.

Current official limits and product exclusions are sourced in [cloudflare-runtime-audit.md](./cloudflare-runtime-audit.md). Free operation remains a target, not a verified billing or production-capacity guarantee.
