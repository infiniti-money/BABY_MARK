# D1 + Workers KV storage
Active target: 14 stores / 50 active employees. Private JPEG cap is exactly **200,000 bytes**; inventory payload budget is exactly **900,000,000 bytes**. New photos have a maximum TTL of ninety days. At fifty employees, two photos daily and maximum size, ninety days would use 1.8 GB; rolling capacity remains approximately forty-five days. A 100 KB average would fit ninety days in the nominal payload budget, without extra shifts. Existing photos retain their original expiration; no backfill or KV rewrites. Other account storage and request quotas still matter; zero operating cost is a target, not a guarantee.

The browser composes Timemark from server-issued data; Functions structurally validates the JPEG envelope/dimensions and records byte hash/source. It does not decode/verify pixels, render a server JPEG, prove liveness or validate real GPS. See [runtime evidence](cloudflare-runtime-audit.md) and [Timemark](timemark.md).

## Write and failure model
D1 is authoritative for scope, uniqueness, challenges and capacity. A non-stealable D1 lock serializes photo writers. Count `pending`, `stored`, and `evicting` entries. Reserve inventory before KV put. KV keys are immutable random attendance IDs. Expiration uses server challenge issuance plus ninety days (up to ninety seconds earlier than accepted-upload time); private reads also deny after inventory expiration, regardless of eventual KV caches.

When capacity is enabled, hide the oldest stored photo in D1 before KV delete; release bytes only after successful delete acknowledgement. At most ten evictions occur in one request. TTL reconciliation retains a two-minute cache grace for accounting. KV's eventual consistency means physical provider usage/deletion is not an instantaneous byte-perfect guarantee. The 900 MB application cap leaves nominal headroom within the account allowance, not an account-wide guarantee.

KV and D1 do not share a transaction. Failed/uncertain puts stay counted as pending, failed deletes remain counted/hidden as evicting, and orphan stored photos remain inaccessible but counted until TTL/reconciliation. Never report attendance success unless the D1 record exists. A completed request replays only for the same hash; another body is rejected. A newly written photo may temporarily return 404 across edges; retry photo reading without repunching an already recorded attendance.

## Disabled policy defaults
`PHOTO_EVICTION_ENABLED=false`: capacity overflow fails closed with 503, without deleting old photos. Set true only after inventory reconciliation and policy review. TTL expiration is intrinsic to accepted photos. `ATTENDANCE_RETENTION_ENABLED=false`: no history cleanup runs. Two-calendar-year D1 cleanup requires the enabled flag and separate maintenance secret; preserves pending/recent disputes and recent evidence. No GET deletes data.

D1 migrations 0001–0008 and KV bindings must be configured separately. Existing untracked KV objects must be reconciled before enabling this inventory. Interrupted storage locks and PROCESSING challenges require manual recovery after confirming no writer remains active. [Recovery procedure](cloudflare-operations.md). No production resources or real data were mutated by this audit.

Current official constraints: [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/), [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).
