# Rounded glass and interaction update
- Shared 16px rounded-square action controls and 26px floating windows, with all four edges rounded on mobile navigation sheet. Keep 56px filters and native date/month inputs unchanged.
- Lower surface opacity using existing brand tokens, with a solid fallback, reduced-transparency and forced-colors handling. No new assets or libraries.
- Existing bounded IntersectionObserver reveals text from alternating sides (420ms), once per DOM node; no hidden content, no animated camera or controls; reduced motion disables reveal.
- Touch pull-to-refresh on mobile at the top of a signed-in workspace: drag threshold 82px, native scrolling elsewhere, single in-place read refresh via navigate, no document reload. Ignore nested scrolling, horizontal gestures, dialogs, editing, ongoing camera/capture/recovery, pending writes, and offline state. Existing logo asset assembles with the established slogan “Thấu hiểu điều mẹ muốn”; reduced motion uses static logo. Indicator is noninteractive and does not delay requests. No forced retries or writes.
- Mobile automation verifies filter geometry, dialog, short/dirty gesture cancellation, a single read and branded indicator. Synthetic touch events cannot establish physical iOS gesture behavior; operator acceptance required.

## Icon-led system refinement
- Shared compact action labels (11–12px), 23–24px action glyphs and 40–42px feature icons, larger dock tiles and glyphs, 13px table data with 11px column labels. Text remains present; inputs keep 16px, filter height 56px and native controls, and touch actions remain at least 44px. Print not changed.
- The initial PR CI identified eight browser regressions from incorrectly inserted pull-refresh initialization within session-retry's click handler. Restored the handler and initialize the gesture once at module boot, outside all action paths. Full CI must pass before deployment.
