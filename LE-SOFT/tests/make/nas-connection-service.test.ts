import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { createServer, clientRegistry, metrics, dbDiagnostics, dbQueue } from '../../scripts/nas-connection-service.js';

describe('NAS Connection Service — Architecture, Security & Durability Verification', () => {
    let server: http.Server;
    let baseUrl: string;
    const TEST_ADMIN_SECRET = 'super-secret-admin-key-2026-secure';

    beforeAll(async () => {
        process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;
        server = createServer();
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as any;
                baseUrl = `http://127.0.0.1:${address.port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    beforeEach(() => {
        clientRegistry.clear();
        dbQueue.length = 0;
        dbDiagnostics.pendingQueueLength = 0;
    });

    const postJson = async (path: string, body: any, headers: Record<string, string> = {}) => {
        const res = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body)
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch {}
        return { status: res.status, ok: res.ok, data };
    };

    const getJson = async (path: string, headers: Record<string, string> = {}) => {
        const res = await fetch(`${baseUrl}${path}`, {
            method: 'GET',
            headers
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch {}
        return { status: res.status, ok: res.ok, data };
    };

    // ── 1. HEALTH CHECKS & DIAGNOSTICS TRUTHFULNESS ──────────────────────────
    it('GET /health returns 200 with truthful database persistence status', async () => {
        const { status, data } = await getJson('/health');
        expect(status).toBe(200);
        expect(data.status).toBe('healthy');
        expect(data.service).toBe('nas-connection-service');
        expect(typeof data.uptimeSeconds).toBe('number');
        expect(data.dbPersistence).toBeDefined();
        expect(typeof data.dbPersistence.pendingQueueLength).toBe('number');
    });

    // ── 2. HEARTBEAT & LEASE REGISTRATION ────────────────────────────────────
    it('registers a new client installation and returns a 24-byte cryptographic sessionSecret', async () => {
        const installId = 'inst-test-client-alpha';
        const res = await postJson('/api/heartbeat', {
            installationId: installId,
            appVersion: '1.8.11'
        });

        expect(res.status).toBe(200);
        expect(res.data.acknowledged).toBe(true);
        expect(typeof res.data.sessionSecret).toBe('string');
        expect(res.data.sessionSecret.length).toBe(48); // 24 bytes hex = 48 chars
        expect(res.data.leaseTtlMs).toBe(45000);
        expect(res.data.persistence).toBeDefined();

        // Verify stored in registry with secret_hash in metadata
        expect(clientRegistry.has(installId)).toBe(true);
        const stored = clientRegistry.get(installId);
        expect(stored.sessionSecret).toBe(res.data.sessionSecret);
        expect(stored.secretHash).toBeDefined();
        expect(stored.sessionStatus).toBe('active');
    });

    // ── 3. ANTI-IMPERSONATION & HIJACKING REJECTION ──────────────────────────
    it('strictly rejects forged or mismatched sessionSecret for an active lease (HTTP 403)', async () => {
        const installId = 'inst-test-protected';
        // 1. Initial registration
        const regRes = await postJson('/api/heartbeat', {
            installationId: installId,
            appVersion: '1.8.11'
        });
        const validSecret = regRes.data.sessionSecret;

        // 2. Legitimate heartbeat with valid secret succeeds
        const legitRes = await postJson('/api/heartbeat', {
            installationId: installId,
            sessionSecret: validSecret,
            appVersion: '1.8.11'
        });
        expect(legitRes.status).toBe(200);

        // 3. Impersonator attempting heartbeat on same installId with fraudulent secret gets rejected
        const fraudRes = await postJson('/api/heartbeat', {
            installationId: installId,
            sessionSecret: 'forged-attacker-secret-token',
            appVersion: '1.8.11'
        });
        expect(fraudRes.status).toBe(403);
        expect(fraudRes.data.error).toContain('Session secret mismatch');
    });

    // ── 4. DAEMON RESTART & SECRET HASH HYDRATION PROTECTION ─────────────────
    it('prevents attacker from claiming a hydrated session after daemon restart without the secret', async () => {
        const installId = 'inst-hydrated-client-secure';
        const secret = 'f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6';
        const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

        // Simulate session hydrated from database on daemon restart:
        clientRegistry.set(installId, {
            installationId: installId,
            sessionSecret: null, // Ephemeral; not in memory after cold restart
            secretHash: secretHash, // Hydrated securely from metadata
            appVersion: '1.8.11',
            sessionStatus: 'active',
            connectionState: 'connected',
            clientIp: '127.0.0.1',
            firstSeenAt: Date.now() - 60000,
            lastSeenAt: Date.now() - 5000,
            leaseExpiresAt: Date.now() + 40000,
            metadata: { secret_hash: secretHash }
        });

        // 1. Attacker attempts to take over hydrated session with null or wrong secret -> REJECTED (403)
        const attackerRes = await postJson('/api/heartbeat', {
            installationId: installId,
            sessionSecret: 'attacker-wrong-secret-token-attempt',
            appVersion: '1.8.11'
        });
        expect(attackerRes.status).toBe(403);
        expect(attackerRes.data.error).toContain('Session secret mismatch');

        // 2. Legitimate client presents legitimate secret -> ACCEPTED (200)
        const legitRes = await postJson('/api/heartbeat', {
            installationId: installId,
            sessionSecret: secret,
            appVersion: '1.8.11'
        });
        expect(legitRes.status).toBe(200);
        expect(legitRes.data.acknowledged).toBe(true);
        expect(legitRes.data.sessionSecret).toBe(secret);
    });

    // ── 5. GRACEFUL EXIT DEREGISTRATION ──────────────────────────────────────
    it('accepts graceful exit with valid sessionSecret and denies unauthorized exit', async () => {
        const installId = 'inst-graceful-exit-test';
        const regRes = await postJson('/api/heartbeat', { installationId: installId });
        const secret = regRes.data.sessionSecret;

        // Unauthorized exit attempt
        const badExit = await postJson('/api/session/exit', {
            installationId: installId,
            sessionSecret: 'wrong-secret'
        });
        expect(badExit.status).toBe(403);

        // Authorized exit
        const goodExit = await postJson('/api/session/exit', {
            installationId: installId,
            sessionSecret: secret
        });
        expect(goodExit.status).toBe(200);
        expect(clientRegistry.get(installId).sessionStatus).toBe('exited');
    });

    // ── 6. ADMIN TELEMETRY PRIVACY & RBAC ────────────────────────────────────
    it('GET /api/clients enforces ADMIN_SECRET and strictly redacts sessionSecret and secret_hash', async () => {
        await postJson('/api/heartbeat', { installationId: 'inst-telemetry-client' });

        // Unauthenticated request fails (401)
        const unauth = await getJson('/api/clients');
        expect(unauth.status).toBe(401);

        // Wrong secret fails (401)
        const wrongAuth = await getJson('/api/clients', { 'x-admin-key': 'wrong-key' });
        expect(wrongAuth.status).toBe(401);

        // Valid secret succeeds (200)
        const validAuth = await getJson('/api/clients', { 'x-admin-key': TEST_ADMIN_SECRET });
        expect(validAuth.status).toBe(200);
        expect(validAuth.data.totalRegistered).toBeGreaterThanOrEqual(1);

        // Ensure sessionSecret and secret_hash are never leaked in admin list
        const rawJson = JSON.stringify(validAuth.data);
        expect(rawJson).not.toContain('sessionSecret');
        expect(rawJson).not.toContain('secret_hash');
    });

    // ── 7. INPUT VALIDATION ──────────────────────────────────────────────────
    it('rejects malformed installationId payloads with HTTP 400', async () => {
        const resTooShort = await postJson('/api/heartbeat', { installationId: 'a' });
        expect(resTooShort.status).toBe(400);

        const resInvalidChars = await postJson('/api/heartbeat', { installationId: 'bad<script>id' });
        expect(resInvalidChars.status).toBe(400);

        const resMissing = await postJson('/api/heartbeat', {});
        expect(resMissing.status).toBe(400);
    });
});
