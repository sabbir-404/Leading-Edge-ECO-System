/**
 * workflowEngine.ts — Odoo-Style State Machine & Audit Chatter Engine
 * Handles valid status transitions and logs chatter events for Bills, Quotations, and MAKE Orders.
 */

export type DocumentType = 'Bill' | 'Quotation' | 'MakeOrder' | 'Requisition';

export interface TransitionRules {
    [currentState: string]: string[];
}

export const WORKFLOW_TRANSITIONS: Record<DocumentType, TransitionRules> = {
    Quotation: {
        Draft: ['Sent', 'Cancelled'],
        Sent: ['Accepted', 'Rejected', 'Cancelled'],
        Accepted: ['Converted to Bill'],
        Rejected: ['Draft'],
        'Converted to Bill': [],
        Cancelled: ['Draft'],
    },
    MakeOrder: {
        Placed: ['Pricing Approved', 'Cancelled'],
        'Pricing Approved': ['In Production', 'Cancelled'],
        'In Production': ['Ready for Inspection'],
        'Ready for Inspection': ['Quality Approved', 'Rework Required'],
        'Rework Required': ['In Production'],
        'Quality Approved': ['Delivered'],
        Delivered: [],
        Cancelled: [],
    },
    Bill: {
        Pending: ['Paid', 'Partially Paid', 'Cancelled'],
        'Partially Paid': ['Paid', 'Cancelled'],
        Paid: ['Altered/Returned'],
        'Altered/Returned': [],
        Cancelled: [],
    },
    Requisition: {
        Draft: ['Submitted', 'Cancelled'],
        Submitted: ['Audit Approved', 'Rejected'],
        'Audit Approved': ['Director Approved', 'Rejected'],
        'Director Approved': ['Ordered'],
        Ordered: ['Received'],
        Received: [],
        Rejected: ['Draft'],
        Cancelled: [],
    },
};

export function isValidTransition(docType: DocumentType, fromState: string, toState: string): boolean {
    const rules = WORKFLOW_TRANSITIONS[docType];
    if (!rules) return false;
    const allowedNext = rules[fromState] || [];
    return allowedNext.includes(toState);
}

export async function logDocumentChatter(
    docType: DocumentType,
    docId: string,
    action: string,
    fromState?: string,
    toState?: string,
    notes?: string
) {
    const el = (window as any).electron;
    if (el?.logDocumentChatter) {
        try {
            await el.logDocumentChatter({
                docType,
                docId,
                action,
                fromState,
                toState,
                notes,
                createdBy: localStorage.getItem('user_name') || 'Admin',
            });
        } catch (err) {
            console.error('[WorkflowEngine] Chatter log failed:', err);
        }
    }
}
