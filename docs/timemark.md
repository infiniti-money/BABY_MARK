# Timemark transparent overlay
Canonical layout: `docs/assets/timemark-layout.mjs`, re-exported by `cloudflare/lib/timemark-layout.mjs` and copied into the active static bundle by the build. `public/capture.mjs` captures the live camera and composes this SVG on browser Canvas. Original logo, 800 × 1200 portrait layout, black floating cards at 40% opacity, pale logo card at 70%, white outlined text, clear center, separate time/GPS status and bounded Vietnamese text. JPEG contains the blended overlay; it has no alpha channel.

The browser reduces quality and then resolution until the JPEG is at most **200,000 bytes**, otherwise it refuses submission. Functions independently enforce the exact cap, supported structural JPEG dimensions, owned unexpired one-use challenge, SHA-256, assignment/sequence and active session. It uses no Sharp, server Canvas, Images binding or Node runtime.

Clock on the image is the server challenge issue time. D1 `stamp_issued_at` preserves it; authoritative `server_timestamp`/`received_at` are when the full upload is accepted and drive late/early reporting. Upload must complete challenge validation within ninety seconds. These times do not certify the shutter instant. Address is administrator-provided store address, not reverse-geocoded device address.

`photo_source=CLIENT_RENDERED` is stored and exposed in reports. The server has not independently composed or inspected the visible image. A user can replace browser code, spoof GPS, or upload altered pixels. Hashes and challenges bind accepted bytes to the record; they do not prove image truth or physical presence.

Browser acceptance tests exercise real workerd/D1/KV, camera/GPS fixtures, JPEG decode, protected retrieval, transparent center alpha, 40% card alpha, and high-entropy compression below the cap. Test camera media and coordinates are synthetic. Physical Android/iOS devices, actual store lighting, readable text at reduced resolution and deployed free-tier CPU still need acceptance.

The legacy Node Sharp renderer is retained only as historical source and is not shipped. The preview API/demo is explicitly a preview and cannot record attendance. [Official runtime constraints and sources](cloudflare-runtime-audit.md).
