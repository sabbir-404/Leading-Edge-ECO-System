const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'development';
if (!['development', 'staging'].includes(mode)) throw new Error('Use development or staging for this local launcher.');

function parseEnvFile(file) {
    if (!fs.existsSync(file)) return {};
    const parsed = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || match[1].startsWith('#')) continue;
        parsed[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, d, s) => d ?? s);
    }
    return parsed;
}

function assertSafeEndpoint(key, value) {
    if (!value) return;
    let url;
    try { url = new URL(value); } catch { throw new Error(`${key} must be a valid URL.`); }
    const host = url.hostname.toLowerCase();
    const productionHosts = new Set([
        'ildkkgjrolcjijwfokek.supabase.co', '100.88.85.6', '192.168.1.14',
        'db.lenas.me', 'storage.lenas.me',
    ]);
    if (productionHosts.has(host)) throw new Error(`${key} points to the production service; the development launcher refuses it.`);
    if (mode === 'development' && !['localhost', '127.0.0.1', '::1'].includes(host)) {
        throw new Error(`${key} must use a loopback endpoint in development.`);
    }
}

const env = { ...process.env };
for (const key of [
    'SUPABASE_STAGING_DB_URL', 'TEST_POSTGRES_URL', 'DATABASE_URL', 'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NAS_URL', 'NAS_ANON_KEY',
    'NAS_JWT_TOKEN', 'NAS_STORAGE_URL', 'NAS_LOCAL_URL', 'NAS_LOCAL_STORAGE_URL',
    'NAS_TUNNEL_URL', 'NAS_TUNNEL_STORAGE_URL', 'CF_ACCESS_CLIENT_ID',
    'CF_ACCESS_CLIENT_SECRET', 'HOSTINGER_UPLOAD_SECRET', 'LE_TEST_HEARTBEAT_URL',
    'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
    'MINIO_ENDPOINT', 'MINIO_PORT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY',
    'NATS_URL', 'SUPABASE_LOCAL_API_URL', 'LOCAL_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_STAGING_DB_URL', 'TEST_POSTGRES_URL', 'DATABASE_URL', 'LE_SOFT_USER_DATA_DIR',
]) delete env[key];

const localConfig = parseEnvFile(path.join(root, `.env.${mode}.local`));
const allowedKeys = new Set([
    'SUPABASE_URL', 'NAS_URL', 'NAS_STORAGE_URL', 'NAS_LOCAL_URL',
    'NAS_LOCAL_STORAGE_URL', 'NAS_TUNNEL_URL', 'NAS_TUNNEL_STORAGE_URL',
    'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NAS_ANON_KEY',
    'NAS_JWT_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET',
]);
for (const [key, value] of Object.entries(localConfig)) {
    if (!allowedKeys.has(key)) continue;
    if (['SUPABASE_URL', 'NAS_URL', 'NAS_STORAGE_URL', 'NAS_LOCAL_URL', 'NAS_LOCAL_STORAGE_URL', 'NAS_TUNNEL_URL', 'NAS_TUNNEL_STORAGE_URL'].includes(key)) {
        assertSafeEndpoint(key, value);
    }
    if (mode === 'development' && ['SUPABASE_SERVICE_ROLE_KEY', 'NAS_JWT_TOKEN', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET'].includes(key)) continue;
    env[key] = value;
}

env.LE_SOFT_ENVIRONMENT = mode;
env.NODE_ENV = 'development';
env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
env.SUPABASE_ANON_KEY ||= '';
env.NAS_URL ||= 'http://127.0.0.1:3001';
env.NAS_LOCAL_URL ||= 'http://127.0.0.1:3001';
env.NAS_STORAGE_URL ||= 'http://127.0.0.1:8081';
env.NAS_LOCAL_STORAGE_URL ||= 'http://127.0.0.1:8081';
env.VITE_SUPABASE_URL = env.SUPABASE_URL;
env.VITE_SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

const concurrently = require.resolve('concurrently/dist/bin/concurrently.js');
const viteOnly = process.argv[3] === '--vite-only';
const command = viteOnly
    ? [require.resolve('vite/bin/vite.js')]
    : [concurrently, '-k', 'vite', 'npm run electron:build'];
const child = spawn(process.execPath, command, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
});
child.on('error', (error) => { console.error('Could not start local Electron environment:', error.message); process.exitCode = 1; });
child.on('close', (code) => { process.exitCode = code ?? 1; });
