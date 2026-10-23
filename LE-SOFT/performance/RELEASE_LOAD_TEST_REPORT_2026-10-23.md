# LE-SOFT 1.8.14 release test report

**Date:** 2026-10-23
**Load tool:** Grafana k6 2.3.0 (Windows x64, checksum verified against Grafana's published release checksums)
**Environment:** Live WordPress MAKE portal, TrueNAS over Tailscale, and Supabase Auth endpoint.

## Load run

The test used a 70-second staged profile (1, 5, then 10 virtual users) with a 0.3-second pacing delay. It made only GET requests. The checks covered the public portal, NAS storage health endpoint, authenticated read-only `make_products` query, Supabase Auth health, and rejection of anonymous access to the protected WordPress system-status endpoint. It did not create, modify, or delete data.

| Endpoint | Requests | Checks | p95 | Outcome |
| --- | ---: | ---: | ---: | --- |
| NAS storage health | 123 | 123/123 | 446 ms | Pass |
| NAS catalog database read | 123 | 123/123 | 404 ms | Pass |
| MAKE portal | 123 | 246/246 | 1.77 s | Pass |
| WordPress protected status guard | 123 | 123/123 | 1.01 s | Pass (401 required) |
| Supabase Auth health | 123 | 123/123 | 200 ms | Pass |
| **Total** | **615** | **738/738** | — | **0 failed HTTP requests** |

The test thresholds were p95 under 2 seconds for NAS health, under 3 seconds for authenticated NAS reads, Supabase Auth, and the WordPress guard, under 5 seconds for the public portal, and below 1% failed requests. All passed. The observed request p95 for the whole run was 1.36 seconds.

An earlier 10-user run had one NAS health response taking 5.87 seconds, above that run's 6-second per-request timeout. Ten subsequent sequential health requests and ten catalog reads succeeded. I raised the load-test request timeout to 10 seconds and repeated the full workload; the repeat had zero timeouts or failed checks. This is evidence of one transient network/service delay, not proof of long-term capacity.

## Functional and package verification

- Live NAS MAKE integration test: 19/19 checks passed; test rows and uploaded files were removed by the harness.
- Desktop automated checks: TypeScript/Vite production build, ESLint, license check, WordPress CAD viewer build, and Vitest passed (57 files, 969 passed, 39 skipped; 3 files skipped).
- Packaged Windows app: installed into a path with spaces, launched, initialized local storage and background services, and uninstalled cleanly. Packaged executable and installer version: 1.8.14.0. Leading Edge icon resource present.
- WordPress public portal: HTTP 200. Unauthenticated protected status endpoint: HTTP 401, expected.
- Supabase Auth health: HTTP 200. Authenticated Supabase transaction check was previously rolled back; anonymous protected-table access remains denied.
- Production dependency audit/fix: removed the critical DOMPurify finding and high Axios/Sharp/transitive advisories. `npm audit --omit=dev` now reports 0 critical, 0 high, and 4 moderate findings. Those remaining issues have only breaking major-upgrade fixes available and are documented as follow-up.
- GitHub release `v1.8.14` is published, with Windows and macOS arm64 assets and versioned updater metadata uploaded. The Windows build itself succeeded and uploaded the installer and metadata; a redundant workflow step failed on an HTTP 422 duplicate-release creation attempt. The workflow was corrected on the pushed branch for subsequent releases.

## Limits

The k6 run exercises endpoint reads and public access control. It does not model order creation, upload throughput, database writes, concurrency conflicts, prolonged operation, failover during NAS loss, or Supabase signed-in table permissions. Production WordPress role behavior also needs an authenticated staging matrix. The desktop installer is unsigned and may trigger Windows SmartScreen warnings. Do not treat 10 VUs as a maximum-capacity figure.

## Reproduction

Install Grafana k6 and run `performance/k6-readonly-smoke.js`. Set these environment variables from the ignored local Supabase configuration and `.env.local` without printing them:

- `SUPABASE_AUTH_HEALTH_URL` and `SUPABASE_ANON_KEY`
- `NAS_HEALTH_URL`, `NAS_API_KEY`, `NAS_JWT_TOKEN`, and `NAS_DB_READ_URL`
- `MAX_VUS=10`

For the database read URL, use the NAS PostgREST-compatible base URL followed by `/make_products?select=id&limit=1` (the NAS gateway uses table paths directly). The script contains no credentials and sends read-only requests only.
