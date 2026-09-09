/**
 * accounting-engine.ts — Automatic Accounting Posting Engine (Tally & ERPNext Engine)
 * Automatically parses transactions (Sales Bills, Purchase Invoices, Payments, Receipts)
 * and generates balanced double-entry Journal Entries & Journal Items.
 */

export interface PostingItem {
    accountId: number;
    accountName: string;
    debit: number;
    credit: number;
    partyId?: number;
    description?: string;
}

export interface JournalPayload {
    entryNumber: string;
    postingDate?: string;
    referenceNo?: string;
    voucherType: string;
    items: PostingItem[];
    notes?: string;
    createdBy?: string;
}

export class AutomaticPostingEngine {
    /**
     * Validate that total debits equal total credits (Double-Entry Balanced Rule)
     */
    static validateBalance(items: PostingItem[]): { isBalanced: boolean; totalDebit: number; totalCredit: number } {
        const totalDebit = items.reduce((sum, item) => sum + (Number(item.debit) || 0), 0);
        const totalCredit = items.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
        return {
            isBalanced,
            totalDebit: Math.round(totalDebit * 100) / 100,
            totalCredit: Math.round(totalCredit * 100) / 100,
        };
    }

    /**
     * Generate double-entry posting items for a Sales Invoice.
     * Debit: Accounts Receivable (Customer) = grandTotal
     * Credit: Sales Revenue = subtotal
     * Credit: Sales Tax (VAT) = taxAmount
     */
    static buildSalesPosting(bill: any, customerAccountId: number, salesAccountId: number, taxAccountId?: number): JournalPayload {
        const grandTotal = Number(bill.grand_total) || 0;
        const subtotal = Number(bill.subtotal) || grandTotal;
        const taxAmount = Number(bill.vat_amount || bill.tax_amount) || 0;

        const items: PostingItem[] = [
            {
                accountId: customerAccountId,
                accountName: bill.customer_name || 'Customer Receivable',
                debit: grandTotal,
                credit: 0,
                partyId: bill.customer_id,
                description: `Invoice #${bill.invoice_number}`,
            },
            {
                accountId: salesAccountId,
                accountName: 'Sales Revenue',
                debit: 0,
                credit: subtotal > 0 ? subtotal : grandTotal,
                description: `Sales revenue for Invoice #${bill.invoice_number}`,
            },
        ];

        if (taxAmount > 0 && taxAccountId) {
            items.push({
                accountId: taxAccountId,
                accountName: 'Sales Tax Payable',
                debit: 0,
                credit: taxAmount,
                description: `VAT/Tax for Invoice #${bill.invoice_number}`,
            });
        }

        return {
            entryNumber: `JE-SALES-${bill.invoice_number || Date.now()}`,
            referenceNo: bill.invoice_number,
            voucherType: 'Sales Invoice',
            items,
            notes: `Auto-posted sales invoice #${bill.invoice_number}`,
            createdBy: bill.billed_by || 'System',
        };
    }
}
