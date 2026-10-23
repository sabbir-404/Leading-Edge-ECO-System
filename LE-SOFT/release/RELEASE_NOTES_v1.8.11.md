## Highlights

* Improved NAS connection monitoring, offline-state handling, and automatic reconnection.
* Added durable retry and safer reconciliation for database failover and cloud mirroring.
* Improved order-item specification, custom-size, and dimension preservation across supported database schemas.
* Improved invoice attachment handling and order duplication.
* Strengthened role-based pricing restrictions, including Factory Manager sale-price redaction.
* Improved Windows notification behavior and associated regression coverage.

## Verification

* 535 automated tests passed in the latest recorded full suite.
* TypeScript check passed with zero reported errors.
* Backup restoration was verified in an isolated PostgreSQL 16.14 environment.
* Packaged installer installation and isolated connection outage/recovery testing passed.

## Artifacts & Integrity

* **Installer**: `LESOFT-Setup-1.8.11.exe`
* **File Size**: 174,283,081 bytes
* **SHA-256 Checksum**: `B5C302DF18B0A1736BB0235C5DD8322E5228FBB97C984B66D6E70AEB6A21421C`

## Operational note

* The recovery drill used an isolated test server. No deliberate outage was performed against the production NAS. If a real NAS outage occurs, review the system diagnostics log, LE-SOFT application log, and connection-manager diagnostics to establish the root cause.
