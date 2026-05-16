export type PrintPageSize = 'A4' | 'A5';

export const PRINT_PAGE_SIZE_OPTIONS: Array<{ key: string; label: string }> = [
    { key: 'billing_bill', label: 'Billing / POS Bill' },
    { key: 'bill_history', label: 'Bill History Reprint' },
    { key: 'quotation', label: 'Quotation' },
    { key: 'purchase_requisition', label: 'Purchase Requisition' },
    { key: 'shipping_label', label: 'Shipping Label' },
    { key: 'website_shipping_label', label: 'Website Order Label' },
];

export const PRINT_PAGE_SIZE_STORAGE_PREFIX = 'print_page_size_';

export const getPrintPageSizeKey = (key: string) => `${PRINT_PAGE_SIZE_STORAGE_PREFIX}${key}`;

export const getPrintPageSize = (key: string): PrintPageSize => {
    const value = localStorage.getItem(getPrintPageSizeKey(key));
    return value === 'A5' ? 'A5' : 'A4';
};

