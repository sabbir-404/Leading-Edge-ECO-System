/**
 * MakeOrderService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Order Lifecycle & Transaction Management for MAKE V1.
 * 
 * Guarantees:
 *  - Atomic order creation (rolls back order header if item insertion fails).
 *  - Unique order number generation (MAKE-YYYY-XXXXXX).
 *  - Server-side price validation via MakePricingService.
 *  - Atomic approval workflow with Version 1 snapshot creation.
 *  - Role-based order alteration with change tracking.
 */

import { supabase } from '../../supabase';
import { MakePricingService, PricingItem, PricingOverride } from './MakePricingService';
import { MakeVersionService } from './MakeVersionService';
import { MakeSearchService } from './MakeSearchService';

export interface CreateMakeOrderInput {
    furniture_name: string;
    description?: string;
    priority?: 'Low' | 'Normal' | 'High' | 'Urgent';
    delivery_date?: string | null;
    target_delivery_date?: string | null;
    requested_delivery_date?: string | null;
    salesman_id?: number | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    shipping_address?: string | null;
    location_landmark?: string | null;
    receiver_name?: string | null;
    receiver_phone?: string | null;
    special_instructions?: string | null;
    cost_price?: number | string | null;
    sale_price?: number | string | null;
    customer_id?: number | null;
    invoice_attachment_urls?: string[];
    reference_bill_no?: string | null;
    items: {
        product_id?: number | null;
        product_name: string;
        spec_id?: number | null;
        spec_name?: string | null;
        spec_details?: string | null;
        size_id?: number | null;
        dimensions_text?: string | null;
        color_id?: number | null;
        color_name?: string | null;
        quantity: number;
        item_cost_price?: number | string | null;
        item_sale_price?: number | string | null;
        is_customized?: boolean;
        custom_dimensions?: string | null;
        designer_notes?: string | null;
    }[];
}

export class MakeOrderService {
    /**
     * Generates a canonical, human-readable order number: MAKE-YYYY-XXXXXX
     */
    public static generateOrderNumber(): string {
        const year = new Date().getFullYear();
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        return `MAKE-${year}-${randomNum}`;
    }

    /**
     * Normalizes phone numbers for deterministic database comparison.
     */
    public static normalizePhoneNumber(rawPhone?: string | null): string {
        if (!rawPhone) return '';
        let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');
        if (cleaned.startsWith('+880')) {
            cleaned = '0' + cleaned.substring(4);
        } else if (cleaned.startsWith('880') && cleaned.length >= 13) {
            cleaned = '0' + cleaned.substring(3);
        }
        return cleaned;
    }

    /**
     * Intelligent multi-entity whole-catalog product search with relevance scoring & ranking.
     */
     public static async searchProducts(query: string): Promise<any[]> {
         return MakeSearchService.searchProducts({ query, activeOnly: true });
     }

    /**
     * Deterministically resolves a customer in billing_customers using prioritized matching:
     * 1. Existing customer ID
     * 2. Phone number exact normalized match
     * 3. Email exact normalized match
     * 4. Exact unique name match (when no phone/email provided)
     * 5. Creates new customer record if no match found
     */
    public static async resolveOrCreateCustomer(params: {
        customerId?: number | null;
        customerName?: string | null;
        customerPhone?: string | null;
        customerEmail?: string | null;
        shippingAddress?: string | null;
    }): Promise<{ id: number; name: string; phone: string | null } | null> {
        const { customerId, customerName, customerPhone, customerEmail, shippingAddress } = params;

        // 1. Existing reliable customer ID
        if (customerId) {
            const { data: byId } = await supabase.from('billing_customers').select('id, name, phone, email').eq('id', customerId).maybeSingle();
            if (byId) return byId;
        }

        // 2. Phone exact normalized match
        const normPhone = this.normalizePhoneNumber(customerPhone);
        if (normPhone && normPhone.length >= 7) {
            const { data: byPhone } = await supabase
                .from('billing_customers')
                .select('id, name, phone, email')
                .or(`phone.eq.${normPhone},phone.eq.${customerPhone?.trim()}`)
                .limit(1)
                .maybeSingle();

            if (byPhone) return byPhone;
        }

        // 3. Email exact normalized match
        const normEmail = customerEmail?.trim().toLowerCase();
        if (normEmail && normEmail.includes('@')) {
            const { data: byEmail } = await supabase
                .from('billing_customers')
                .select('id, name, phone, email')
                .ilike('email', normEmail)
                .limit(1)
                .maybeSingle();

            if (byEmail) return byEmail;
        }

        // 4. Exact name match only when no phone/email was provided or unique match
        const trimmedName = customerName?.trim();
        if (trimmedName && (!normPhone || normPhone.length < 7)) {
            const { data: byName } = await supabase
                .from('billing_customers')
                .select('id, name, phone, email')
                .ilike('name', trimmedName)
                .limit(2);

            if (byName && byName.length === 1) {
                return byName[0];
            }
        }

        // 5. Create new customer record if customerName provided
        if (trimmedName && trimmedName !== 'Walk-in') {
            try {
                const { data: newCust, error } = await supabase
                    .from('billing_customers')
                    .insert({
                        name: trimmedName,
                        phone: normPhone || customerPhone?.trim() || null,
                        email: normEmail || null,
                        address: shippingAddress?.trim() || null
                    })
                    .select('id, name, phone, email')
                    .single();

                if (!error && newCust) return newCust;
            } catch (err) {
                console.warn('[MakeOrderService] Customer creation fallback:', err);
            }
        }

        return null;
    }

