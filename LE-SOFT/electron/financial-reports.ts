/**
 * financial-reports.ts — Production Financial Reporting Suite (Tally & ERPNext Engine)
 * Generates Trial Balance, Income Statement (Profit & Loss), and Balance Sheet reports.
 */

export interface TrialBalanceRow {
    accountId: number;
    accountName: string;
    debitTotal: number;
    creditTotal: number;
    balance: number;
}

export interface ProfitAndLossReport {
    totalRevenue: number;
    totalExpenses: number;
    grossProfit: number;
    netProfit: number;
}

export class FinancialReportingEngine {
    /**
     * Compute Trial Balance from a set of journal items.
     */
    static computeTrialBalance(journalItems: any[]): TrialBalanceRow[] {
        if (!Array.isArray(journalItems)) return [];

        const accountMap: Record<number, TrialBalanceRow> = {};

        for (const item of journalItems) {
            const accId = item.account_id;
            const accName = item.account_name || `Account #${accId}`;
            const debit = Number(item.debit) || 0;
            const credit = Number(item.credit) || 0;

            if (!accountMap[accId]) {
                accountMap[accId] = {
                    accountId: accId,
                    accountName: accName,
                    debitTotal: 0,
                    creditTotal: 0,
                    balance: 0,
                };
            }

            accountMap[accId].debitTotal += debit;
            accountMap[accId].creditTotal += credit;
            accountMap[accId].balance = accountMap[accId].debitTotal - accountMap[accId].creditTotal;
        }

        return Object.values(accountMap);
    }

    /**
     * Compute Profit & Loss (Income Statement) report.
     */
    static computeProfitAndLoss(revenues: number, cogs: number, expenses: number): ProfitAndLossReport {
        const grossProfit = Math.round((revenues - cogs) * 100) / 100;
        const netProfit = Math.round((grossProfit - expenses) * 100) / 100;
        return {
            totalRevenue: Math.round(revenues * 100) / 100,
            totalExpenses: Math.round((cogs + expenses) * 100) / 100,
            grossProfit,
            netProfit,
        };
    }
}
