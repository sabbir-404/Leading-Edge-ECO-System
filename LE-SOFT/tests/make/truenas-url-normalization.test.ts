import { describe, it, expect } from 'vitest';
import { DurableUploadService } from '../../electron/services/media/DurableUploadService';

describe('TrueNAS Storage URL Normalization & Regression Suite', () => {
    const normalize = DurableUploadService.normalizeNasStorageUrl;

    it('1. Normalizes legacy :8080 port to active candidate port :8081 for Tailscale endpoint', () => {
        const raw = 'http://100.88.85.6:8080/files/orders/99/canary.png';
        const candidate = 'http://100.88.85.6:8081';
        const normalized = normalize(raw, candidate);

        expect(normalized).toBe('http://100.88.85.6:8081/files/orders/99/canary.png');
    });

    it('2. Normalizes legacy :8080 port to active candidate port :8081 for LAN endpoint', () => {
        const raw = 'http://192.168.1.14:8080/files/cad/blueprint.dxf';
        const candidate = 'http://192.168.1.14:8081';
        const normalized = normalize(raw, candidate);

        expect(normalized).toBe('http://192.168.1.14:8081/files/cad/blueprint.dxf');
    });

    it('3. Preserves URL subpath, query parameters, and fragments without corruption', () => {
        const raw = 'http://100.88.85.6:8080/files/deep/nested/path/schematic.png?version=2&auth=active#section4';
        const candidate = 'http://100.88.85.6:8081';
        const normalized = normalize(raw, candidate);

        expect(normalized).toBe('http://100.88.85.6:8081/files/deep/nested/path/schematic.png?version=2&auth=active#section4');
    });

    it('4. Correctly resolves relative paths against candidate base', () => {
        const raw = '/files/orders/test_canary.png';
        const candidate = 'http://100.88.85.6:8081';
        const normalized = normalize(raw, candidate);

        expect(normalized).toBe('http://100.88.85.6:8081/files/orders/test_canary.png');
    });

    it('5. Aligns legacy :8080 responses with Cloudflare Tunnel HTTPS base URL', () => {
        const raw = 'http://100.88.85.6:8080/files/specs/spec_12.pdf';
        const candidate = 'https://storage.lenas.me';
        const normalized = normalize(raw, candidate);

        expect(normalized).toBe('https://storage.lenas.me/files/specs/spec_12.pdf');
    });

    it('6. Does NOT rewrite unrelated or external hostnames with port :8080', () => {
        const raw = 'http://attacker.com:8080/files/malicious.exe';
        const candidate = 'http://100.88.85.6:8081';
        const normalized = normalize(raw, candidate);

        // Unapproved hostname is not normalized to candidate
        expect(normalized).toBe('http://attacker.com:8080/files/malicious.exe');
        expect(normalized).not.toContain('100.88.85.6');
    });

    it('7. Preserves already-valid URLs on approved ports without modification', () => {
        const valid8081 = 'http://100.88.85.6:8081/files/orders/ok.png';
        const candidate = 'http://100.88.85.6:8081';
        expect(normalize(valid8081, candidate)).toBe('http://100.88.85.6:8081/files/orders/ok.png');

        const validHttps = 'https://storage.lenas.me/files/orders/ok.png';
        expect(normalize(validHttps, 'https://storage.lenas.me')).toBe('https://storage.lenas.me/files/orders/ok.png');
    });

    it('8. Gracefully handles null, empty, or malformed inputs without throwing', () => {
        expect(normalize('', 'http://100.88.85.6:8081')).toBe('');
        expect(normalize(null as any, 'http://100.88.85.6:8081')).toBeNull();
        expect(normalize('not-a-valid-url:::', 'http://100.88.85.6:8081')).toBe('not-a-valid-url:::');
    });

    it('9. Rejects unverified remote objects when HTTP read-back fails or returns non-200', async () => {
        const service = DurableUploadService.getInstance();
        const res = await service.verifyRemoteObject('http://100.88.85.6:8081/files/nonexistent_canary_404.png', 'SOME_EXPECTED_SHA256');

        expect(res.verified).toBe(false);
        expect(res.error).toMatch(/HTTP 404|fetch failed|timeout/);
    });

    it('10. Rejects remote objects when SHA-256 digest does not match expected hash', async () => {
        const service = DurableUploadService.getInstance();
        // Probe an existing endpoint or read-back with deliberately mismatched hash
        const res = await service.verifyRemoteObject('http://100.88.85.6:8081/health', 'DEADBEEF00000000000000000000000000000000000000000000000000000000');

        expect(res.verified).toBe(false);
        expect(res.error).toContain('Remote digest mismatch');
    });
});
