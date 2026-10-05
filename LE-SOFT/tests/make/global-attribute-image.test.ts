/**
 * Regression suite — Global Attribute image save path + MakeCadService upload path.
 *
 * Covers:
 *  - PGRST204 "Could not find the 'image_url' column of 'make_product_specifications'"
 *  - TypeError: crypto.randomBytes is not a function (MakeCadService.uploadValidatedBuffer)
 *
 * The real `make-save-global-attribute` IPC handler and the real
 * `MakeCadService.uploadValidatedBuffer` are exercised; only the Supabase
 * client / network layer is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
    const state: {
        calls: Array<{ table: string; op: 'insert' | 'update'; body: any }>;
        responder: (table: string, op: string, body: any) => { data: any; error: any } | Promise<{ data: any; error: any }>;
        cloudCalls: Array<{ table: string; row: any }>;
        handlers: Record<string, Function>;
    } = {
        calls: [],
        responder: () => ({ data: { id: 1 }, error: null }),
        cloudCalls: [],
        handlers: {}
    };

    const makeBuilder = (table: string) => {
        let op: 'insert' | 'update' = 'insert';
        let body: any = null;
        const b: any = {
            insert: (v: any) => { op = 'insert'; body = v; state.calls.push({ table, op, body }); return b; },
            update: (v: any) => { op = 'update'; body = v; state.calls.push({ table, op, body }); return b; },
            eq: () => b,
            select: () => b,
            single: async () => state.responder(table, op, body)
        };
        return b;
    };

    return { state, makeBuilder };
});

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => process.cwd() + '/__no_such_userdata__'), isPackaged: false },
    dialog: { showOpenDialog: vi.fn() },
    shell: {},
    BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
    ipcMain: {
        handle: vi.fn((channel: string, fn: Function) => { h.state.handlers[channel] = fn; }),
        on: vi.fn(),
        removeHandler: vi.fn()
    }
}));

vi.mock('../../electron/supabase', () => ({
    supabase: {
        from: vi.fn((table: string) => h.makeBuilder(table)),
        storage: {
            from: vi.fn(() => ({
                upload: vi.fn().mockResolvedValue({ error: null }),
                getPublicUrl: vi.fn((p: string) => ({ data: { publicUrl: `public/${p}` } }))
            }))
        }
    },
    supabaseAdmin: {
        from: vi.fn((table: string) => ({
            upsert: (row: any) => {
                h.state.cloudCalls.push({ table, row });
                return { catch: vi.fn() };
            }
        }))
    },
    failoverEngine: {},
    getCfAccessHeaders: vi.fn(() => ({}))
}));

import { SessionManager, UserSession } from '../../electron/session-manager';
import { registerMakeHandlers } from '../../electron/ipc/handlers/make';
import { MakeCadService } from '../../electron/services/make/MakeCadService';

const designer: UserSession = {
    userId: 101,
    username: 'yousuf',
    role: 'furniture_designer',
    fullName: 'Yousuf',
    permissions: { write_make_catalog: true, manage_global_product_attributes: true },
    authExpiresAt: Date.now() + 3600000
};

const unauthorized: UserSession = {
    userId: 99,
    username: 'designer_no_perm',
    role: 'furniture_designer',
    fullName: 'No Perm',
    permissions: { write_make_catalog: true },
    authExpiresAt: Date.now() + 3600000
};

const IMG = 'https://storage.lenas.me/files/make-catalog/1700000000_ab12cd34_spec.png';

describe('Global Attribute image save path (make-save-global-attribute)', () => {
    let save: Function;

    beforeEach(() => {
        h.state.calls = [];
        h.state.cloudCalls = [];
        h.state.responder = (_t, _op, body) => ({ data: { id: 7, ...body }, error: null });
        registerMakeHandlers();
        save = h.state.handlers['make-save-global-attribute'];
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(designer);
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('A. spec WITHOUT image never sends image_url (no PGRST204 trigger)', async () => {
        const res = await save({}, { type: 'spec', spec_name: 'Teak Frame', spec_code: 'TK-1', image_url: null });
        expect(res.success).toBe(true);
        expect(res.imageSkipped).toBeUndefined();
        const write = h.state.calls.find(c => c.table === 'make_product_specifications')!;
        expect(write.body).not.toHaveProperty('image_url');
        expect(write.body.product_id).toBeNull();
    });

    it('B. spec WITH image sends image_url when the column exists and persists it', async () => {
        const res = await save({}, { type: 'spec', spec_name: 'Teak Frame', image_url: IMG });
        expect(res.success).toBe(true);
        expect(res.imageSkipped).toBeUndefined();
        const specWrites = h.state.calls.filter(c => c.table === 'make_product_specifications');
        expect(specWrites).toHaveLength(1);
        expect(specWrites[0].body.image_url).toBe(IMG);
        expect(res.attribute.image_url).toBe(IMG);
        expect(h.state.cloudCalls[0].table).toBe('make_product_specifications');
    });

    it('B2. spec WITH image on a database lacking migration 066 (PGRST204) fails with clear actionable error and leaves record in known state', async () => {
        h.state.responder = (_t, _op, body) =>
            'image_url' in body
                ? {
                    data: null,
                    error: {
                        code: 'PGRST204',
                        message: "Could not find the 'image_url' column of 'make_product_specifications' in the schema cache"
                    }
                }
                : { data: { id: 8, ...body }, error: null };

        const res = await save({}, { type: 'spec', spec_name: 'Teak Frame', image_url: IMG });
        expect(res.success).toBe(false);
        expect(res.error).toContain('migration 066');
        // Record was not modified or half-written
        expect(h.state.cloudCalls).toHaveLength(0);
    });

    it('B3. PGRST204 for an unrelated column is NOT swallowed', async () => {
        h.state.responder = () => ({
            data: null,
            error: { code: 'PGRST204', message: "Could not find the 'bogus' column of 'make_product_specifications' in the schema cache" }
        });
        const res = await save({}, { type: 'spec', spec_name: 'X', image_url: IMG });
        expect(res.success).toBe(false);
        expect(h.state.calls.filter(c => c.table === 'make_product_specifications')).toHaveLength(1);
    });

    it('B4. updating an existing spec with image on missing migration produces actionable failure', async () => {
        h.state.responder = (_t, op, body) =>
            'image_url' in body
                ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'image_url' column of 'make_product_specifications' in the schema cache" } }
                : { data: { id: 3, ...body }, error: null };
        const res = await save({}, { type: 'spec', id: 3, spec_name: 'Teak Frame', image_url: IMG });
        expect(res.success).toBe(false);
        expect(res.error).toContain('migration 066');
    });

    it('C. blank size_label + dimensions + image: size write has SQL NULL label and never carries image_url', async () => {
        const res = await save({}, {
            type: 'size', size_label: '   ', length: 1800, width: 900, height: 750, unit: 'mm', image_url: IMG
        });
        expect(res.success).toBe(true);
        const write = h.state.calls.find(c => c.table === 'make_product_sizes')!;
        expect(write.body.size_label).toBeNull();
        expect(write.body.length).toBe(1800);
        expect(write.body).not.toHaveProperty('image_url');
    });

    it('D. valid size_label + image: label persisted, image_url never sent to make_product_sizes', async () => {
        const res = await save({}, {
            type: 'size', size_label: 'King Bed', length: 2000, width: 1800, height: 1100, image_url: IMG
        });
        expect(res.success).toBe(true);
        const write = h.state.calls.find(c => c.table === 'make_product_sizes')!;
        expect(write.body.size_label).toBe('King Bed');
        expect(write.body).not.toHaveProperty('image_url');
    });

    it('D2. color with image keeps using the native make_product_colors.image_url column', async () => {
        const res = await save({}, { type: 'color', color_name: 'Walnut', color_code: '#3E2723', image_url: IMG });
        expect(res.success).toBe(true);
        const write = h.state.calls.find(c => c.table === 'make_product_colors')!;
        expect(write.body.image_url).toBe(IMG);
    });

    it('E. unauthorized user is rejected for spec-with-image, size and color; nothing is written', async () => {
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(unauthorized);
        const payloads = [
            { type: 'spec', spec_name: 'Teak Frame', image_url: IMG },
            { type: 'size', length: 100, image_url: IMG },
            { type: 'color', color_name: 'Walnut', image_url: IMG }
        ];
        for (const p of payloads) {
            const res = await save({}, p);
            expect(res.success).toBe(false);
            expect(res.error).toContain('manage_global_product_attributes');
        }
        expect(h.state.calls).toHaveLength(0);
        expect(h.state.cloudCalls).toHaveLength(0);
    });

    it('E2. no session at all is rejected', async () => {
        vi.spyOn(SessionManager, 'getSession').mockReturnValue(null as any);
        const res = await save({}, { type: 'spec', spec_name: 'Teak Frame', image_url: IMG });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/Unauthorized/);
        expect(h.state.calls).toHaveLength(0);
    });

    it('F. NAS write failure returns a clean failure and does not push anything to cloud', async () => {
        h.state.responder = () => ({ data: null, error: new Error('fetch failed: NAS unreachable') as any });
        const res = await save({}, { type: 'spec', spec_name: 'Teak Frame', image_url: IMG });
        expect(res.success).toBe(false);
        expect(res.error).toContain('NAS unreachable');
        expect(h.state.cloudCalls).toHaveLength(0);
    });

    it('F2. cloud mirror receives exactly the row that NAS returned (including image_url when migration 066 is active)', async () => {
        h.state.responder = (_t, _op, body) => ({ data: { id: 9, ...body }, error: null });
        const res = await save({}, { type: 'spec', spec_name: 'Teak Frame', image_url: IMG });
        expect(res.success).toBe(true);
        expect(h.state.cloudCalls).toHaveLength(1);
        expect(h.state.cloudCalls[0].row.image_url).toBe(IMG);
    });
});

describe('MakeCadService.uploadValidatedBuffer — Node crypto resolution', () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('does not throw "crypto.randomBytes is not a function" even when globalThis.crypto is WebCrypto', async () => {
        // Packaged Electron main exposes globalThis.crypto as WebCrypto (no randomBytes).
        expect(typeof (globalThis as any).crypto?.randomBytes).not.toBe('function');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: async () => ({ success: true, file_url: 'https://storage.lenas.me/files/x/y.png' })
        }));

        const res = await MakeCadService.uploadValidatedBuffer(png, 'spec.png', 'image/png', 'make-catalog');
        expect(res.success).toBe(true);
        expect(res.storagePath).toMatch(/^make-catalog\/\d+_[0-9a-f]{8}_spec\.png$/);
    });

    it('generates unique identifiers for consecutive uploads of the same file name', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: async () => ({ success: true, file_url: 'https://storage.lenas.me/files/x/y.png' })
        }));
        const paths = new Set<string>();
        for (let i = 0; i < 25; i++) {
            const r = await MakeCadService.uploadValidatedBuffer(png, 'same.png', 'image/png', 'make-catalog');
            paths.add(r.storagePath!);
        }
        expect(paths.size).toBe(25);
    });

    it('uses a cryptographically secure source (Node crypto.randomBytes), not Math.random', async () => {
        const nodeCrypto = await import('crypto');
        const spy = vi.spyOn(nodeCrypto.default, 'randomBytes');
        const mathSpy = vi.spyOn(Math, 'random');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: async () => ({ success: true, file_url: 'https://storage.lenas.me/files/x/y.png' })
        }));
        await MakeCadService.uploadValidatedBuffer(png, 'a.png', 'image/png', 'make-catalog');
        expect(spy).toHaveBeenCalledWith(4);
        expect(mathSpy).not.toHaveBeenCalled();
    });

    it('NAS storage failure falls back to cloud storage bucket', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('NAS storage unreachable')));
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        const res = await MakeCadService.uploadValidatedBuffer(png, 'b.png', 'image/png', 'make-catalog');
        expect(res.success).toBe(true);
        expect(res.publicUrl).toMatch(/^public\/make-catalog\/\d+_[0-9a-f]{8}_b\.png$/);
    });
});
