# Hosting BABY MARK
The active application is Cloudflare Pages static assets plus root Pages Functions, D1 and Workers KV. Repository root is the project root; build command `npm ci && npm run build`; output directory `dist`. Do not publish `docs` or set the project root to `apps/web`. Root `functions/` is compiled by Pages. No R2, Supabase, Images, external Node service or native addon is required.

`wrangler.toml` contains deliberately unusable all-zero production IDs and destructive-policy flags set to false. They are placeholders for reviewed configuration, not resources to create automatically. D1 binding is `DB`; KV binding is `TIMEMARKS`. Apply only unapplied `cloudflare/d1/0001` through `0008` migrations after backup/preflight. Do not run remote migration, deployment, provisioning or retention merely to verify source. See [operations](cloudflare-operations.md).

The requested hostname is `babymark.pages.dev`; availability, ownership, bindings and a live deployment were not verified in this audit. A GitHub-connected Pages project may automatically deploy main or preview branches. Review its deployment controls before publishing refs; source verification itself does not require a deployment.

Legacy `apps/web`, `apps/mobile`, and `supabase` are historical references, not supported deployment paths for this target. `docs/index.html` is documentation only. Earlier Next.js/Render/GitHub Pages instructions do not operate the new attendance application.

The verification workflow runs local tests, static build, Functions compilation and browser acceptance; it contains no Cloudflare authentication, deployment or remote-data steps.
