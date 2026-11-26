# P1 — HR write-boundary hardening
Baseline fd9b643; PR #16 already merged and Pages production successful. This phase extends the existing payroll and approval safeguards without new migrations or changing payroll formulas.
- Same authenticated session, active profile, credential version and unchanged role must be valid inside SQL writes for single leave/correction, range leave, extra/cover creation, employment start/end and shift handover.
- Revalidate own assignment, date window and eligibility, schedule evidence for corrections, current branch/shift configuration and manager scope. Supplemental creation rate limit is also checked at write time. Existing atomic batch, overlap guards and approval semantics stay intact.
- A range leave request reports actual rows created and writes an audit with requested and created counts; no false success or audit on zero rows. Existing partial-range behavior remains.
- Add deterministic races for revoked sessions, lost branch scope, changed schedules and audit consistency. Existing real D1 contract tests remain mandatory.
- No new leave entitlement, paid-leave formula, future shift-swap workflow or OT rate policy invented. Next phase requires explicit company policy for balances and paid leave, and a separately designed consent/approval workflow for future shift swaps.
- No direct production access, migration, deletion or data export. CI and Pages preview required before merge. Existing production CI may still be running when this branch is opened.
