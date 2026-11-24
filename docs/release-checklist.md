# Cloudflare release gate — 24 November 2026
Local source verification:
- [x] Inspect main baseline, full tracked source and latest commits.
- [x] Lock the active Cloudflare toolchain; static build and Functions compilation.
- [x] Real SQLite migration/constraints, authorization, concurrent/replay/expiry and failure-state tests.
- [x] Browser acceptance against ephemeral workerd/D1/KV: admin management, IN/OUT camera capture, protected JPEG, scoped reports/CSV, mobile layout and transparency/size.

Not authorized or not completed:
- [ ] Confirm deployment/preview controls and real Pages project/binding IDs; no automatic production deploy.
- [ ] Back up and preflight existing schema, overlaps, active-account count and photo inventory; apply only unapplied migrations under separate production authorization.
- [ ] Securely bootstrap administrator and deliver individual issued secrets; verify all fourteen real store GPS points and manager scopes.
- [ ] Approve photo/attendance retention and employee notice. Capacity eviction and history cleanup are disabled by default.
- [ ] Confirm stuck-lock/PROCESSING recovery and uncertain KV reconciliation; test operator recovery on staging fixtures.
- [ ] Choose a scheduler if exact unattended/no-traffic two-year D1 cleanup is required.
- [ ] Test physical Android/iOS camera and GPS denial/accuracy, slow network, overnight shifts, stamp readability and accessibility.
- [ ] Measure deployed free-plan CPU and account-wide D1/KV quotas. Local workerd success does not prove the 10 ms CPU limit or zero cost.
- [ ] Port native Expo client, push/realtime, shift swaps and XLSX/payroll only if required. These legacy features are not part of the active target.
- [ ] Review and approve production rollout separately.

No real employee data or credentials were used in acceptance fixtures. Tests delete only ephemeral local data. Source commits do not establish a live production deployment.
