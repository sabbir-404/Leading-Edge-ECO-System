import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import {
    validateLicense,
    verifyLicense,
    LICENSE_VERIFICATION_PUBLIC_KEY,
    VERIFICATION_SALT
} from '../../electron/license-manager';

const {
    generateLicenseKey,
    generateSignedLicense,
    generateLegacyLicenseKey,
    resolveSigningPrivateKey,
    resolveGenerationSecret,
    verifySigningKey
} = require('../../tools/generate-license.cjs');

describe('LE-SOFT Asymmetric License Verification & Security Architecture', () => {
    let privateSigningKey: string;
    let legacyGenerationSecret: string;
    const testMachineA = 'LE-4D99-8523-A984';
    const testMachineB = 'LE-8F12-3456-B789';

    beforeAll(() => {
        const keyRes = resolveSigningPrivateKey();
        expect(keyRes.privateKey, `Private signing key must be available in protected storage (Source: ${keyRes.source})`).toBeTruthy();
        expect(verifySigningKey(keyRes.privateKey)).toBe(true);
        privateSigningKey = keyRes.privateKey;

        const secRes = resolveGenerationSecret();
        expect(secRes.secret, 'Legacy secret must be available for compatibility path').toBeTruthy();
        legacyGenerationSecret = secRes.secret;
    });

    it('1. Valid signed license → accepted by production validateLicense()', () => {
        const key = generateLicenseKey(testMachineA, privateSigningKey);
        expect(key).toMatch(/^LE2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

        const isValid = validateLicense(testMachineA, key);
        expect(isValid).toBe(true);

        const details = verifyLicense(testMachineA, key);
        expect(details.valid).toBe(true);
        expect(details.version).toBe(2);
        expect(details.payload?.mid).toBe(testMachineA);
    });

    it('2. Wrong machine ID → rejected', () => {
        const keyForMachineA = generateLicenseKey(testMachineA, privateSigningKey);

        // Key generated for Machine A passed to Machine B must fail
        expect(validateLicense(testMachineB, keyForMachineA)).toBe(false);
        const details = verifyLicense(testMachineB, keyForMachineA);
        expect(details.valid).toBe(false);
        expect(details.error).toContain('different machine ID');
    });

    it('3. Altered machine ID in payload → rejected (Signature verification failure)', () => {
        const validKey = generateLicenseKey(testMachineA, privateSigningKey);
        const parts = validKey.split('.');

        // Tamper with payload: alter mid to Machine B while retaining original signature
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        payload.mid = testMachineB;
        const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
        const forgedKey = `LE2.${tamperedPayloadB64}.${parts[2]}`;

        // Must reject on Machine B even though payload claims mid is Machine B
        expect(validateLicense(testMachineB, forgedKey)).toBe(false);
        const details = verifyLicense(testMachineB, forgedKey);
        expect(details.valid).toBe(false);
        expect(details.error).toContain('forged license signature');
    });

    it('4. Altered license body → rejected', () => {
        const validKey = generateLicenseKey(testMachineA, privateSigningKey);
        const parts = validKey.split('.');

        // Corrupt any character in the base64url payload
        const corruptedPayload = parts[1].substring(0, 5) + (parts[1][5] === 'A' ? 'B' : 'A') + parts[1].substring(6);
        const corruptedKey = `LE2.${corruptedPayload}.${parts[2]}`;

        expect(validateLicense(testMachineA, corruptedKey)).toBe(false);
    });

    it('5. Altered signature → rejected', () => {
        const validKey = generateLicenseKey(testMachineA, privateSigningKey);
        const parts = validKey.split('.');

        // Flip a byte in the signature
        const sigBuf = Buffer.from(parts[2], 'base64url');
        sigBuf[0] ^= 0xff;
        const forgedSigB64 = sigBuf.toString('base64url');
        const forgedKey = `LE2.${parts[1]}.${forgedSigB64}`;

        expect(validateLicense(testMachineA, forgedKey)).toBe(false);
        const details = verifyLicense(testMachineA, forgedKey);
        expect(details.valid).toBe(false);
        expect(details.error).toContain('Invalid or forged license signature');
    });

    it('6. Truncated license → rejected', () => {
        const validKey = generateLicenseKey(testMachineA, privateSigningKey);

        // Missing signature part entirely
        const parts = validKey.split('.');
        const truncated1 = `${parts[0]}.${parts[1]}`;
        expect(validateLicense(testMachineA, truncated1)).toBe(false);

        // Truncated signature bytes
        const truncated2 = validKey.substring(0, validKey.length - 10);
        expect(validateLicense(testMachineA, truncated2)).toBe(false);
    });

    it('7. Malformed license → rejected', () => {
        expect(validateLicense(testMachineA, '')).toBe(false);
        expect(validateLicense(testMachineA, 'LE2.')).toBe(false);
        expect(validateLicense(testMachineA, 'LE2.invalid_payload_json.1234')).toBe(false);
        expect(validateLicense(testMachineA, 'LE2.e30.invalidsig')).toBe(false);
        expect(validateLicense(testMachineA, 'NOT-A-LICENSE-KEY')).toBe(false);
        expect(validateLicense('', 'LE2.something.sig')).toBe(false);
    });

    it('8. Private signing key unavailable → generation fails closed', () => {
        expect(() => generateSignedLicense(testMachineA, null as any)).toThrow(
            /Private signing key not configured/i
        );
        expect(() => generateSignedLicense(testMachineA, '')).toThrow(
            /Private signing key not configured/i
        );
    });

    it('9. Public key alone cannot generate a valid license', () => {
        // Attempting to sign with the public key must throw in Node's crypto runtime
        const dataToSign = Buffer.from('LE2.dummy');
        expect(() => {
            crypto.sign(null, dataToSign, LICENSE_VERIFICATION_PUBLIC_KEY);
        }).toThrow();

        // Any arbitrary signature fabricated with only public key knowledge is rejected
        const fakeSig = crypto.randomBytes(64).toString('base64url');
        const payloadB64 = Buffer.from(JSON.stringify({ v: 2, mid: testMachineA, iat: 1790000000 })).toString('base64url');
        const fabricatedKey = `LE2.${payloadB64}.${fakeSig}`;
        expect(validateLicense(testMachineA, fabricatedKey)).toBe(false);
    });

    it('10. Legacy licenses continue to follow their compatibility path', () => {
        // Generate authentic legacy V1 key
        const legacyKey = generateLegacyLicenseKey(testMachineA, legacyGenerationSecret);

        // In strict mode (default), legacy keys are rejected to enforce V2:
        expect(validateLicense(testMachineA, legacyKey)).toBe(false);

        // When compatibility mode is explicitly permitted (e.g. existing customer installation on disk):
        const legacyResult = validateLicense(testMachineA, legacyKey, { allowLegacy: true });
        expect(legacyResult).toBe(true);

        const verifyResult = verifyLicense(testMachineA, legacyKey, { allowLegacy: true });
        expect(verifyResult.valid).toBe(true);
        expect(verifyResult.version).toBe(1);

        // Wrong machine still rejected even in legacy mode
        expect(validateLicense(testMachineB, legacyKey, { allowLegacy: true })).toBe(false);
    });

    it('11. CRITICAL: Forged license with correct old 8-char prefix NO LONGER passes the new validator', () => {
        // Calculate the authentic 8-character prefix for testMachineA using VERIFICATION_SALT
        const expectedPrefix = crypto
            .createHmac('sha256', VERIFICATION_SALT)
            .update(testMachineA)
            .digest('hex')
            .substring(0, 8)
            .toUpperCase();

        // Attacker creates a forged key: authentic prefix + arbitrary random 24 chars
        const forgedBody = 'DEADBEEFCAFEBABE11223344';
        const forgedLegacyKey = (expectedPrefix + forgedBody).match(/.{1,4}/g)!.join('-');

        // PROVE: In the new production validator, this forged key FAILS completely!
        const passesNewValidator = validateLicense(testMachineA, forgedLegacyKey);
        expect(passesNewValidator).toBe(false);

        const verifyResult = verifyLicense(testMachineA, forgedLegacyKey);
        expect(verifyResult.valid).toBe(false);
        expect(verifyResult.error).toContain('Unauthenticated legacy license format. V2 signed license required.');
    });
});
