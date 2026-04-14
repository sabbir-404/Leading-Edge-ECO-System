const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting LESOFT Build Pipeline...');

try {
    // 1. Build Frontend
    console.log('📦 Building Frontend with Vite...');
    execSync('npm run build', { stdio: 'inherit' });

    // 2. Build Electron Main/Preload
    console.log('⚙️ Bundling Electron code with esbuild...');

    // Build Main
    execSync('npx esbuild electron/main.ts --bundle --platform=node --target=node18 --external:electron --external:better-sqlite3 --external:mysql2 --external:bcryptjs --external:electron-updater --outfile=core/main.cjs', { stdio: 'inherit' });

    // Build Preload
    execSync('npx esbuild electron/preload.ts --bundle --platform=node --target=node18 --external:electron --outfile=core/preload.cjs', { stdio: 'inherit' });

    // 3. Code hardening - commented out while debugging blank screen
    // Obfuscate Main (NOTE: self-defending can crash Node.js runtime - use carefully)
    /*
    execSync('npx javascript-obfuscator core/main.cjs --output core/main.cjs --compact true --self-defending true --string-array true --string-array-encoding rc4 --string-array-threshold 1', { stdio: 'inherit' });
    
    // Obfuscate Preload
    execSync('npx javascript-obfuscator core/preload.cjs --output core/preload.cjs --compact true --self-defending true --string-array true', { stdio: 'inherit' });
    */

    // Obfuscate Frontend (All JS files in resource/assets)
    /* 
    const assetFiles = fs.readdirSync(path.join(__dirname, 'resource/assets'))
        .filter(f => f.endsWith('.js'));
    
    assetFiles.forEach(file => {
        const filePath = path.join(__dirname, 'resource/assets', file);
        console.log(`   - Obfuscating ${file}...`);
        execSync(`npx javascript-obfuscator "${filePath}" --output "${filePath}" --compact true --string-array true`, { stdio: 'inherit' });
    });
    */

    console.log('✅ Build pipeline complete. Now running electron-builder...');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}
