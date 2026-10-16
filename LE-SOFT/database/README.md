# LE-SOFT Multi-Database Migration Architecture & Operational Runbook

This directory and `supabase/migrations/` structure database schema migrations for the multi-tier LE-SOFT deployment across three distinct database technologies:

```
LE-SOFT/
├── supabase/
│   └── migrations/                      # Target: Supabase Cloud PostgreSQL (Managed via Supabase CLI)
│       ├── 001_initial_schema.sql
│       ├── ...
│       ├── 068_supabase_registry_security_hardening.sql
│       └── 070_supabase_buffer_quota_reservations.sql
│
└── database/
    ├── truenas/
    │   ├── migrations/                  # Target: TrueNAS Authoritative PostgreSQL (lesoft on port 5432)
    │   │   └── 069_nas_schema_synchronization_and_bills.sql
    │   └── rollback/                    # ⚠️ PROHIBITED IN PRODUCTION: Destructive Manual Rollback Scripts
    │       └── 069_nas_schema_synchronization_rollback.sql
    │
    └── mysql/
        └── migrations/                  # Target: Remote MySQL Web Store Database (e.g. le_wordpress_db)
            └── mysql_001_stock_sync_idempotency.sql
```

---

## 1. Target Database Specifications & Deployment Prerequisites

### Target 1: Supabase Cloud PostgreSQL
* **Engine**: PostgreSQL 15+ (Hosted Supabase Cloud)
* **Directory**: `supabase/migrations/`
* **CLI Tool**: `supabase db push` or Supabase Web Dashboard SQL Editor.
* **Migration 070**: `070_supabase_buffer_quota_reservations.sql`
  - **Purpose**: Server-enforced quota reservation state machine (`active`, `committed`, `released`, `pruned`, `expired`).
  - **Security**: Advisory lock serialization (`pg_advisory_xact_lock`), caller identity validation (`auth.uid()`), partition ceilings (600 MB Storage, 250 MB Database, 850 MB Max Managed Total, 150 MB Emergency Reserve up to 1 GB Hard Limit).
  - **Prerequisite**: None.
  - **Verification**: Run `npx vitest run tests/integration/supabase-quota-rpc.integration.test.ts`.

### Target 2: TrueNAS Authoritative PostgreSQL
* **Engine**: PostgreSQL 14+ on TrueNAS Core/SCALE (`100.88.85.6:5432`, database: `lesoft`).
* **Directory**: `database/truenas/migrations/`
* **Execution Method**: Direct `psql` connection by DBA / DevOps:
  ```bash
  # Step 1: Pre-migration safety backup
  pg_dump -U postgres -h 100.88.85.6 -p 5432 -d lesoft -F c -b -v -f /backups/lesoft_pre_069_$(date +%F_%H%M%S).dump

  # Step 2: Apply forward migration
  psql -U postgres -h 100.88.85.6 -p 5432 -d lesoft -f database/truenas/migrations/069_nas_schema_synchronization_and_bills.sql
  ```
* **Migration 069 Forward**: `069_nas_schema_synchronization_and_bills.sql`
  - **Properties**: **Additive, non-destructive, zero-downtime, fully idempotent** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).
  - **Reload PostgREST**: Issues `NOTIFY pgrst, 'reload schema'` to refresh PostgREST schema cache.
  - **Rollback Safety**: `database/truenas/rollback/069_nas_schema_synchronization_rollback.sql` is **PROHIBITED IN PRODUCTION**. It drops data-bearing financial tables and columns (`DROP TABLE CASCADE`, `DROP COLUMN`). If repair is needed, forward-fix idempotently or restore from the pre-migration `pg_dump` backup.

### Target 3: Remote MySQL Destination Store
* **Engine**: MySQL 8.0+ or MariaDB 10.5+ (InnoDB engine, utf8mb4 collation).
* **Directory**: `database/mysql/migrations/`
* **Execution Method**: Executed by MySQL DBA on the remote store database:
  ```bash
  mysql -u <db_user> -p -h <db_host> <db_name> < database/mysql/migrations/mysql_001_stock_sync_idempotency.sql
  ```
* **Schema**: `mysql_001_stock_sync_idempotency.sql`
  - **Purpose**: Creates `le_stock_sync_idempotency` with `dedup_key VARCHAR(191) PRIMARY KEY`.
  - **Idempotency Guarantee**: Desktop `syncStockToMySQL` executes `INSERT INTO le_stock_sync_idempotency` inside an atomic transaction. Concurrent executions catch `ER_DUP_ENTRY` (MySQL error 1062) and safely skip duplicate inventory decrements.

---

## 2. Safe Application Order

When promoting changes across environments, migrations must be executed in this strict sequence:

1. **Step 1 — TrueNAS Master Forward Migration**:
   Apply `database/truenas/migrations/069_nas_schema_synchronization_and_bills.sql` to TrueNAS PostgreSQL. PostgREST automatically reloads schema cache.
2. **Step 2 — Supabase Cloud Quota Migration**:
   Apply `supabase/migrations/070_supabase_buffer_quota_reservations.sql` to Supabase Cloud PostgreSQL.
3. **Step 3 — MySQL Idempotency DDL**:
   Apply `database/mysql/migrations/mysql_001_stock_sync_idempotency.sql` to remote MySQL destination.
