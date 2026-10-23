# LE-SOFT environments

LE-SOFT uses four runtime modes. Local development and automated tests must not
connect to production NAS or Supabase services.

| Environment | Purpose | Database and service boundary |
| --- | --- | --- |
| `development` | Developer desktop and Vite work | Local loopback endpoints only (`127.0.0.1`) |
| `testing` | Vitest and database integration tests | Disposable local PostgreSQL database named `lesoft_test`; no NAS or cloud credentials |
| `staging` | Pre-release checks against a separate staging deployment | Explicit non-production endpoints from `.env.staging.local`; no production endpoints |
| `production` | Installed customer software | Production configuration and credentials, isolated in the normal application profile |

## Local commands

- `npm run dev` starts the Vite renderer in isolated development mode. It defaults to a local Supabase URL and does not start Electron.
- `npm run electron:dev` starts Vite and Electron with loopback-only service defaults.
- `npm run electron:staging` starts the desktop app with values from the ignored `.env.staging.local` file. Configure this only with a separate staging Supabase project and staging NAS/storage endpoints. The launcher rejects known production endpoints.
- `npm test` launches Vitest with an isolated temporary application profile and clears inherited service credentials.
- `npm run test:pg` launches a disposable local PostgreSQL container. Docker must be running. The runner accepts only loopback PostgreSQL and the database name `lesoft_test`, and removes the test container and volume after the run.

Never put production credentials in `.env.development.local`, `.env.staging.local`, test fixtures, or CI variables. The environment files are ignored by Git. Development mode does not accept service-role keys or NAS JWTs.

## GitHub Actions

The repository has `development`, `testing`, `staging`, and `production` GitHub environments. CI runs against a fresh PostgreSQL 17 service database named `lesoft_test` for every workflow run. Its only credentials are disposable test values defined in the workflow; it does not use production or staging secrets. The `staging` GitHub environment is selected only for the `staging` branch; other CI runs use `testing`.

The production environment should hold production deployment credentials only when an explicit release/deployment workflow is added. The current CI workflow does not deploy and does not need production secrets. Keep required reviewers and branch restrictions enabled for staging/production.

## Staging database status and migration safety

Staging must use its own Supabase project and must never clone production customer data. Project creation was blocked because the connected organization has reached its free-project limit (two active projects). Do not pause or delete an existing project, or upgrade the plan, without the owner's decision. Once a slot is available, create the staging project as a separate empty database. The current repository has duplicate Supabase migration version identifiers and disables automatic migrations. Do not run `supabase db reset`, production data restore, or an unreviewed `db push` to establish staging. Reconcile migration history into a deterministic baseline first, then apply and validate that baseline against staging only.

The test PostgreSQL database is intentionally separate from Supabase. PostgreSQL integration tests currently exercise only selected migration/RPC behavior; they do not claim full Supabase API, RLS, NAS, storage, or failover coverage.

## Release path

1. Work on a `feat/*`, `fix/*`, or `codex/*` branch and let CI run.
2. Merge reviewed changes to `staging`; validate staging app/database behavior with staging-only credentials.
3. Promote the validated commit through the protected production process after approval.

Do not use CI success by itself as proof that the live database schema, NAS failover, or WordPress plugin deployment is ready.
