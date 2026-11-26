# P2 — Mobile UX and accessibility
Baseline fd9b643, P0 deployed; P1 #17 is independent. Changes retain the accepted rounded/glass brand, icon sizes, 850ms reveal and centered refresh, existing 44px actions/56px filters, native input behavior and reduced-motion settings.
- Skip link moves focus to main on all screens, including login/boot/recovery. Changed navigation focuses the page heading without forcing focus on polling or same-view refresh. Page title follows view.
- Replace broad live region around the entire content with a short dedicated status and aria-busy during navigation; existing camera, error and request status messages retained.
- Mobile dialog title focus on open, trigger focus on close. Native dialog still traps focus; no new gesture or data changes.
- Admin grouped tabs now have one tablist, roving tabindex, manual activation (arrows/Home/End then Enter/Space), linked tabpanel and focus restoration. Existing tab labels stay unchanged.
- Higher-contrast preference reduces transparency and darkens muted text; maintain forced-color and visible focus styles, wrap long titles and labels. No claim of full WCAG compliance or 200% text-size acceptance.
- Added mobile Playwright regression tests for focus, skip link, menu keyboard return, navigation status and admin tab semantics. Both WebKit and Chromium use existing fixtures. CI and Preview required before merge; real iPhone/Android, VoiceOver/TalkBack, enlarged system text and contrast measurements remain operator acceptance items.
