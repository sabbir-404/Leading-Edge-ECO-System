#!/usr/bin/env node
/**
 * LE-SOFT License Key Generator
 * 
 * DEVELOPER-ONLY TOOL — Do NOT ship this with the application.
 * 
 * Usage:
 *   node tools/generate-license.cjs LE-A1B2-C3D4-E5F6
 * 
 * The customer sends you their Machine ID (shown in the License Gate),
 * and you run this tool to generate a key for their specific machine.
 */

const crypto = require('crypto');

// ═══════════════════════════════════════════════
//  THIS IS THE GENERATION SECRET — KEEP IT SAFE!
//  This must NEVER be shipped with the application.
//  Change this to your own unique secret string.
// ═══════════════════════════════════════════════
const GENERATION_SECRET = 'LE-SOFT-MASTER-KEY-2026-Pr0duct10n-S3cret!@#';

// This must match VERIFICATION_SALT in license-manager.ts
const VERIFICATION_SALT = 'LE-SOFT-2026-VERIFY-SALT-xK9mQ2';

function generateLicenseKey(machineId) {
    if (!machineId || !machineId.startsWith('LE-')) {
        console.error('❌ Invalid Machine ID. Must start with "LE-"');
        console.error('Usage: node tools/generate-license.cjs <MachineID>');
        process.exit(1);
    }

    // Step 1: Generate the machine-specific prefix (must match validation in license-manager.ts)
    const prefix = crypto
        .createHmac('sha256', VERIFICATION_SALT)
        .update(machineId)
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();

    // Step 2: Generate the unique key body from the secret
    const body = crypto
        .createHmac('sha256', GENERATION_SECRET)
        .update(machineId)
        .digest('hex')
        .substring(0, 24)
        .toUpperCase();

    // Step 3: Combine prefix + body
    const fullKey = prefix + body;

    // Format for readability: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
    const formatted = fullKey.match(/.{1,4}/g).join('-');

    return formatted;
}

// CLI
const machineId = process.argv[2];

if (!machineId) {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   LE-SOFT License Key Generator          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('Usage:');
    console.log('  node tools/generate-license.cjs <MachineID>');
    console.log('');
    console.log('Example:');
    console.log('  node tools/generate-license.cjs LE-A1B2-C3D4-E5F6');
    console.log('');
    console.log('The customer will show you their Machine ID');
    console.log('from the License Gate screen when they first');
    console.log('launch the application.');
    console.log('');
    process.exit(0);
}

const key = generateLicenseKey(machineId);
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   License Key Generated                   ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');
console.log(`  Machine ID:   ${machineId}`);
console.log(`  License Key:  ${key}`);
console.log('');
console.log('Send this key to the customer.');
console.log('It will ONLY work on the machine with this ID.');
console.log('');
