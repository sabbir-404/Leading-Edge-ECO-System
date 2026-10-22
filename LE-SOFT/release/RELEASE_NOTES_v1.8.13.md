# LE-SOFT 1.8.13

## Highlights

- Stabilized NAS health detection, database failover, recovery, and Supabase-to-TrueNAS replication.
- Fixed MAKE catalog and Track Orders schema compatibility, product options, order review, payments, stage updates, and attachment persistence.
- Improved durable file uploads, quota tracking, safe reconciliation, and retry recovery.
- Enforced role-based pricing visibility and order workflow permissions.
- Hardened Supabase public access while preserving bounded anonymous diagnostic submissions.
- Updated the MAKE WordPress portal plugin API, NAS connectivity, and order workflow handling.

## Verification

- Vitest: 970 passed, 0 failed; 38 skipped, including opt-in live database tests.
- Frontend and Electron TypeScript checks, ESLint, and production Vite build passed.
- Live NAS CRUD and Supabase rollback-only lifecycle checks passed; a Supabase-to-NAS replication canary was observed and removed.
- Anonymous Supabase access is denied for operational tables; the isolated diagnostics table permits bounded inserts only.
- Public MAKE portal and protected API authentication gates respond. Authenticated WordPress screens were not exercised in this environment.

## Upgrade

Install this release over an existing LE-SOFT installation. The GitHub release provides the `latest.yml` metadata and platform installers used by the in-app updater.
