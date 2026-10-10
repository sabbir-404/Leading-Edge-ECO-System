const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getDetails(relPath) {
    const fullPath = fs.realpathSync(relPath);
    const stat = fs.statSync(fullPath);
    const buf = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();

    let ver = {};
    try {
        const psCmd = `(Get-Item '${fullPath}').VersionInfo | Select-Object ProductName, ProductVersion, FileVersion | ConvertTo-Json`;
        const json = execSync(`powershell -Command "${psCmd}"`, { encoding: 'utf8' });
        ver = JSON.parse(json);
    } catch {}

    return {
        path: fullPath,
        size: stat.size,
        productName: ver.ProductName || 'N/A',
        productVersion: ver.ProductVersion || 'N/A',
        fileVersion: ver.FileVersion || 'N/A',
        sha256: hash,
        mtime: stat.mtime.toISOString()
    };
}

console.log('=== UNPACKED EXECUTABLE (v1.8.11) ===');
console.log(JSON.stringify(getDetails('release/win-unpacked/LESOFT.exe'), null, 2));

console.log('\n=== INSTALLER EXECUTABLE (v1.8.11) ===');
console.log(JSON.stringify(getDetails('release/LESOFT-Setup-1.8.11.exe'), null, 2));

console.log('\n=== RELEASED INSTALLER EXECUTABLE (v1.8.10) ===');
console.log(JSON.stringify(getDetails('release/LESOFT-Setup-1.8.10.exe'), null, 2));
