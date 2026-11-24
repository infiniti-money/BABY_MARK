# BABY MARK v0.4 — release gate
- [ ] Install and lock dependencies for both apps; audit dependency advisories.
- [ ] npm test and npm run build under apps/web; npm run bundle under apps/mobile.
- [ ] Apply database scripts in order to a disposable test project; run role/RLS and request concurrency tests in docs/workforce.md.
- [ ] Verify all 14 actual store coordinates and employee/manager permissions; confirm attendance radius and business time rules.
- [ ] Test on real Android and iOS, including denied camera/location, approximate location, out-of-radius, slow upload, duplicate requests, cross-midnight shift and missing checkout.
- [ ] Configure minute cron, Expo credentials and verify push receipt delivery. Review failed or uncertain deliveries.
- [ ] Approve employee privacy notice, image/location retention, secure access and manual appeal process. Confirm overtime, breaks and paid leave before payroll.
- [ ] Deploy HTTPS web and EAS preview build; use pilot group before production.
No credentials or real employee data belong in GitHub. No test or deployment is implied by source commits.
