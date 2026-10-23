const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const coreDir = path.join(root, 'core');
fs.mkdirSync(coreDir, { recursive: true });

const esbuild = require.resolve('esbuild/bin/esbuild');
const common = ['--bundle', '--platform=node', '--target=node18', '--external:electron'];
execFileSync(process.execPath, [
    esbuild,
    'electron/main.ts',
    ...common,
    '--external:better-sqlite3',
    '--external:mysql2',
    '--external:bcryptjs',
    '--external:electron-updater',
    '--external:sharp',
    '--outfile=core/app-main.cjs',
], { cwd: root, stdio: 'inherit' });

execFileSync(process.execPath, [
    esbuild,
    'electron/preload.ts',
    '--bundle',
    '--platform=node',
    '--target=node18',
    '--external:electron',
    '--outfile=core/preload.cjs',
], { cwd: root, stdio: 'inherit' });

fs.copyFileSync(path.join(root, 'electron/bootstrap.cjs'), path.join(coreDir, 'main.cjs'));
