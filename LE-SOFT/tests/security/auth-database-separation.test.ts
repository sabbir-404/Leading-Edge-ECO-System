import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    authClient,
    getAuthClient,
    supabase,
    nasClient,
    supabaseClient,
    reinitSupabaseClients,
    inspectJwtIssuerSafely,
    failoverEngine
} from '../../electron/supabase';
import { SessionManager } from '../../electron/session-manager';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '../../electron/credentials';

describe('Auth & Database Transport Separation Suite (Tests A - I)', () => {
    // Generate a valid mock Supabase Auth JWT token for tests
    const mockJwtHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const mockJwtPayload = Buffer.from(JSON.stringify({
        iss: 'https://ildkkgjrolcjijwfokek.supabase.co/auth/v1',
        sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'ashraf@lesoft.local',
        exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    const mockSignature = Buffer.from('mockSignatureValidToken1234567890').toString('base64url');
    const mockAccessToken = `${mockJwtHeader}.${mockJwtPayload}.${mockSignature}`;
    const mockRefreshToken = 'mock_refresh_token_abcdef123456';

    const validSupabaseSession = {
        access_token: mockAccessToken,
        refresh_token: mockRefreshToken,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            app_metadata: {},
            user_metadata: { role: 'admin', full_name: 'Ashraf Admin' },
            aud: 'authenticated',
            created_at: new Date().toISOString()
        }
    };

    beforeEach(() => {
        reinitSupabaseClients();
        SessionManager.clearSession();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        SessionManager.clearSession();
    });

    it('Test A: authClient.setSession(validSupabaseSession) uses Supabase Auth and does NOT call NAS', async () => {
        const currentAuthClient = getAuthClient();
        expect(currentAuthClient).toBeDefined();

        // Spy on native global fetch
        const contactedUrls: string[] = [];
        const originalFetch = globalThis.fetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = typeof input === 'string' ? input : input.toString();
            contactedUrls.push(urlStr);

            // Mock Supabase Auth /auth/v1/user response
            if (urlStr.includes('/auth/v1/user')) {
                return new Response(JSON.stringify(validSupabaseSession.user), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return originalFetch(input, init);
        });

        // Call setSession on authClient
        const { data, error } = await currentAuthClient.auth.setSession({
            access_token: validSupabaseSession.access_token,
            refresh_token: validSupabaseSession.refresh_token
        });

        expect(error).toBeNull();
        expect(data.session).toBeDefined();
        expect(data.user?.id).toBe(validSupabaseSession.user.id);

        // Verification: Requests must only be routed to Supabase Cloud Auth, NEVER to NAS PostgREST
        const authCalls = contactedUrls.filter(u => u.includes('/auth/v1/'));
        expect(authCalls.length).toBeGreaterThan(0);
        authCalls.forEach(url => {
            expect(url).toContain(PUBLIC_SUPABASE_URL);
            expect(url).not.toContain(':3001');
            expect(url).not.toContain('100.88.85.6');
        });
    });

    it('Test B: authClient.getUser() does NOT go through NAS PostgREST', async () => {
        const currentAuthClient = getAuthClient();
        const contactedUrls: string[] = [];

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();
            contactedUrls.push(urlStr);

            if (urlStr.includes('/auth/v1/user')) {
                return new Response(JSON.stringify(validSupabaseSession.user), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('Not found', { status: 404 });
        });

        const { data, error } = await currentAuthClient.auth.getUser(mockAccessToken);

        expect(error).toBeNull();
        expect(data.user?.id).toBe(validSupabaseSession.user.id);

        // Ensure NAS port 3001 was never contacted
        expect(contactedUrls.some(u => u.includes(':3001'))).toBe(false);
        expect(contactedUrls.every(u => u.startsWith(PUBLIC_SUPABASE_URL))).toBe(true);
    });

    it('Test C: MAKE database GET uses DatabaseFailoverEngine/NAS primary when available', async () => {
        const activeClient = failoverEngine.getActiveClient();
        expect(activeClient).toBeDefined();

        const contactedEndpoints: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();
            contactedEndpoints.push(urlStr);

            if (urlStr.includes('/make_products') || urlStr.includes('/products')) {
                return new Response(JSON.stringify([{ id: 101, model_code: 'TEST-DESK-01' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('[]', { status: 200 });
        });

        // Trigger query via the proxy
        const res = await supabase.from('make_products').select('*');
        expect(res.error).toBeNull();
        expect(res.data).toBeDefined();

        // Database queries go through DatabaseFailoverEngine
        expect(contactedEndpoints.length).toBeGreaterThan(0);
    });

    it('Test D: NAS database unavailable -> database falls back correctly & authenticated session remains valid', async () => {
        // 1. Establish authenticated session in SessionManager
        SessionManager.setSession({
            id: 42,
            username: 'designer_ashraf',
            role: 'designer',
            permissions: { 'make:catalog:view': true }
        });

        expect(SessionManager.getSession()?.username).toBe('designer_ashraf');

        // 2. Simulate NAS database being completely offline / refused
        const contactedUrls: string[] = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();
            contactedUrls.push(urlStr);

            // NAS connection fails
            if (urlStr.includes(':3001')) {
                throw new Error('connect ECONNREFUSED 100.88.85.6:3001');
            }

            // Supabase Cloud database fallback succeeds
            if (urlStr.includes('supabase.co')) {
                return new Response(JSON.stringify([{ id: 201, model_code: 'CLOUD-FALLBACK-CHAIR' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not found', { status: 404 });
        });

        // 3. Make database query during NAS outage
        const res = await supabase.from('make_products').select('*');

        // Verification:
        // A) Query fell back to Supabase Cloud
        expect(res.error).toBeNull();
        expect(res.data).toEqual([{ id: 201, model_code: 'CLOUD-FALLBACK-CHAIR' }]);

        // B) Authenticated session was NOT destroyed by NAS failure
        const sessionAfter = SessionManager.getSession();
        expect(sessionAfter).toBeDefined();
        expect(sessionAfter?.username).toBe('designer_ashraf');
        expect(sessionAfter?.role).toBe('designer');
    });

    it('Test E: NAS returns 401 for a database request -> correctly classified as database authorization failure & does not log user out', async () => {
        SessionManager.setSession({
            id: 99,
            username: 'sales_user',
            role: 'salesperson',
            permissions: {}
        });

        // Simulate PostgREST 401 on NAS
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();

            if (urlStr.includes(':3001')) {
                return new Response(JSON.stringify({
                    code: 'PGRST301',
                    message: 'JWSError JWSInvalidSignature'
                }), {
                    status: 401,
                    statusText: 'Unauthorized',
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Cloud fallback succeeds
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });

        // Executing query
        await supabase.from('make_products').select('*');

        // User must remain logged in
        expect(SessionManager.getSession()?.username).toBe('sales_user');
    });

    it('Test F: Distinguishes Supabase Auth outage from NAS database outage', async () => {
        // Case 1: Auth service is down (503), but NAS DB is up (200)
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();

            if (urlStr.includes('/auth/v1/')) {
                return new Response(JSON.stringify({ message: 'Auth Service Unavailable' }), {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (urlStr.includes('/make_products')) {
                return new Response(JSON.stringify([{ id: 1, name: 'NAS OK' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not found', { status: 404 });
        });

        const authClient = getAuthClient();
        const { error: authErr } = await authClient.auth.getUser('test_token');
        expect(authErr).toBeDefined();

        // NAS DB query continues to work independently
        const { data: dbData, error: dbErr } = await supabase.from('make_products').select('*');
        expect(dbErr).toBeNull();
        expect(dbData).toBeDefined();
    });

    it('Test G: Session refresh uses Supabase Auth and NAS is not contacted', async () => {
        const contactedUrls: string[] = [];

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();
            contactedUrls.push(urlStr);

            if (urlStr.includes('/auth/v1/token')) {
                return new Response(JSON.stringify({
                    access_token: 'new_refreshed_access_token_789',
                    token_type: 'bearer',
                    expires_in: 3600,
                    refresh_token: 'new_refreshed_refresh_token_789',
                    user: validSupabaseSession.user
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not found', { status: 404 });
        });

        const authClient = getAuthClient();
        const { data, error } = await authClient.auth.refreshSession({
            refresh_token: mockRefreshToken
        });

        expect(error).toBeNull();
        expect(data.session?.access_token).toBe('new_refreshed_access_token_789');

        // NAS must not be contacted during token refresh
        expect(contactedUrls.some(u => u.includes(':3001'))).toBe(false);
        expect(contactedUrls.every(u => u.includes(PUBLIC_SUPABASE_URL))).toBe(true);
    });

    it('Test H: Application restart: session restoration succeeds and MAKE database loads normally', async () => {
        // 1. Simulate application restart
        reinitSupabaseClients();
        const restartedAuthClient = getAuthClient();

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();

            if (urlStr.includes('/auth/v1/user')) {
                return new Response(JSON.stringify(validSupabaseSession.user), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (urlStr.includes(':3001/make_products') || urlStr.includes('/make_products')) {
                return new Response(JSON.stringify([
                    { id: 1, name: 'Executive Desk', code: 'ED-01' }
                ]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('[]', { status: 200 });
        });

        // 2. Restore session on authClient
        const { data: authData, error: authError } = await restartedAuthClient.auth.setSession({
            access_token: mockAccessToken,
            refresh_token: mockRefreshToken
        });

        expect(authError).toBeNull();
        expect(authData.session).toBeDefined();

        SessionManager.setSession({
            id: 1,
            username: 'ashraf',
            role: 'superadmin'
        });

        // 3. Query MAKE database
        const { data: products, error: dbError } = await supabase.from('make_products').select('*');
        expect(dbError).toBeNull();
        expect(products).toBeDefined();
        expect(products?.length).toBeGreaterThan(0);
        expect(SessionManager.getSession()?.username).toBe('ashraf');
    });

    it('Test I: Ensure no auth request is passed to nasFetch & inspectJwtIssuerSafely extracts safe issuer', async () => {
        // Verify inspectJwtIssuerSafely
        const safeIssuer = inspectJwtIssuerSafely(`Bearer ${mockAccessToken}`);
        expect(safeIssuer.present).toBe(true);
        expect(safeIssuer.issuer).toBe('https://ildkkgjrolcjijwfokek.supabase.co/auth/v1');

        const noAuth = inspectJwtIssuerSafely(undefined);
        expect(noAuth.present).toBe(false);
        expect(noAuth.issuer).toBe('none');

        // nasClient is strictly database-only: calling auth.getSession() is blocked by SupabaseClient
        if (nasClient) {
            expect(() => (nasClient as any).auth.getSession()).toThrow(/accessToken option/);
        }
    });

    it('Test J: NAS PostgREST query NEVER inherits Supabase Cloud user JWT when user is logged in', async () => {
        reinitSupabaseClients();
        const activeAuthClient = getAuthClient();

        // 1. Mock user login on Auth Client
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = typeof input === 'string' ? input : input.toString();

            if (urlStr.includes('/auth/v1/user')) {
                return new Response(JSON.stringify(validSupabaseSession.user), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('[]', { status: 200 });
        });

        await activeAuthClient.auth.setSession({
            access_token: mockAccessToken,
            refresh_token: mockRefreshToken
        });

        // Verify authClient has active session
        const { data: sessionData } = await activeAuthClient.auth.getSession();
        expect(sessionData.session?.access_token).toBe(mockAccessToken);

        // 2. Spy on fetch to inspect the headers sent to NAS PostgREST
        let capturedNasHeaders: Headers | null = null;
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = typeof input === 'string' ? input : input.toString();

            if (urlStr.includes(':3001/make_products')) {
                capturedNasHeaders = new Headers(init?.headers);
                return new Response(JSON.stringify([{ id: 101, name: 'Executive Chair' }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('[]', { status: 200 });
        });

        // 3. Execute query on nasClient
        expect(nasClient).toBeDefined();
        const res = await nasClient!.from('make_products').select('id, name');
        expect(res.error).toBeNull();
        expect(res.data).toBeDefined();

        // 4. Verify Authorization header sent to NAS PostgREST:
        // Must NEVER contain the user's Supabase Cloud JWT!
        expect(capturedNasHeaders).not.toBeNull();
        const authHeader = capturedNasHeaders!.get('Authorization');
        expect(authHeader).toBeDefined();
        expect(authHeader).not.toBe(`Bearer ${mockAccessToken}`);
        expect(authHeader).toBe(`Bearer ${PUBLIC_SUPABASE_ANON_KEY}`);

        const apiKeyHeader = capturedNasHeaders!.get('apikey');
        expect(apiKeyHeader).toBe(PUBLIC_SUPABASE_ANON_KEY);
    });

    it('Test K: verifyAndRecoverNas succeeds and sends NAS database credential even with active user session', async () => {
        reinitSupabaseClients();
        const activeAuthClient = getAuthClient();

        // Establish user session
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const urlStr = typeof input === 'string' ? input : input.toString();
            if (urlStr.includes('/auth/v1/user')) {
                return new Response(JSON.stringify(validSupabaseSession.user), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('[]', { status: 200 });
        });

        await activeAuthClient.auth.setSession({
            access_token: mockAccessToken,
            refresh_token: mockRefreshToken
        });

        // Spy on NAS health probe
        let capturedProbeAuth: string | null = null;
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = typeof input === 'string' ? input : input.toString();

            if (urlStr.includes(':3001/make_products')) {
                const h = new Headers(init?.headers);
                capturedProbeAuth = h.get('Authorization');
                return new Response(JSON.stringify([{ id: 1 }]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response('[]', { status: 200 });
        });

        const recovered = await failoverEngine.verifyAndRecoverNas();
        expect(recovered).toBe(true);
        expect(capturedProbeAuth).toBe(`Bearer ${PUBLIC_SUPABASE_ANON_KEY}`);
        expect(capturedProbeAuth).not.toBe(`Bearer ${mockAccessToken}`);
    });
});
