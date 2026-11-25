# Pages routing and static delivery

BABY MARK is a Pages project (build command npm run build, output dist); its root wrangler.toml has pages_build_output_dir, not a standalone Workers entry point. A separate Workers Builds service named baby-mark previously reported failures while Pages and GitHub verification succeeded. The repository alone does not establish the cause or whether that service is still needed. Inspect its build logs and dependencies in Cloudflare before disabling or changing it. Do not create a new paid service or alter bindings.

The Pages routing manifest limits Functions invocations to /api and /api/*, including authorization, photo reads and maintenance. Static HTML, scripts, CSS, brand files and service worker are served as static assets. Static security headers remain in _headers; API middleware retains private, no-store. Public scripts, CSS and brand assets can be cached but must revalidate on reuse; HTML, service worker and other assets keep no-store. This intentionally avoids long-lived caching of unversioned modules.

Builds clear only the generated dist directory before copying source assets so deleted files cannot persist across builds. No D1 migration, retention change, session change or production data mutation is included.

Acceptance: verify GitHub tests, Pages preview, static response security/cache headers and conditional ETag requests, authenticated API no-store, and production Functions invocation metrics after deployment. No measured speedup is claimed.

References: https://developers.cloudflare.com/pages/functions/routing/ and https://developers.cloudflare.com/pages/configuration/headers/.
