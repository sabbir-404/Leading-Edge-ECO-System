# LE-SOFT 1.8.14 production readiness review

**Review date:** 2026-10-23  
**Status (follow-up 2026-10-23):** Desktop source checks and the live NAS MAKE workflow pass. A fresh Windows 1.8.14 installer candidate and a WordPress 1.8.15 upload package are prepared. One install/uninstall smoke run of the fresh candidate passed in a path with spaces. The installer and app executable are unsigned because no valid code-signing certificate is installed. WordPress deployment still needs an authenticated site test; this workspace cannot verify the production site's PHP runtime or its private Supabase service credential.

**Final packaging follow-up:** The final-r3 1.8.14 installer build completed and includes `resources/icon.ico` for the Leading Edge window icon. In this Windows session, attempting to run the installer failed with an `Illegal System DLL Relocation` error, while launching the unpacked executable exited immediately with `0x80000003`. The same executable launch result occurred with the earlier candidate, so this session could not confirm a successful runtime launch. Treat Windows runtime startup as unverified pending a clean Windows host/CI smoke test.

## Verified

- `npm run build:check` passes (TypeScript and Vite production build).
- `npm run lint` passes.
- `npm run build:wp-cad-viewer` passes and creates the portal CAD viewer assets.
- `npm run license:check` passes.
- `node scripts/verify-make-live-e2e.cjs` passes 19 live NAS checks and cleans up its test request, product, order, attachments, payment, stage update, and alteration.
- Supabase Auth health returns HTTP 200. Anonymous REST reads of `companies`, `device_sessions`, and `make_products` return HTTP 401 with only the public anon key; anonymous table access is intentionally denied. No RLS policy was loosened. The authenticated cloud order/requestion transaction check from the previous review remains recorded above; this follow-up did not have an authenticated app session or admin SQL channel available.
- WordPress portal JavaScript syntax checks pass for `portal.js` and `pdf-watermark.js`. The CAD viewer asset build passes. PHP CLI is not installed here, so PHP lint and authenticated WordPress runtime checks remain unverified.
- `release/le-make-sales-portal-1.8.15.zip` contains the plugin entry point and generated CAD viewer assets (313 entries; SHA-256 `50D322C0AE5043B6914185AD36C5A1EE0E1328EEF694138337B326EB5A57F4FB`).
- Fresh Windows candidate `release/candidate-1.8.14/LESOFT-Setup-1.8.14.exe` built successfully from current source after `better-sqlite3` rebuild; installer ProductVersion is 1.8.14.0. The current candidate installed into a path with spaces, included `app.asar`, and uninstalled successfully. The earlier four-case installer smoke result applies to the previously built artifact; this follow-up added one install/uninstall path-with-spaces run.
- Authenticode verification reports `NotSigned` for both the fresh installer and `LESOFT.exe`; no currently valid code-signing certificate with a private key is installed in the Windows user or machine certificate store. The candidate is not a signed public release artifact.
- Final-r3 installer metadata reports ProductVersion `1.8.14.0`; packaged `resources/icon.ico` is present. Local runtime launch was inconclusive as described above, and the installer could not be launched in this session.
- Supabase authenticated order/requestion DML was exercised in a transaction and rolled back; no test rows remain.
- Windows installer `release/LESOFT-Setup-1.8.14.exe` was created. All four bounded installer smoke cases passed: install to a path without spaces, install to a path with spaces, fresh install, and uninstall/reinstall. Installed binaries reported 1.8.14.
- The public WordPress MAKE page returned HTTP 200. Anonymous access to the protected system-status route returned HTTP 401, as expected.
- Supabase bucket `make-order-files` remains private. `make-portal-files` is now private with a 50 MiB object limit. An anonymous GET to an existing object through the public-object URL returned HTTP 400 after privatization.
- Supabase migration `20261023112746 make_portal_storage_private` is applied and recorded.
- The current Supabase PostgreSQL log window showed no errors from 2026-10-23 11:27:00 through 11:35:51 UTC. Three errors at 11:17:46 UTC were anonymous PostgREST probes; the downloaded CSV contains older entries.

## Changes made

- Desktop pre-auth health/device checks skip authenticated-table access until a Supabase user session exists, avoiding the `companies` and `device_sessions` permission-denial loop without weakening RLS.
- Fixed a duplicate `role` declaration in the costing-request handler that broke Electron main-process bundling.
- WordPress now signs media-proxy URLs with a one-hour expiry, routes legacy Supabase public-object URLs through the authenticated proxy, validates the signed reference, and refuses to substitute an anon key for the service credential.
- WordPress now buffers NAS-offline media outside the public web root, authenticates downloads from private Supabase Storage during NAS recovery, and verifies TLS for cloud storage transfer and maintenance requests. Portal JavaScript syntax check passes; PHP lint remains unavailable.
- Supabase `make-portal-files` bucket was made private; equivalent migration is checked in.
- User-group settings in LE-SOFT include explicit permissions for MAKE order operations, pricing, production, requestion visibility/creation/pricing/deletion, and placing orders from requests.

## Remaining checks before declaring the combined release production-ready

1. Deploy the prepared WordPress ZIP to staging, then test request creation with multiple items/files, designer pricing and linked product creation, salesperson visibility/order-from-request, and factory-manager restrictions using separate authenticated roles.
2. Confirm `LE_MAKE_SUPABASE_SERVICE_KEY` is configured on the WordPress server (environment or `wp-config.php`) before exercising private Supabase media fallback. Keep it server-side; never place it in browser code.
3. Run PHP lint against the plugin files and confirm the production site PHP version meets the plugin's requirements. PHP CLI is unavailable in this workspace.
4. The full `npm run dist` pipeline previously could not rebuild `better-sqlite3` because the running LE-SOFT process held its binary open. The installer was packaged with dependency rebuild disabled and smoke-tested with the existing native module; a clean native rebuild still needs to be verified after closing the app.
5. Version alignment remains unresolved: desktop package/installer is 1.8.14, while the WordPress plugin package is 1.8.15. The earlier requested desktop release number 1.8.13 must not be achieved by downgrading over the existing 1.8.14 artifact; choose and align the release versions before publishing.

## Advisory findings

- Supabase advisor still reports three authenticated-executable `SECURITY DEFINER` quota RPCs. Their current implementation is intended to validate authenticated client identity, but they remain security-review items.
- Supabase advisor reports leaked-password protection disabled, 41 RLS init-plan performance findings, and multiple permissive policies on legacy tables. These were not broadly rewritten as part of this MAKE-specific repair.
- Vite warns that ExcelJS uses `eval` and that the main renderer and CAD worker chunks exceed 500 kB. Builds pass; these remain dependency/bundle-hardening items.
