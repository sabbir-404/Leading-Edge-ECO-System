const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isolatedAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'lesoft-test-profile-'));
const env = { ...process.env };

for (const key of [
    'SUPABASE_STAGING_DB_URL', 'TEST_POSTGRES_URL', 'DATABASE_URL', 'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NAS_URL', 'NAS_ANON_KEY',
    'NAS_JWT_TOKEN', 'NAS_STORAGE_URL', 'NAS_LOCAL_URL', 'NAS_LOCAL_STORAGE_URL',
    'NAS_TUNNEL_URL', 'NAS_TUNNEL_STORAGE_URL', 'CF_ACCESS_CLIENT_ID',
    'CF_ACCESS_CLIENT_SECRET', 'HOSTINGER_UPLOAD_SECRET', 'LE_TEST_HEARTBEAT_URL',
    'LOCAL_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_LOCAL_API_URL', 'LE_RUN_LOCAL_SUPABASE_E2E',
    'RUN_LOCAL_DB_RECONCILIATION', 'LE_RUN_INSTALLED_PRODUCTION_TESTS', 'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'NATS_URL', 'LE_SOFT_USER_DATA_DIR',
    'ALLOW_DISPOSABLE_STAGING_TESTS', 'RUN_LIVE_TELEMETRY_TESTS',
    'RUN_LIVE_DB_RECONCILIATION', 'LE_RUN_LIVE_NAS_E2E',
]) delete env[key];

env.LE_SOFT_ENVIRONMENT = 'testing';
env.NODE_ENV = 'test';
env.APPDATA = isolatedAppData;
env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
env.VITE_SUPABASE_ANON_KEY = '';

const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
});

child.on('error', (error) => {
    console.error('Could not start isolated Vitest run:', error.message);
    process.exitCode = 1;
});
child.on('close', (code) => {
    try { fs.rmSync(isolatedAppData, { recursive: true, force: true }); } catch {}
    process.exitCode = code ?? 1;
});
