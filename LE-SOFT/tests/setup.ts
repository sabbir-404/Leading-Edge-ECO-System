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
