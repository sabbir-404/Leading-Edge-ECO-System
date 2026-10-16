import { beforeAll, vi } from 'vitest';

// Mock electron module for node/vitest environment
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockImplementation((name: string) => process.env.APPDATA || process.cwd()),
    isPackaged: false,
    getName: vi.fn().mockReturnValue('LE-SOFT'),
    getVersion: vi.fn().mockReturnValue('1.8.11'),
    setAppUserModelId: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  Notification: class {
    static isSupported = vi.fn().mockReturnValue(true);
    show = vi.fn();
    on = vi.fn();
    constructor(_options?: any) {}
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn().mockReturnValue({
      id: 1,
      webContents: { send: vi.fn() },
      isDestroyed: vi.fn().mockReturnValue(false),
      loadURL: vi.fn(),
    }),
    getAllWindows: vi.fn().mockReturnValue([
      {
        id: 1,
        webContents: { send: vi.fn() },
        isDestroyed: vi.fn().mockReturnValue(false),
        loadURL: vi.fn(),
      },
    ]),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}));

// In-memory mock for better-sqlite3 to run flawlessly in Vitest without ABI rebuild conflicts
vi.mock('better-sqlite3', async (importOriginal) => {
  if (process.env.TEST_REAL_SQLITE === 'true') {
    return importOriginal();
  }
  const globalTables = new Map<string, any[]>();

  class MockStatement {
    constructor(private sql: string) {}

    private getTargetTable(): string {
      const match = this.sql.match(/(?:from|into|update|delete\s+from)\s+([a-zA-Z0-9_]+)/i);
      return match ? match[1].toLowerCase() : 'default';
    }

    run(...args: any[]) {
      const table = this.getTargetTable();
      let rows = globalTables.get(table);
      if (!rows) {
        rows = [];
        globalTables.set(table, rows);
      }

      const lower = this.sql.trim().toLowerCase();
      if (lower.startsWith('insert')) {
        if (table === 'outbox_operations') {
          const existing = rows.find(r => r.id === args[0]);
          if (existing) {
            throw new Error('UNIQUE constraint failed: outbox_operations.id');
          }
          if (args.length >= 14) {
            rows.push({
              id: args[0],
              entity_type: args[1],
              operation: args[2],
              payload_json: args[3],
              filter_json: args[4],
              primary_key_col: args[5],
              primary_key_val: args[6],
              upsert_conflict: args[7],
              dependency_op_id: args[8],
              metadata_json: args[9],
              target: args[10],
              status: args[11],
              retry_count: 0,
              max_retries: args[12] || 10,
              last_error: null,
              created_at: args[13] || Date.now(),
              updated_at: args[14] || Date.now(),
            });
          } else {
            rows.push({
              id: args[0],
              entity_type: args[1],
              operation: args[2],
              payload_json: args[3],
              filter_json: null,
              primary_key_col: args[4],
              primary_key_val: args[5],
              upsert_conflict: null,
              dependency_op_id: args[6],
              metadata_json: null,
              target: args[7],
              status: args[8],
              retry_count: 0,
              max_retries: args[9] || 10,
              last_error: null,
              created_at: args[10] || Date.now(),
              updated_at: args[11] || Date.now(),
            });
          }
        } else if (table === 'durable_uploads') {
          rows.push({
            id: args[0],
            local_path: args[1],
            file_name: args[2],
            mime_type: args[3],
            size_bytes: args[4],
            sha256: args[5],
            subfolder: args[6],
            entity_type: args[7],
            entity_id: args[8],
            field_name: args[9],
            status: 'staged_local',
            remote_url_nas: null,
            remote_url_supabase: null,
            retry_count: 0,
            last_error: null,
            created_at: args[10] || Date.now(),
            updated_at: args[11] || Date.now(),
          });
        } else if (table === 'outbox_id_map') {
          const existing = rows.find(r => r.op_id === args[0] && r.target === args[1]);
          if (existing) {
            existing.resolved_id = args[2];
          } else {
            rows.push({ op_id: args[0], target: args[1], resolved_id: args[2], created_at: args[3] });
          }
        } else {
          rows.push({ id: args[0], args });
        }
      } else if (lower.startsWith('update')) {
        if (table === 'outbox_operations') {
          if (lower.includes("status = 'completed'")) {
            const id = args[1];
            const r = rows.find(x => x.id === id);
            if (r) { r.status = 'completed'; r.last_error = null; r.updated_at = args[0]; }
          } else if (lower.includes("status = 'pending'")) {
            for (const r of rows) {
              if (r.status === 'blocked_dependency') r.status = 'pending';
              if (r.status === 'dead_letter' && (!args[1] || r.id === args[1])) {
                r.status = 'pending';
                r.last_error = null;
              }
            }
          } else if (lower.includes("status = 'dead_letter'")) {
            const id = args[args.length - 1];
            const err = args[0];
            const r = rows.find(x => x.id === id);
            if (r) { r.status = 'dead_letter'; r.last_error = err; }
          } else if (lower.includes('status = ?')) {
            const status = args[0];
            const err = args[1] !== undefined ? args[1] : null;
            const id = args[3];
            const r = rows.find(x => x.id === id);
            if (r) { r.status = status; r.last_error = err; }
          }
        } else if (table === 'durable_uploads') {
          const id = args[args.length - 1];
          const r = rows.find(x => x.id === id);
          if (r) {
            if (lower.includes("status = 'synced_nas'")) {
              r.status = 'synced_nas';
              r.remote_url_nas = args[0];
              r.last_error = null;
            } else if (lower.includes("status = 'buffered_supabase'")) {
              r.status = 'buffered_supabase';
              if (lower.includes('remote_url_supabase = ?')) {
                r.remote_url_supabase = args[0];
                r.last_error = args[1] || null;
              } else {
                r.last_error = null;
              }
            } else if (lower.includes('remote_url_nas = ?')) {
              r.remote_url_nas = args[0];
              r.last_error = args[1];
            } else if (lower.includes('retry_count = ?')) {
              r.retry_count = args[0];
              r.last_error = args[1];
            }
          }
        }
      } else if (lower.startsWith('delete')) {
        const id = args[0];
        const idx = rows.findIndex(x => x.id === id);
        if (idx >= 0) rows.splice(idx, 1);
      }
      return { changes: 1 };
    }

    get(...args: any[]) {
      const table = this.getTargetTable();
      const rows = globalTables.get(table) || [];
      const lower = this.sql.toLowerCase();
      if (lower.includes('count(')) {
        return {
          pending_cnt: rows.filter(r => r.status === 'pending').length,
          buffered_cnt: rows.filter(r => r.status === 'buffered_supabase').length,
          blocked_cnt: rows.filter(r => r.status === 'blocked_dependency').length,
          dead_letter_cnt: rows.filter(r => r.status === 'dead_letter').length,
          oldest_pending: rows[0]?.created_at || null,
        };
      }
      if (table === 'outbox_id_map') {
        if (args.length >= 2) {
          return rows.find(r => r.op_id === args[0] && r.target === args[1]);
        }
        return rows.find(r => r.op_id === args[0]);
      }
      if (args.length > 0) {
        return rows.find(r => r.id === args[0] || r.op_id === args[0]);
      }
      return rows[0];
    }

    all(...args: any[]) {
      const table = this.getTargetTable();
      const rows = globalTables.get(table) || [];
      const lower = this.sql.toLowerCase();
      if (lower.includes("status in ('pending', 'buffered_supabase'")) {
        return rows.filter(r => r.status === 'pending' || r.status === 'buffered_supabase' || r.status === 'cleanup_pending');
      }
      if (lower.includes("status in ('staged_local', 'buffered_supabase')")) {
        return rows.filter(r => r.status === 'staged_local' || r.status === 'buffered_supabase');
      }
      if (lower.includes("status = 'dead_letter'")) {
        return rows.filter(r => r.status === 'dead_letter');
      }
      return [...rows];
    }
  }

  class MockDatabase {
    constructor(_path?: string) {}
    pragma(_cmd: string) {}
    exec(_sql: string) {}
    prepare(sql: string) {
      return new MockStatement(sql);
    }
    transaction(fn: any) {
      return (...args: any[]) => fn(...args);
    }
    close() {}
  }

  return { default: MockDatabase };
});

// Mock localStorage globally for node/vitest environment
if (typeof globalThis.localStorage === 'undefined') {
  let store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  } as any;
}

// Mock electron API globally for UI tests if window exists
beforeAll(() => {
  if (typeof window !== 'undefined') {
    (window as any).electron = {
      getProducts: vi.fn().mockResolvedValue([]),
      getBills: vi.fn().mockResolvedValue([]),
      getDashboardStats: vi.fn().mockResolvedValue({
        ledgerCount: 2,
        groupCount: 12,
        voucherCount: 0,
        totalTransactions: 0,
        stockItemCount: 1955,
        productCount: 1955,
        recentVouchers: [],
      }),
      getUsers: vi.fn().mockResolvedValue([]),
      getNotifications: vi.fn().mockResolvedValue([]),
      authenticateUser: vi.fn().mockResolvedValue({ success: true, user: { username: 'admin', role: 'admin' } }),
    };
  }
});
