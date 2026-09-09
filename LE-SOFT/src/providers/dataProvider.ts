/**
 * dataProvider.ts — Unified Refine/Directus-Style Data Access Layer
 * Provides a clean interface for UI components to query and mutate data,
 * handling Electron IPC calls and local offline fallbacks automatically.
 */

export interface GetListParams {
    resource: string;
    pagination?: { page: number; pageSize: number };
    filters?: Record<string, any>;
    sort?: { field: string; order: 'asc' | 'desc' };
}

export interface DataResponse<T = any> {
    data: T[];
    total: number;
}

export const dataProvider = {
    async getList<T = any>({ resource, pagination: _pagination, filters, sort }: GetListParams): Promise<DataResponse<T>> {
        const el = (window as any).electron;
        if (!el) return { data: [], total: 0 };

        try {
            switch (resource) {
                case 'products': {
                    const data = await el.getProducts?.();
                    let list = Array.isArray(data) ? data : [];
                    if (filters?.search) {
                        const q = filters.search.toLowerCase();
                        list = list.filter((item: any) =>
                            (item.name || '').toLowerCase().includes(q) ||
                            (item.sku || '').toLowerCase().includes(q) ||
                            (item.category || '').toLowerCase().includes(q)
                        );
                    }
                    if (sort) {
                        list.sort((a: any, b: any) => {
                            const valA = a[sort.field] ?? '';
                            const valB = b[sort.field] ?? '';
                            if (valA < valB) return sort.order === 'asc' ? -1 : 1;
                            if (valA > valB) return sort.order === 'asc' ? 1 : -1;
                            return 0;
                        });
                    }
                    return { data: list, total: list.length };
                }
                case 'bills': {
                    const ctx = {
                        callerUsername: localStorage.getItem('user_name') || 'Admin',
                        isSuperadmin: (localStorage.getItem('user_role') || '').toLowerCase() === 'superadmin',
                        canSeeAllBills: true,
                        canSeeAllCustomers: true,
                        canViewCustomerContact: true,
                        canViewCustomerFinancials: true
                    };
                    const data = await el.getBills?.(ctx);
                    return { data: Array.isArray(data) ? data : [], total: data?.length || 0 };
                }
                case 'customers': {
                    const q = filters?.search || '';
                    const data = await el.searchBillingCustomers?.(q);
                    return { data: Array.isArray(data) ? data : [], total: data?.length || 0 };
                }
                default:
                    return { data: [], total: 0 };
            }
        } catch (err) {
            console.error(`[DataProvider] getList failed for ${resource}:`, err);
            return { data: [], total: 0 };
        }
    },

    async getOne<T = any>(resource: string, id: number | string): Promise<T | null> {
        const el = (window as any).electron;
        if (!el) return null;
        try {
            if (resource === 'products') return await el.getProduct?.(id);
            if (resource === 'bills') return await el.getBillDetails?.(id);
            return null;
        } catch {
            return null;
        }
    },

    async create<T = any>(resource: string, payload: any): Promise<T> {
        const el = (window as any).electron;
        if (!el) throw new Error('Electron API unavailable');

        switch (resource) {
            case 'bills':
                return await el.createBill?.(payload);
            case 'customers':
                return await el.createBillingCustomer?.(payload);
            case 'products':
                return await el.createProduct?.(payload);
            default:
                throw new Error(`Unsupported resource creation: ${resource}`);
        }
    }
};
