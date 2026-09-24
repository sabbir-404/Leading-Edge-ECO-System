import { beforeAll, vi } from 'vitest';

// Mock electron module for node/vitest environment
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(process.env.APPDATA || process.cwd()),
    isPackaged: false,
    getName: vi.fn().mockReturnValue('LE-SOFT'),
    getVersion: vi.fn().mockReturnValue('1.8.0'),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn().mockReturnValue({
      id: 1,
      webContents: { send: vi.fn() },
    }),
    getAllWindows: vi.fn().mockReturnValue([
      { id: 1, webContents: { send: vi.fn() } },
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
