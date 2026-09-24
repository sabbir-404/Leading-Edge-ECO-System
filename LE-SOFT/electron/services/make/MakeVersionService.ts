/**
 * MakeVersionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Immutable Order Versioning & Approval Audit Service for MAKE V1.
 * 
 * Guarantees:
 *  - Version 1 is created automatically upon salesperson/admin order approval.
 *  - Each subsequent approved alteration creates Version N+1 with deep JSONB snapshot.
 *  - Inserts audit trails into make_order_approvals and make_order_versions.
 *  - Historical versions are immutable.
 */

import { supabase } from '../../supabase';

export interface OrderSnapshot {
    order: any;
    items: any[];
    timestamp: string;
}

export class MakeVersionService {
    /**
     * Creates an immutable snapshot of an order in make_order_versions.
     */
    public static async createSnapshot(params: {
        orderId: number;
        versionNumber: number;
        changeReason: string;
        actorName: string;
        actorRole: string;
    }): Promise<{ success: boolean; versionNumber: number; error?: string }> {
        const { orderId, versionNumber, changeReason, actorName, actorRole } = params;

        // 1. Fetch live order header
        const { data: order, error: orderErr } = await supabase
            .from('make_orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (orderErr || !order) {
            return { success: false, versionNumber, error: 'Order not found for snapshot generation.' };
        }

        // 2. Fetch all live order items
        const { data: items, error: itemsErr } = await supabase
            .from('make_order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('id', { ascending: true });

        if (itemsErr) {
            return { success: false, versionNumber, error: `Failed to fetch order items for snapshot: ${itemsErr.message}` };
        }

        const snapshot: OrderSnapshot = {
            order: { ...order },
            items: items || [],
            timestamp: new Date().toISOString()
        };

        // 3. Insert immutable version record
        const { error: insErr } = await supabase
            .from('make_order_versions')
            .insert({
                order_id: orderId,
                version_number: versionNumber,
                snapshot: snapshot,
                created_by: actorName,
                user_role: actorRole || 'Salesperson',
                change_reason: changeReason || 'Order approved/modified snapshot'
            });

        if (insErr) {
            console.error('[MakeVersionService] Error inserting version snapshot:', insErr);
            return { success: false, versionNumber, error: insErr.message };
        }

        return { success: true, versionNumber };
    }

    /**
     * Records a formal approval or rejection in make_order_approvals.
     */
    public static async recordApprovalAudit(params: {
        orderId: number;
        versionNumber: number;
        action: 'approved' | 'rejected';
        actedBy: string;
        userRole: string;
        notesOrReason?: string | null;
    }): Promise<{ success: boolean; error?: string }> {
        const { orderId, versionNumber, action, actedBy, userRole, notesOrReason } = params;

        const { error } = await supabase
            .from('make_order_approvals')
            .insert({
                order_id: orderId,
                version_number: versionNumber,
                action: action,
                acted_by: actedBy,
                user_role: userRole,
                notes_or_reason: notesOrReason || (action === 'approved' ? 'Order approved by salesperson' : 'Order rejected'),
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('[MakeVersionService] Error recording approval audit:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    }

    /**
     * Retrieves all version history snapshots for an order.
     */
    public static async getOrderVersions(orderId: number): Promise<any[]> {
        const { data, error } = await supabase
            .from('make_order_versions')
            .select('*')
            .eq('order_id', orderId)
            .order('version_number', { ascending: false });

        if (error) {
            console.error('[MakeVersionService] Failed to retrieve versions:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Deep diff utility for comparing two order versions.
     */
    public static async getVersionDiff(orderId: number, fromVersion: number, toVersion: number): Promise<{ from: any; to: any; fieldChanges: any[]; itemChanges: any[] }> {
        const { data: vList } = await supabase
            .from('make_order_versions')
            .select('*')
            .eq('order_id', orderId)
            .in('version_number', [fromVersion, toVersion]);

        const fromSnap = vList?.find(v => v.version_number === fromVersion)?.snapshot || null;
        let toSnap = vList?.find(v => v.version_number === toVersion)?.snapshot || null;

        // If toVersion matches live order state
        if (!toSnap) {
            const { data: curOrder } = await supabase.from('make_orders').select('*').eq('id', orderId).single();
            const { data: curItems } = await supabase.from('make_order_items').select('*').eq('order_id', orderId);
            toSnap = { order: curOrder, items: curItems || [], timestamp: new Date().toISOString() };
        }

        const fieldChanges: Array<{ field: string; old_value: any; new_value: any }> = [];
        const itemChanges: Array<{ item_name: string; old_details: string; new_details: string }> = [];

        if (fromSnap?.order && toSnap?.order) {
            const trackedFields = ['furniture_name', 'description', 'quantity', 'priority', 'status', 'cost_price', 'sale_price', 'target_delivery_date', 'customer_name', 'customer_phone', 'shipping_address'];
            for (const f of trackedFields) {
                const oldVal = fromSnap.order[f];
                const newVal = toSnap.order[f];
                if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
                    fieldChanges.push({ field: f, old_value: oldVal, new_value: newVal });
                }
            }
        }

        const fromItems: any[] = fromSnap?.items || [];
        const toItems: any[] = toSnap?.items || [];
        const maxLen = Math.max(fromItems.length, toItems.length);
        for (let i = 0; i < maxLen; i++) {
            const fi = fromItems[i];
            const ti = toItems[i];
            const itemName = ti?.product_name || fi?.product_name || `Item #${i + 1}`;
            const oldDetails = fi ? `Qty: ${fi.quantity || 1}, Spec: ${fi.spec_name || '—'}, Size: ${fi.dimensions_text || '—'}, Color: ${fi.color_name || '—'}` : 'Not present';
            const newDetails = ti ? `Qty: ${ti.quantity || 1}, Spec: ${ti.spec_name || '—'}, Size: ${ti.dimensions_text || '—'}, Color: ${ti.color_name || '—'}` : 'Removed';
            if (oldDetails !== newDetails) {
                itemChanges.push({ item_name: itemName, old_details: oldDetails, new_details: newDetails });
            }
        }

        return { from: fromSnap, to: toSnap, fieldChanges, itemChanges };
    }
}
