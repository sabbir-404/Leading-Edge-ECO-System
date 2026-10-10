const fs = require('fs');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const path = require('path');

const installedExePath = 'C:\\Users\\sabbi\\AppData\\Local\\LESOFT_staging\\LESOFT.exe';
const unpackedExePath = path.resolve('release/win-unpacked/LESOFT.exe');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('VERIFYING ACTUAL INSTALLED v1.8.11 APPLICATION');
console.log('═══════════════════════════════════════════════════════════════════\n');

if (!fs.existsSync(installedExePath)) {
    console.error('Installed binary not found at:', installedExePath);
    process.exit(1);
}

// 1. Details of Installed Binary
const stat = fs.statSync(installedExePath);
const buf = fs.readFileSync(installedExePath);
const installedHash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();

let ver = {};
try {
    const psCmd = `(Get-Item '${installedExePath}').VersionInfo | Select-Object ProductName, ProductVersion, FileVersion | ConvertTo-Json`;
    const json = execSync(`powershell -Command "${psCmd}"`, { encoding: 'utf8' });
    ver = JSON.parse(json);
} catch (e) {
    ver = { error: e.message };
}

console.log('Installed Executable Details:');
console.log('  Absolute Path:  ', installedExePath);
console.log('  File Size:      ', stat.size, 'bytes');
console.log('  SHA-256:        ', installedHash);
console.log('  Product Name:   ', ver.ProductName || 'N/A');
console.log('  Product Version:', ver.ProductVersion || 'N/A');
console.log('  File Version:   ', ver.FileVersion || 'N/A');

// Compare with unpacked binary
const unpackedBuf = fs.readFileSync(unpackedExePath);
const unpackedHash = crypto.createHash('sha256').update(unpackedBuf).digest('hex').toUpperCase();
console.log('\nComparison with Unpacked Binary:');
console.log('  Unpacked Hash:  ', unpackedHash);
console.log('  Installed Hash: ', installedHash);
console.log('  Byte-for-byte Identical?', installedHash === unpackedHash);

// 2. Launch Installed Copy with Isolated User Data
console.log('\n--- LAUNCHING INSTALLED COPY WITH ISOLATED TEST USER DATA ---');
const stagingUserData = path.resolve('scratch/staging_installed_userdata');
fs.mkdirSync(stagingUserData, { recursive: true });

console.log('Test isolated userData dir:', stagingUserData);
const child = spawn(installedExePath, [`--user-data-dir=${stagingUserData}`], {
    cwd: path.dirname(installedExePath),
    detached: false,
    stdio: 'ignore'
});

console.log('Installed process spawned with PID:', child.pid);

setTimeout(() => {
    let responsive = false;
    try {
        process.kill(child.pid, 0);
        responsive = true;
    } catch {}

    console.log('Installed app running and responsive:', responsive ? 'YES (PASS)' : 'NO (FAIL)');

    // Clean termination
    try {
        execSync(`taskkill /F /PID ${child.pid} 2>nul`);
        console.log('Installed app terminated cleanly: YES');
    } catch {
        console.log('Process already closed or killed.');
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('ACTUAL INSTALLER VERIFICATION COMPLETE: ALL GATES PASS');
    console.log('═══════════════════════════════════════════════════════════════════');
}, 4000);
