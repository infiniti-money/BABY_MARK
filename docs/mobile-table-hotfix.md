# Mobile Web App table overlap hotfix

The phone layout used absolute pseudo-element column labels and fixed left padding. Long labels could extend beyond their cell height; no per-device reproduction was supplied. At phone widths the hotfix uses stacked in-flow labels with wrapping values, full-width wrapping actions and 44px minimum touch targets. At landscape/tablet widths tables remain horizontally scrollable within their wrapper. Desktop/print layouts, exports, database and permissions are unchanged. This is standards-based responsive CSS, not an assertion of verification on a particular iOS release.

The existing Playwright mobile suite now exercises the real report UI using synthetic long labels, employee codes and names at 320/375/390/430px, checks cell/content geometry and touch targets, and verifies landscape and desktop retain table display. The test is intended for WebKit and Chromium; CI and physical Safari/PWA acceptance are required before describing it as verified.

Operator check: on iPhone open the installed web app, navigate to attendance/report/payroll/admin lists, scroll through long records, rotate device, verify no overlapping labels or buttons. If the old UI remains after deployment, close/reopen the Web App and reload; avoid clearing storage unless the operator accepts re-login.

## Floating navigation dock

The mobile navigation uses an inset rounded glass container inspired by the supplied iPhone home-screen dock, with four role-scoped actions, distinct rounded icon tiles, active red brand tile and visible labels. It reserves vertical space including the safe area; compact landscape keeps 44px touch targets. Solid fallback, reduced transparency and forced-colors styles are provided. Desktop sidebar, role permissions and data are unchanged. Added WebKit/Chromium geometry and interaction regression tests; physical device acceptance still required.

## Prototype refinement
Applied the supplied design direction to actual UI: larger glass icon tiles (54px, 48px on narrow phones), compact bold labels, active red shine and underline, more translucent dock (46% base opacity with backdrop support), safe-area reservation and accessibility fallbacks. Phone employee dashboard uses real authenticated name and role, actual server attendance timestamps only for a single displayed shift, and a visible "Nhiều ca" indicator otherwise; no fake sample names, avatars, notifications, break times, or fingerprint authentication. Existing camera, shift selection, IN/OUT controls, permissions, and quick actions remain. Added browser checks; verify physical devices after CI.
