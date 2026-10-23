const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const composeFile = path.join(root, 'docker-compose.test.yml');
const external = process.env.LE_SOFT_TEST_PG_EXTERNAL === 'true';
const projectName = `lesoft-test-${process.pid}`;
const connectionString = external
    ? (process.env.TEST_POSTGRES_URL || 'postgresql://lesoft_test:test-only-password@127.0.0.1:5432/lesoft_test')
    : 'postgresql://lesoft_test:test-only-password@127.0.0.1:55432/lesoft_test';

function validateLocalTestDatabase(value) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('Test database URL is invalid.'); }
    const host = parsed.hostname.toLowerCase();
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
        || !['localhost', '127.0.0.1', '::1'].includes(host)
        || database !== 'lesoft_test') {
        throw new Error('Database integration tests only accept a local PostgreSQL database named lesoft_test.');
    }
}

function compose(args) {
    return spawnSync('docker', ['compose', '--project-name', projectName, '-f', composeFile, ...args], {
        cwd: root,
        stdio: 'inherit',
        windowsHide: true,
    });
}

async function main() {
    validateLocalTestDatabase(connectionString);
    let started = false;
    if (!external) {
        const start = compose(['up', '-d', '--wait']);
        if (start.error) throw start.error;
        if (start.status !== 0) throw new Error('Could not start the isolated test PostgreSQL container.');
        started = true;
    }

    const env = { ...process.env };
    for (const key of [
        'SUPABASE_STAGING_DB_URL', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY', 'NAS_URL', 'NAS_JWT_TOKEN', 'NAS_STORAGE_URL',
        'LOCAL_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_LOCAL_API_URL', 'LE_RUN_LOCAL_SUPABASE_E2E',
        'RUN_LOCAL_DB_RECONCILIATION',
        'ALLOW_DISPOSABLE_STAGING_TESTS', 'RUN_LIVE_TELEMETRY_TESTS',
        'RUN_LIVE_DB_RECONCILIATION', 'LE_RUN_LIVE_NAS_E2E',
    ]) delete env[key];
    env.LE_SOFT_ENVIRONMENT = 'testing';
    env.NODE_ENV = 'test';
    env.TEST_POSTGRES_URL = connectionString;
    env.ALLOW_DISPOSABLE_STAGING_TESTS = 'true';

const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
    const child = spawn(process.execPath, [
        vitest,
        'run',
        'tests/integration/tombstone-authorization.pg-integration.test.ts',
        'tests/integration/supabase-quota-rpc.pg-integration.test.ts',
        ...process.argv.slice(2),
    ], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    const code = await new Promise((resolve) => {
        child.on('error', (error) => { console.error('Could not start PostgreSQL tests:', error.message); resolve(1); });
        child.on('close', (exitCode) => resolve(exitCode ?? 1));
    });

    if (started) {
        const stop = compose(['down', '--volumes', '--remove-orphans']);
        if (stop.error || stop.status !== 0) console.error('Warning: the isolated PostgreSQL test container did not shut down cleanly.');
    }
    return code;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
