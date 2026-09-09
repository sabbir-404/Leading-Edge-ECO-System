import { beforeAll, vi } from 'vitest';

// Mock electron API globally for UI tests
beforeAll(() => {
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
});
