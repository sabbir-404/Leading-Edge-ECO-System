# LE-SOFT 1.8.14 release readiness

**Review date:** 2026-10-23  
**Scope:** Windows desktop release and live MAKE database paths.
**Result:** Release candidate verified on this Windows host. The current Windows installer is unsigned. WordPress authenticated role workflows and deployment configuration still require staging verification.

## Verified

- `npm run build:check`, `npm run lint`, `npm run license:check`, `npm run build:wp-cad-viewer`, and the full Vitest suite pass. The full suite reported 57 files passed, 3 skipped, 969 tests passed, and 39 skipped.
- Live TrueNAS MAKE integration E2E passed 19 checks. It created and then cleaned up its synthetic request, product, order, payment, stage update, alteration, and uploaded files.
- Supabase Auth health returned HTTP 200 with the configured public key. The Supabase order/requestion database transaction check from the earlier review rolled back cleanly. Anonymous access to protected tables is denied as intended; this check does not establish cloud failover authorization for a signed-in user.
- A read-only Grafana k6 run at up to 10 VUs ran for 70 seconds: 123 iterations, 615 HTTP requests, 738/738 checks passed, and no failed HTTP requests. p95 latency: NAS health 446 ms; authenticated NAS catalog read 404 ms; MAKE portal 1.77 s; WordPress auth guard 1.01 s; Supabase Auth health 200 ms. A preceding run had one 5.9-second NAS health response above its 6-second test timeout; the 10-second repeat completed without failures.
- Additional sequential checks: 10/10 NAS health responses and 10/10 authenticated catalog reads succeeded.
- Public WordPress MAKE portal returned HTTP 200. Anonymous access to its protected status endpoint returned HTTP 401 as expected.
- The 1.8.14 installer was installed into a path containing spaces, launched successfully, initialized its offline database and background services, and uninstalled cleanly. `resources/icon.ico` is packaged and is the Leading Edge icon. The installer reports ProductVersion 1.8.14.0.
- Supabase MAKE file buckets remain private. WordPress package `release/le-make-sales-portal-1.8.15.zip` includes the portal plugin and generated CAD viewer assets.
- Updated production dependency locks to remove the critical DOMPurify advisory and high-severity Axios, Sharp, and transitive advisories. `npm audit --omit=dev` now reports 0 critical, 0 high, and 4 moderate advisories; clearing the remaining findings requires major-version dependency changes.
- Rebuilt the Windows installer with the updated dependencies. All four bounded installer cases passed (no-space path, path with spaces, fresh install, uninstall/reinstall). A packaged app process remained running after startup for 12 seconds in an isolated test profile.

## Release limitations

- Installer and app executable are unsigned because no valid code-signing certificate with a private key is installed. Windows may show an unknown-publisher/SmartScreen warning. Users should obtain the installer from the official GitHub release and verify its published checksum.
- The app was launched and install/uninstall checked on this Windows host. This does not prove compatibility on every Windows machine, Windows edition, or hardware configuration; macOS has not been runtime-tested here.
- Production WordPress PHP runtime and authenticated designer/salesperson/factory-manager workflows were not exercised. The protected API authorization guard and public portal were checked, but full website deployment should follow the staging role matrix in the release report.
- Supabase signed-in cloud table reads/writes and automatic failover under NAS outage were not stress-tested in this run. The Supabase Auth health endpoint and previously recorded rollback transaction passed. No anonymous RLS access was introduced.
- Stress testing was read-only and modest (10 VUs for 70 seconds); it is a smoke/load check, not a capacity limit certification.
- The complete dependency tree still reports development dependency advisories. Production-only audit findings are limited to four moderate issues in React Router and the ExcelJS dependency tree; forcing the available major upgrades requires a separate compatibility pass.

## Operator follow-up

1. Publish signed binaries when the organization has a code-signing certificate; until then distribute with the unsigned status stated above.
2. Validate the WordPress plugin on staging with separate designer, salesperson, and factory-manager accounts, including requestion attachments, private media proxy, pricing visibility, and order-from-request.
3. After deploying the app, run a signed-in Supabase failover test with a disposable test account and database records, then verify NAS recovery and de-duplication.
4. Monitor NAS database and storage health during real use. The completed k6 run validates current read latency, not long-term capacity or failover behavior under sustained writes.