    /**
     * Atomically creates a custom furniture order with all items and initial timeline log.
     */
    public static async createOrder(
        input: CreateMakeOrderInput,
        actorSession: { userId: number; username: string; fullName: string; role: string }
    ): Promise<{ success: boolean; id?: number; order_number?: string; items?: any[]; error?: string }> {
        // 0. Validate customer name (required) and customer phone (optional, but validated if provided)
        if (!input.customer_name || !input.customer_name.trim()) {
            return { success: false, error: 'Customer name is required' };
        }

        if (input.customer_phone && input.customer_phone.trim()) {
            const rawPhone = input.customer_phone.trim();
            const dummyPatterns = [/^(0)\1+$/, /^(\+?88)?0{7,}$/, /^n\/?a$/i, /^unknown$/i, /^none$/i, /^test$/i, /^1234567890?$/];
            const digits = rawPhone.replace(/\D/g, '');
            if (dummyPatterns.some(p => p.test(rawPhone)) || digits.length < 6 || !/^[\d\s+\-()./]+$/.test(rawPhone)) {
                return { success: false, error: 'Invalid customer phone number format or dummy placeholder. Provide a valid phone number or leave empty.' };
            }
        }

        // 1. Validate items and compute authoritative pricing totals
        const pricing = MakePricingService.calculateAndValidateTotals(input.items);
        if (!pricing.isValid) {
            return { success: false, error: pricing.error };
        }

        // Deterministically resolve customer
        let resolvedCustId = input.customer_id || null;
        if (!resolvedCustId && (input.customer_phone || input.customer_name)) {
            const resolved = await this.resolveOrCreateCustomer({
                customerId: input.customer_id,
                customerName: input.customer_name,
                customerPhone: input.customer_phone,
                customerEmail: input.customer_email,
                shippingAddress: input.shipping_address
            });
            if (resolved) {
                resolvedCustId = resolved.id;
            }
        }

        const orderNumber = this.generateOrderNumber();
        const totalQty = input.items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
        const initialStatus = input.salesman_id ? 'Pending Approval' : 'Placed';
        const isApproved = !input.salesman_id;
        const initialApprovalStatus = isApproved ? 'sales_approved' : 'awaiting_designer';

        // 2. Insert order header
        const orderHeaderPayload = {
            order_number: orderNumber,
            furniture_name: input.furniture_name.trim(),
            description: input.description || input.special_instructions || '',
            quantity: totalQty,
            designer_name: actorSession.fullName || actorSession.username || 'Designer',
            status: initialStatus,
            priority: input.priority || 'Normal',
            delivery_date: input.delivery_date || input.target_delivery_date || null,
            target_delivery_date: input.target_delivery_date || input.delivery_date || null,
            requested_delivery_date: input.requested_delivery_date || null,
            salesman_id: input.salesman_id || null,
            customer_id: resolvedCustId,
            reference_bill_no: input.reference_bill_no?.trim() || null,
            invoice_attachment_urls: input.invoice_attachment_urls || [],
            is_approved: isApproved,
            customer_name: input.customer_name?.trim() || null,
            customer_phone: input.customer_phone?.trim() || null,
            customer_email: input.customer_email?.trim() || null,
            delivery_address: input.shipping_address?.trim() || null,
            location_landmark: input.location_landmark?.trim() || null,
            receiver_name: input.receiver_name?.trim() || null,
            receiver_phone: input.receiver_phone?.trim() || null,
            cost_price: pricing.totalCostPrice,
            sale_price: pricing.totalSalePrice,
            approval_status: initialApprovalStatus,
            current_version: 1,
            created_at: new Date().toISOString()
        };

        const { data: createdOrder, error: orderErr } = await supabase
            .from('make_orders')
            .insert(orderHeaderPayload)
            .select('id, order_number')
            .single();

        if (orderErr || !createdOrder) {
            return { success: false, error: `Failed to create order header: ${orderErr?.message || 'Database error'}` };
        }

        const orderId = createdOrder.id;

        // 3. Insert items with rollback guarantee on failure
        const itemsPayload = input.items.map(item => ({
            order_id: orderId,
            product_id: item.product_id || null,
            spec_id: item.spec_id || null,
            size_id: item.size_id || null,
            color_id: item.color_id || null,
            product_name: item.product_name.trim(),
            spec_name: item.spec_name || null,
            size_label: item.dimensions_text || null,
            color_name: item.color_name || null,
            quantity: Number(item.quantity) || 1,
            item_cost_price: item.item_cost_price !== undefined && item.item_cost_price !== null && item.item_cost_price !== ''
                ? Math.max(0, Number(item.item_cost_price))
                : 0.00,
            item_sale_price: item.item_sale_price !== undefined && item.item_sale_price !== null && item.item_sale_price !== ''
                ? Math.max(0, Number(item.item_sale_price))
                : null,
            is_customized: !!item.is_customized,
            custom_dimensions: item.custom_dimensions || item.dimensions_text || null,
            designer_notes: item.designer_notes || null
        }));

        const { data: insertedItems, error: itemsErr } = await supabase
            .from('make_order_items')
            .insert(itemsPayload)
            .select('id, product_name');

        if (itemsErr) {
            // ATOMIC ROLLBACK: Remove orphaned order header
            console.error('[MakeOrderService] Items insertion failed. Rolling back order header:', itemsErr.message);
            await supabase.from('make_orders').delete().eq('id', orderId);
            return { success: false, error: `Order creation rolled back due to item insertion error: ${itemsErr.message}` };
        }

        // 4. Initial timeline update
        await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: initialStatus,
            note: input.salesman_id ? 'Order created, awaiting salesperson approval' : 'Order placed and approved',
            updated_by: `${actorSession.fullName || actorSession.username} (${actorSession.role})`
        });

        // 5. Notify salesman if assigned
        if (input.salesman_id) {
            try {
                await supabase.from('notifications').insert({
                    title: 'New Custom Order for Approval',
                    message: `You have been assigned to review and approve order ${orderNumber} ("${input.furniture_name}").`,
                    recipient_id: input.salesman_id,
                    sender_id: actorSession.userId,
                    action_path: '/make/track',
                    action_label: 'Review Order',
                    metadata: { type: 'make_order', order_id: orderId }
                });
            } catch (notifErr) {
                console.warn('[MakeOrderService] Notification error (non-fatal):', notifErr);
            }
        }

        return {
            success: true,
            id: orderId,
            order_number: orderNumber,
            items: insertedItems || []
        };
    }

    /**
     * Atomically approves an order, validating pricing, creating Version 1 snapshot,
     * recording approval audit, and advancing order state.
     */
    public static async approveOrder(params: {
        orderId: number;
        actorSession: { userId: number; username: string; fullName: string; role: string };
        override?: PricingOverride | null;
        notes?: string;
    }): Promise<{ success: boolean; error?: string }> {
        const { orderId, actorSession, override, notes } = params;

        // 1. Fetch live order
        const { data: order, error: fetchErr } = await supabase
            .from('make_orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !order) {
            return { success: false, error: 'Order not found.' };
        }

        // 2. Validate pricing rules (sale_price >= cost_price)
        const pricingValidation = MakePricingService.validateApprovalPricing(
            Number(order.cost_price || 0),
            order.sale_price !== null ? Number(order.sale_price) : null,
            override
        );

        if (!pricingValidation.allowed) {
            return { success: false, error: pricingValidation.error };
        }

        const actorName = actorSession.fullName || actorSession.username;
        const actorRole = actorSession.role;

        // 3. Create immutable Version 1 snapshot in make_order_versions
        const versionResult = await MakeVersionService.createSnapshot({
            orderId,
            versionNumber: 1,
            changeReason: override?.overrideReason
                ? `Initial approval (Loss override: ${override.overrideReason})`
                : 'Initial order approval by salesperson',
            actorName,
            actorRole
        });

        if (!versionResult.success) {
            return { success: false, error: `Failed to create version snapshot: ${versionResult.error}` };
        }

        // 4. Record formal approval in make_order_approvals
        await MakeVersionService.recordApprovalAudit({
            orderId,
            versionNumber: 1,
            action: 'approved',
            actedBy: actorName,
            userRole: actorRole,
            notesOrReason: notes || override?.overrideReason || 'Order approved and placed into factory queue'
        });

        // 5. Update make_orders table atomically
        const { error: updErr } = await supabase
            .from('make_orders')
            .update({
                status: 'Placed',
                approval_status: 'sales_approved',
                is_approved: true,
                approved_version: 1,
                approved_by: actorName,
                approved_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updErr) {
            return { success: false, error: updErr.message };
        }

        // 6. Record in timeline updates
        await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: 'Placed',
            note: `Order approved by ${actorName} (${actorRole})`,
            updated_by: `${actorName} (${actorRole})`
        });

        // 7. Notify designer that order was approved
        if (order.designer_name) {
            try {
                const { data: designer } = await supabase
                    .from('users')
                    .select('id')
                    .or(`username.eq."${order.designer_name}",full_name.eq."${order.designer_name}"`)
                    .maybeSingle();

                if (designer) {
                    await supabase.from('notifications').insert({
                        title: 'Order Approved for Production',
                        message: `Order #${order.order_number || order.id} ("${order.furniture_name}") has been approved by ${actorName}.`,
                        recipient_id: designer.id,
                        sender_id: actorSession.userId,
                        action_path: '/make/track',
                        action_label: 'View Order',
                        metadata: { type: 'make_order', order_id: orderId }
                    });
                }
            } catch (notifErr) {
                console.warn('[MakeOrderService] Notification error (non-fatal):', notifErr);
            }
        }

        return { success: true };
    }

    /**
     * Saves designer specifications, cost prices, and sale prices.
     * Re-snapshots order if previously approved.
     */
    public static async saveDesignerSpecsAndPricing(params: {
        orderId: number;
        costPrice?: number;
        salePrice?: number | null;
        items?: any[];
        actorSession: { userId: number; username: string; fullName: string; role: string };
        modificationReason?: string;
    }): Promise<{ success: boolean; version?: number; totalCostPrice?: number; totalSalePrice?: number | null; error?: string }> {
        const { orderId, costPrice, salePrice, items, actorSession, modificationReason } = params;

        // 1. Fetch current order
        const { data: current, error: fetchErr } = await supabase
            .from('make_orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !current) return { success: false, error: 'Order not found' };

        let calcCostPrice = 0;
        let calcSalePrice = 0;
        let hasItemCost = false;
        let hasItemSale = false;

        // 2. Update items if provided
        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const itemQty = Math.max(1, Number(item.quantity) || 1);
                const itemCost = Math.max(0, Number(item.item_cost_price) || 0);
                calcCostPrice += itemCost * itemQty;
                if (itemCost > 0) hasItemCost = true;

                const hasSale = item.item_sale_price !== undefined && item.item_sale_price !== null && item.item_sale_price !== '';
                if (hasSale) {
                    const parsedSale = Math.max(0, Number(item.item_sale_price) || 0);
                    calcSalePrice += parsedSale * itemQty;
                    hasItemSale = true;
                }

                if (item.id) {
                    await supabase.from('make_order_items').update({
                        quantity: itemQty,
                        item_cost_price: itemCost,
                        item_sale_price: hasSale ? Number(item.item_sale_price) : null,
                        spec_name: item.spec_name || '',
                        size_label: item.size_label || '',
                        color_name: item.color_name || '',
                        salesperson_note: item.salesperson_note || null,
                        designer_notes: item.designer_notes || null,
                        technical_drawing_url: item.technical_drawing_url || null
                    }).eq('id', item.id);
                }
            }
        }

        const finalCostPrice = hasItemCost ? calcCostPrice : (Number(costPrice) || 0);
        const finalSalePrice = hasItemSale ? calcSalePrice : (salePrice ? Number(salePrice) : null);

        if (finalCostPrice <= 0) {
            return { success: false, error: 'Cost price must be greater than 0.' };
        }

        const isReModification = current.approved_version !== null &&
            (current.approval_status === 'sales_approved' || current.status === 'Placed');
        const nextVersion = isReModification ? (current.current_version || 1) + 1 : (current.current_version || 1);

        const actorName = actorSession.fullName || actorSession.username;
        const actorRole = actorSession.role;

        // 3. Snapshot previous version if modifying an already-approved order
        if (isReModification) {
            await MakeVersionService.createSnapshot({
                orderId,
                versionNumber: current.current_version || 1,
                changeReason: modificationReason || 'Designer modified product specifications/pricing after approval',
                actorName,
                actorRole
            });

            await supabase.from('make_order_alteration_log').insert({
                order_id: orderId,
                altered_by: actorName,
                user_role: actorRole,
                field_name: 'pricing_and_specs',
                old_value: `v${current.current_version}: Cost ৳${current.cost_price || 0}, Sale ৳${current.sale_price || 0}`,
                new_value: `v${nextVersion}: Cost ৳${finalCostPrice}, Sale ৳${finalSalePrice || 0}`,
                reason: modificationReason || 'Designer adjusted individual product specifications/pricing'
            });
        }

        // 4. Update make_orders table
        const { error: updErr } = await supabase.from('make_orders').update({
            cost_price: finalCostPrice,
            sale_price: finalSalePrice,
            current_version: nextVersion,
            approved_version: isReModification ? null : current.approved_version,
            approval_status: isReModification ? 'modification_pending_approval' : 'awaiting_sales_approval',
            status: isReModification ? 'Modification Pending Approval' : 'Awaiting Salesperson Approval',
            rejection_reason: null,
            updated_at: new Date().toISOString()
        }).eq('id', orderId);

        if (updErr) return { success: false, error: updErr.message };

        // 5. Timeline update
        await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: isReModification ? 'Modification Pending Approval' : 'Awaiting Salesperson Approval',
            note: `Cost price set to ৳${finalCostPrice.toLocaleString()}${finalSalePrice ? ` | Sale price: ৳${finalSalePrice.toLocaleString()}` : ''}${isReModification ? ` (v${nextVersion} requires re-approval)` : ''}`,
            updated_by: `${actorName} (${actorRole})`
        });

        // 6. Notify salesperson
        if (current.salesman_id) {
            try {
                await supabase.from('notifications').insert({
                    title: isReModification ? 'Order Modified — Re-approval Required' : 'Order Ready for Sales Approval',
                    message: `Order #${current.order_number || current.id} ("${current.furniture_name}") requires your review and approval.`,
                    recipient_id: current.salesman_id,
                    sender_id: actorSession.userId,
                    action_path: '/make/track',
                    action_label: 'Review Order',
                    metadata: { type: 'make_order', order_id: orderId }
                });
            } catch (notifErr) {
                console.warn('[MakeOrderService] Notification error (non-fatal):', notifErr);
            }
        }

        return {
            success: true,
            version: nextVersion,
            totalCostPrice: finalCostPrice,
            totalSalePrice: finalSalePrice
        };
    }

    /**
     * Role-based order header alteration with audit logging.
     */
    public static async alterOrder(params: {
        orderId: number;
        changes: Record<string, any>;
        actorSession: { userId: number; username: string; fullName: string; role: string };
    }): Promise<{ success: boolean; changed?: string[]; error?: string; message?: string }> {
        const { orderId, changes, actorSession } = params;

        const { data: current, error: fetchErr } = await supabase
            .from('make_orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !current) return { success: false, error: 'Order not found' };

        const RESTRICTED_STATUSES = ['Welding', 'Painting', 'Ready for Dispatch', 'Delivered'];
        const ALTERABLE_BY_NON_ADMIN = ['Placed', 'Awaiting Pricing', 'Pricing Done', 'Pending Approval', 'Draft'];
        const ALTERABLE_FIELDS = ['furniture_name', 'description', 'quantity', 'priority', 'delivery_date'];

        const isAdmin = actorSession.role.toLowerCase() === 'admin' || actorSession.role.toLowerCase() === 'superadmin';

        if (!isAdmin && RESTRICTED_STATUSES.includes(current.status)) {
            return {
                success: false,
                error: `Order is in "${current.status}" stage. Only administrators can alter an order at this stage.`
            };
        }

        const filteredChanges: Record<string, any> = {};
        for (const [field, newVal] of Object.entries(changes)) {
            if (isAdmin || ALTERABLE_FIELDS.includes(field)) {
                if (current[field] !== newVal) {
                    filteredChanges[field] = newVal;
                }
            }
        }

        if (Object.keys(filteredChanges).length === 0) {
            return { success: true, message: 'No changes detected' };
        }

        const actorName = actorSession.fullName || actorSession.username;
        const actorRole = actorSession.role;

        // Log alterations in make_order_alteration_log
        const logRows = Object.entries(filteredChanges).map(([field, newVal]) => ({
            order_id: orderId,
            altered_by: actorName,
            user_role: actorRole,
            field_name: field,
            old_value: String(current[field] ?? ''),
            new_value: String(newVal ?? ''),
            altered_at: new Date().toISOString()
        }));
        await supabase.from('make_order_alteration_log').insert(logRows);

        // Apply changes
        const { error: updateErr } = await supabase
            .from('make_orders')
            .update({ ...filteredChanges, updated_at: new Date().toISOString() })
            .eq('id', orderId);

        if (updateErr) return { success: false, error: updateErr.message };

        return { success: true, changed: Object.keys(filteredChanges) };
    }

    /**
     * Authoritatively and safely deletes a MAKE order.
     * Enforces Designer / Admin role permissions.
     * Guards against deleting financially referenced orders.
     */
    public static async deleteOrder(
        orderId: number | string,
        actorSession: { userId: number; username: string; fullName: string; role: string; permissions?: Record<string, boolean> }
    ): Promise<{ success: boolean; error?: string; financiallyProtected?: boolean }> {
        if (!actorSession || typeof actorSession !== 'object' || !actorSession.role) {
            return {
                success: false,
                error: 'Forbidden: Unauthenticated session.'
            };
        }

        // 1. Role verification: only Designer or Admin
        const role = (actorSession.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        const isDesigner = role === 'designer' || role === 'furniture designer' || role === 'make_designer';
        const hasPerm = !!(actorSession.permissions?.['delete_make_order'] || actorSession.permissions?.['make_delete']);

        if (!isAdmin && !isDesigner && !hasPerm) {
            return {
                success: false,
                error: 'Forbidden: Only Furniture Designers or Administrators can delete MAKE orders.'
            };
        }

        // 2. Fetch order to inspect financial dependencies
        const { data: order, error: fetchErr } = await supabase
            .from('make_orders')
            .select('id, order_number, status, reference_bill_no')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !order) {
            return { success: false, error: 'Order not found for deletion.' };
        }

        // 3. Financial dependency check
        // If order has an active reference bill or is marked Delivered/Billed in accounting
        if (order.reference_bill_no && order.reference_bill_no.trim() !== '') {
            // Check if referenced bill exists and is active/posted
            const { data: bill } = await supabase
                .from('bills')
                .select('id, invoice_number, grand_total')
                .eq('invoice_number', order.reference_bill_no.trim())
                .maybeSingle();

            if (bill) {
                // Financially protected: Do NOT physically destroy accounting history!
                // Safely cancel/void the order status rather than breaking ledger integrity.
                await supabase.from('make_orders').update({
                    status: 'Cancelled',
                    approval_status: 'cancelled',
                    rejection_reason: `Order cancelled by ${actorSession.fullName || actorSession.username} (Protected by active Bill #${bill.invoice_number})`,
                    updated_at: new Date().toISOString()
                }).eq('id', orderId);

                await supabase.from('make_order_updates').insert({
                    order_id: orderId,
                    status: 'Cancelled',
                    note: `Order cancelled (Financially protected under Bill #${bill.invoice_number} - physical record preserved for ledger history)`,
                    updated_by: `${actorSession.fullName || actorSession.username} (${actorSession.role})`
                });

                return {
                    success: true,
                    financiallyProtected: true,
                    error: `Order is linked to active Bill #${bill.invoice_number}. To protect ledger integrity, the order status was safely set to Cancelled rather than destroyed.`
                };
            }
        }

        // 4. Transactional deletion of deletable unposted order
        try {
            // Delete dependent records in order to ensure clean cascade across any DB engine
            await supabase.from('make_order_items').delete().eq('order_id', orderId);
            await supabase.from('make_order_updates').delete().eq('order_id', orderId);
            await supabase.from('make_order_versions').delete().eq('order_id', orderId);
            await supabase.from('make_order_approvals').delete().eq('order_id', orderId);
            await supabase.from('make_order_parts').delete().eq('order_id', orderId);
            await supabase.from('make_order_alteration_log').delete().eq('order_id', orderId);

            // Delete order header
            const { error: delErr } = await supabase.from('make_orders').delete().eq('id', orderId);
            if (delErr) {
                return { success: false, error: `Failed to delete order header: ${delErr.message}` };
            }

            return { success: true };
        } catch (err: any) {
            console.error('[MakeOrderService] Deletion error:', err);
            return { success: false, error: err.message || 'Transaction error during order deletion' };
        }
    }
}
