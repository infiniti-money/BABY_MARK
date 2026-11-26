# Comprehensive review — 2026-11-26
Baseline main 717e669336e98d4625d24ce53532fc24064021f4; stable v1.2.3 tag targets 9eb9b5c. Latest Verify and Pages checks on baseline pass. Scope: active Pages app, D1/KV, workflows; not a pentest or production data audit.

## P0 — correctness and operations
- Baseline introduced migration 0023 for attendance ownership and append-only audit guards, but readiness still targets 0021. This PR checks 0023; 0022 report indexes remain optional and are reported separately, not a blocking migration. Diagnostics shows the package version instead of the stale RC label.
- Retention candidate selection protects pending workforce requests but did not protect supplemental shifts with pending/recent decisions, recent handovers and recent work-unit reviews. This PR adds bounded SQL predicates in the existing transaction, with compatibility for older schemas. Does not enable retention, change cutoff, or alter existing audit/payroll snapshots.
- Before remote migration: verify exact migration ledger and objects; check attendance ownership discrepancies and backups in authorized Cloudflare UI. Restore rehearsal in isolation; D1 backup excludes KV images. No remote migration/cleanup performed.
- Verify roster, push scheduler and recovery state in admin diagnostics; a green cron workflow may have skipped disabled retention. Check actual device deliveries and run counts.

## P1 — HR, access and mobile
- Keep payroll epoch/version, immutable closings, approved overtime and overlap guards. Next: review leave types/balances and paid leave, future shift swaps, explicit policy and approval; do not assume statutory payroll rules.
- Expand mutation-boundary session/branch revalidation, especially payroll and remaining write endpoints. Review same-origin bearer storage and plan cookie transition separately; avoid logging private data.
- Actual iPhone acceptance recorded by operator; Android Chromium/iPhone WebKit are emulation. Verify real Android/iPhone camera, GPS, offline/recovery, screen reader, 200% text and contrast of glass/compact 10–13px labels; do not claim WCAG compliance from layout tests.
- Add keyboard/screen-reader checks, visible focus and robust reduced-motion/transparency; preserve 16px native inputs, 44px touch targets, 56px filters.

## P2 — speed, dependency and release
- Current reports use keyset pagination, but summary still reads up to 5000 full records and joins evidence. Benchmark a parity-checked narrower summary path before replacing calculations. Verify 0022 on production; local fixture measurements are not production latency.
- Main app is about 230 KB raw JS and styles.css about 100 KB raw CSS, plus six CSS files. Measure transfer size, navigation and LCP/INP on slow devices; split by route without affecting camera, reports and initial authentication. Keep private API no-store; public assets revalidate; fingerprint static assets before long cache TTL.
- Wrangler 4.168.0, Playwright 1.65.1, esbuild 0.28.2, miniflare 5.20261123.0-beta on baseline. npm audit --omit=dev is not coverage of dev tools. Review full lockfile advisories and upstream compatibility; do not blindly upgrade or claim latest.
- Release workflow checks exact commit and Pages. Add full dependency audit/report, CI cancellation for superseded PRs, accessibility and performance regression tests, repeatable version/release checklist. Never overwrite existing stable tags.

Evidence: code and tests on pinned baseline, GitHub Actions checks. Production health endpoint unavailable to review tool; no private D1/KV access, real-device Android, backup verification, production p95 or full dependency advisory scan. This PR only implements the first safety/readiness changes with regression tests. CI must pass before merge.
