const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const exePath = 'F:\\Code\\Leading Edge\\LE-SOFT\\release\\win-unpacked\\LESOFT.exe';
const stat = fs.statSync(exePath);
const buf = fs.readFileSync(exePath);
const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();

const psCmd = `(Get-Item '${exePath}').VersionInfo | Select-Object ProductName, ProductVersion, FileVersion | ConvertTo-Json`;
const json = execSync(`powershell -Command "${psCmd}"`, { encoding: 'utf8' });
const ver = JSON.parse(json);

console.log('EXACT_PATH: ' + exePath);
console.log('EXACT_LENGTH: ' + stat.size + ' bytes');
console.log('PRODUCT_NAME: ' + ver.ProductName);
console.log('PRODUCT_VERSION: ' + ver.ProductVersion);
console.log('FILE_VERSION: ' + ver.FileVersion);
console.log('SHA256: ' + hash);
