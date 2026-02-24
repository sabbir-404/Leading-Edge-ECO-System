const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting LE-SOFT Build Pipeline...');

try {
    // 1. Build Frontend
    console.log('📦 Building Frontend with Vite...');
    execSync('npm run build', { stdio: 'inherit' });

    // 2. Build Electron Main/Preload
    console.log('⚙️ Bundling Electron code with esbuild...');

    // Build Main
    execSync('npx esbuild electron/main.ts --bundle --platform=node --target=node18 --external:electron --external:sqlite3 --external:bcrypt --external:electron-updater --outfile=dist-electron/main.cjs', { stdio: 'inherit' });

    // Build Preload
    execSync('npx esbuild electron/preload.ts --bundle --platform=node --target=node18 --external:electron --outfile=dist-electron/preload.cjs', { stdio: 'inherit' });

    console.log('✅ Build pipeline complete. Now running electron-builder...');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
