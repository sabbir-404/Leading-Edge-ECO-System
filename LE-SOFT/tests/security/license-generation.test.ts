import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { generateSignedMachineLicense } from '../../electron/services/license-generation';

describe('signed machine license generation', () => {
    const pair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    it('creates a v2 signature bound to the normalized machine ID', () => {
        const license = generateSignedMachineLicense('le-ab12-cd34', pair.privateKey, pair.publicKey);
        const [version, payloadEncoded, signatureEncoded] = license.split('.');
        const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));

        expect(version).toBe('LE2');
        expect(payload).toMatchObject({ v: 2, mid: 'LE-AB12-CD34', type: 'commercial' });
        expect(crypto.verify(
            null,
            Buffer.from(`LE2.${payloadEncoded}`, 'utf8'),
            pair.publicKey,
            Buffer.from(signatureEncoded, 'base64url'),
        )).toBe(true);
    });

    it('rejects a signing key that does not match the verifier key', () => {
        const otherPair = crypto.generateKeyPairSync('ed25519');
        expect(() => generateSignedMachineLicense('LE-AB12-CD34', pair.privateKey, otherPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()))
            .toThrow(/does not match/i);
    });

    it('rejects malformed machine IDs', () => {
        expect(() => generateSignedMachineLicense('../machine', pair.privateKey, pair.publicKey)).toThrow(/Invalid Machine ID/i);
    });
});
