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
import { SessionManager, UserSession } from '../../session-manager';
import { DurableUploadService } from '../media/DurableUploadService';

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
    discount_type?: 'percent' | 'amount' | null;
    discount_value?: number | string | null;
    discount_amount?: number | string | null;
    final_price?: number | string | null;
    money_received?: number | string | null;
    amount_due?: number | string | null;
    payment_status?: 'unpaid' | 'partial' | 'paid' | string | null;
    production_hold?: boolean;
    hold_reason?: string | null;
    admin_approval_status?: string | null;
    customer_id?: number | null;
    invoice_attachment_urls?: string[];
    invoice_attachments?: string[];
    reference_bill_no?: string | null;
    items: {
        product_id?: number | null;
        product_name: string;
        spec_id?: number | null;
        spec_name?: string | null;
        spec_details?: string | null;
        size_id?: number | null;
        dimensions_text?: string | null;
        custom_size?: string | null;
        color_id?: number | null;
        color_name?: string | null;
        custom_color?: string | null;
        quantity: number;
        item_cost_price?: number | string | null;
        item_sale_price?: number | string | null;
        discount_type?: 'percent' | 'amount' | null;
        discount_value?: number | string | null;
        discount_amount?: number | string | null;
        final_item_price?: number | string | null;
        max_discount_type?: 'percent' | 'amount' | null;
        max_discount_value?: number | string | null;
        is_customized?: boolean;
        is_custom?: boolean;
        custom_dimensions?: string | null;
        designer_notes?: string | null;
        custom_notes?: string | null;
        technical_drawing_url?: string | null;
        pdf_urls?: string[];
        drawings?: string[];
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
     * Generates a guaranteed unique order number: MAKE-YYYY-XXXXXX
     * Checks database for duplicates to protect against concurrent collisions.
     */
    public static async generateUniqueOrderNumber(): Promise<string> {
        const year = new Date().getFullYear();
        for (let attempt = 0; attempt < 10; attempt++) {
            const randomNum = Math.floor(100000 + Math.random() * 900000);
            const candidate = `MAKE-${year}-${randomNum}`;
            try {
                const query: any = supabase.from('make_orders').select('id');
                if (query && typeof query.eq === 'function') {
                    const eqQuery = query.eq('order_number', candidate);
                    const data = typeof eqQuery?.maybeSingle === 'function'
                        ? (await eqQuery.maybeSingle())?.data
                        : (await eqQuery)?.data;
                    if (!data) return candidate;
                } else {
                    return candidate;
                }
            } catch {
                return candidate;
            }
        }
        const ts = Date.now().toString().slice(-6);
        return `MAKE-${year}-${ts}`;
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
     * Normalizes attachment references to durable keys (e.g. make-order-files/...) or confirmed TrueNAS URLs.
     * Strips ephemeral signed tokens so order records remain permanently valid.
     */
    public static normalizeAttachmentReference(rawRef?: string | null): string {
        if (!rawRef || typeof rawRef !== 'string') return '';
        const trimmed = rawRef.trim();
        if (!trimmed) return '';

        // If it's a Supabase signed URL or public URL for make-order-files
        const sbMatch = trimmed.match(/(?:supabase\.co|\/storage\/v1)\/object\/(?:sign|public)\/make-order-files\/([^?#]+)/i);
        if (sbMatch) {
            const rawKey = decodeURIComponent(sbMatch[1]).replace(/^\/+/, '');
            return `make-order-files/${rawKey}`;
        }

        // If it's a supabase:// URI
        if (/^supabase:\/\/make-order-files\//i.test(trimmed)) {
            const rawKey = trimmed.replace(/^supabase:\/\/make-order-files\//i, '').split('?')[0].replace(/^\/+/, '');
            return `make-order-files/${rawKey}`;
        }

        // If it's already a durable key: make-order-files/...
        if (/^make-order-files\//i.test(trimmed)) {
            return trimmed.split('?')[0];
        }

        // Confirmed TrueNAS URLs are kept intact
        if (/^https?:\/\/(storage\.lenas\.me|100\.88\.85\.6|192\.168\.1\.14)/i.test(trimmed)) {
            return trimmed;
        }

        // If another HTTP URL with token= parameter is detected, strip query params
        if (/^https?:\/\//i.test(trimmed)) {
            if (trimmed.includes('token=')) {
                return trimmed.split('?')[0];
            }
            return trimmed;
        }

        return trimmed;
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
    ): Promise<{ success: boolean; id?: number; order_number?: string; items?: any[]; unassociatedUploads?: any[]; error?: string }> {
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

        // Pre-fetch product catalog pricing & discount limits if items have product_id
        const productIds = (input.items || []).map(it => it.product_id).filter(Boolean) as number[];
        let productsMap: Record<number, any> = {};
        if (productIds.length > 0) {
            try {
                const { data: dbProds } = await supabase
                    .from('make_products')
                    .select('id, cost_price, sale_price, max_discount_type, max_discount_value')
                    .in('id', productIds);
                if (dbProds && dbProds.length > 0) {
                    productsMap = Object.fromEntries(dbProds.map((p: any) => [p.id, p]));
                }
            } catch (err) {
                console.warn('[MakeOrderService] Could not prefetch product discount rules:', err);
            }
        }

        // Enrich items with product rules if not already present on the item
        const enrichedItems = input.items.map(it => {
            const dbProd = it.product_id ? productsMap[it.product_id] : null;
            return {
                ...it,
                max_discount_type: it.max_discount_type || dbProd?.max_discount_type || null,
                max_discount_value: it.max_discount_value !== undefined && it.max_discount_value !== null && it.max_discount_value !== ''
                    ? it.max_discount_value
                    : (dbProd?.max_discount_value ?? null)
            };
        });

        // 0.5 Validate role-based pricing permissions
        const rolePricing = MakePricingService.validateRolePricingPermissions(
            enrichedItems,
            actorSession.role,
            productsMap
        );
        if (!rolePricing.isValid) {
            return { success: false, error: rolePricing.error };
        }

        // 1. Validate items and compute authoritative pricing totals and discounts
        const pricing = MakePricingService.calculateAndValidateTotals(rolePricing.sanitizedItems, {
            discount_type: input.discount_type,
            discount_value: input.discount_value
        });
        if (!pricing.isValid) {
            return { success: false, error: pricing.error };
        }

        // 1.2 Validate role permission to enter initial payment (Furniture Designer, Salesperson, Admin, Superadmin)
        const rawReceived = input.money_received !== undefined ? input.money_received : (input as any).moneyReceived;
        const normRole = (actorSession.role || '').toLowerCase().trim();
        const isInitialPaymentAllowed = [
            'furniture_designer', 'furniture designer', 'designer', 'make_designer',
            'salesperson', 'salesman', 'sales',
            'admin', 'superadmin', 'manager'
        ].includes(normRole);

        const hasNonZeroPayment = rawReceived !== undefined &&
            rawReceived !== null &&
            rawReceived !== '' &&
            Number(rawReceived) > 0;

        if (!isInitialPaymentAllowed && hasNonZeroPayment) {
            return {
                success: false,
                error: 'Forbidden: You do not have permission to enter initial payments.'
            };
        }

        // 1.5 Calculate payment status, amount due, and production hold
        const payment = MakePricingService.calculatePaymentStatus(pricing.finalPrice, rawReceived);
        if (!payment.isValid) {
            return { success: false, error: payment.error };
        }

        // Deterministically resolve customer
        let resolvedCustId: number | null = null;
        if (input.customer_id || input.customer_phone || input.customer_name) {
            const resolved = await this.resolveOrCreateCustomer({
                customerId: input.customer_id ? Number(input.customer_id) : undefined,
                customerName: input.customer_name,
                customerPhone: input.customer_phone,
                customerEmail: input.customer_email,
                shippingAddress: input.shipping_address
            });
            if (resolved) {
                resolvedCustId = resolved.id;
            }
        }

        const isAdminUser = ['admin', 'superadmin', 'manager'].includes((actorSession.role || '').toLowerCase().trim());
        let effectiveSalesmanId: number | null = null;
        if (isAdminUser) {
            effectiveSalesmanId = input.salesman_id !== undefined ? (input.salesman_id ? Number(input.salesman_id) : null) : (actorSession.userId || null);
        } else {
            // For normal users, derive strictly from authenticated session
            effectiveSalesmanId = actorSession.userId || (input.salesman_id ? Number(input.salesman_id) : null);
        }

        const orderNumber = await this.generateUniqueOrderNumber();
        const totalQty = input.items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
        const initialStatus = effectiveSalesmanId ? 'Pending Approval' : 'Placed';
        const isApproved = !effectiveSalesmanId;
        const initialApprovalStatus = isApproved ? 'sales_approved' : 'awaiting_designer';

        // Storing discount breakdown, subtotal, and payment in custom_details ensures resilience across all DB schemas
        const customDetails: Record<string, any> = {
            subtotal: pricing.subtotal,
            discount_type: pricing.discountType,
            discount_value: pricing.discountValue,
            discount_amount: pricing.discountAmount,
            final_price: pricing.finalPrice,
            money_received: payment.moneyReceived,
            amount_due: payment.amountDue,
            payment_status: payment.paymentStatus,
            production_hold: payment.productionHold,
            hold_reason: payment.holdReason,
            admin_approval_status: 'none',
            items: pricing.items
        };

        // 2. Insert order header
        const orderHeaderPayload: Record<string, any> = {
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
            salesman_id: effectiveSalesmanId,
            customer_id: resolvedCustId,
            invoice_attachment_urls: ((Array.isArray(input.invoice_attachment_urls) && input.invoice_attachment_urls.length > 0)
                ? input.invoice_attachment_urls
                : (Array.isArray((input as any).invoice_attachments) ? (input as any).invoice_attachments : []))
                .map((u: any) => typeof u === 'string' ? MakeOrderService.normalizeAttachmentReference(u) : u)
                .filter(Boolean),
            is_approved: isApproved,
            customer_name: input.customer_name?.trim() || null,
            customer_phone: input.customer_phone?.trim() || null,
            customer_email: input.customer_email?.trim() || null,
            delivery_address: input.shipping_address?.trim() || null,
            location_landmark: input.location_landmark?.trim() || null,
            receiver_name: input.receiver_name?.trim() || null,
            receiver_phone: input.receiver_phone?.trim() || null,
            created_by: actorSession.fullName || actorSession.username || null,
            cost_price: pricing.totalCostPrice,
            sale_price: pricing.totalSalePrice,
            discount_type: pricing.discountType,
            discount_value: pricing.discountValue,
            discount_amount: pricing.discountAmount,
            final_price: pricing.finalPrice,
            money_received: payment.moneyReceived,
            amount_due: payment.amountDue,
            payment_status: payment.paymentStatus,
            production_hold: payment.productionHold,
            hold_reason: payment.holdReason,
            admin_approval_status: 'none',
            custom_details: customDetails,
            approval_status: initialApprovalStatus,
            current_version: 1,
            created_at: new Date().toISOString()
        };

        if (input.reference_bill_no && input.reference_bill_no.trim()) {
            orderHeaderPayload.reference_bill_no = input.reference_bill_no.trim();
        }

        let { data: createdOrder, error: orderErr } = await supabase
            .from('make_orders')
            .insert(orderHeaderPayload)
            .select('id, order_number')
            .single();

        // If insert failed due to missing columns on unmigrated schema, strip them and retry
        if (orderErr && orderErr.message) {
            const errMessage = orderErr.message;
            const optionalCols = [
                'discount_type', 'discount_value', 'discount_amount', 'final_price', 'reference_bill_no',
                'money_received', 'amount_due', 'payment_status', 'production_hold', 'hold_reason',
                'admin_approval_status', 'created_by'
            ];
            const hasOptionalMissing = optionalCols.some(c => errMessage.includes(c));
            if (hasOptionalMissing) {
                console.warn('[MakeOrderService] Detected missing optional column on make_orders, retrying with fallback payload...');
                const fallbackPayload = { ...orderHeaderPayload };
                for (const c of optionalCols) {
                    if (errMessage.includes(c)) {
                        delete fallbackPayload[c];
                    }
                }
                const retryRes = await supabase
                    .from('make_orders')
                    .insert(fallbackPayload)
                    .select('id, order_number')
                    .single();
                createdOrder = retryRes.data;
                orderErr = retryRes.error;
            }
        }

        if (orderErr || !createdOrder) {
            return { success: false, error: `Failed to create order header: ${orderErr?.message || 'Database error'}` };
        }

        const orderId = createdOrder.id;

        // 3. Insert items with rollback guarantee on failure
        const itemsPayload = input.items.map(item => {
            const rawTechDrawing = item.technical_drawing_url || (item as any).drawing_url || null;
            const normTechDrawing = rawTechDrawing ? MakeOrderService.normalizeAttachmentReference(rawTechDrawing) : null;
            const rawPdfs = (item as any).pdf_urls || (item as any).drawings || [];
            const normPdfs = Array.isArray(rawPdfs)
                ? rawPdfs.map((p: any) => typeof p === 'string' ? MakeOrderService.normalizeAttachmentReference(p) : p).filter(Boolean)
                : (normTechDrawing ? [normTechDrawing] : []);

            return {
                order_id: orderId,
                requestion_item_id: (item as any).requestion_item_id ? Number((item as any).requestion_item_id) : null,
                product_id: item.product_id || null,
                spec_id: item.spec_id || null,
                size_id: item.size_id || null,
                color_id: item.color_id || null,
                product_name: item.product_name.trim(),
                spec_name: item.spec_name || null,
                spec_details: item.spec_details || null,
                size_label: item.size_id ? (item.dimensions_text || (item as any).size_label || null) : ((item as any).size_label || null),
                dimensions_text: item.dimensions_text || null,
                custom_size: item.custom_size || (item.is_customized ? item.dimensions_text : null) || null,
                custom_dimensions: item.custom_dimensions || (item.is_customized ? (item.custom_size || item.dimensions_text) : null) || null,
                color_name: item.color_name || (item as any).custom_color || null,
                quantity: Number(item.quantity) || 1,
                technical_drawing_url: normTechDrawing,
                pdf_urls: normPdfs,
                item_cost_price: item.item_cost_price !== undefined && item.item_cost_price !== null && item.item_cost_price !== ''
                    ? Math.max(0, Number(item.item_cost_price))
                    : 0.00,
                item_sale_price: item.item_sale_price !== undefined && item.item_sale_price !== null && item.item_sale_price !== ''
                    ? Math.max(0, Number(item.item_sale_price))
                    : null,
                discount_type: item.discount_type || null,
                discount_value: item.discount_value !== undefined && item.discount_value !== null && item.discount_value !== '' ? Number(item.discount_value) : null,
                discount_amount: item.discount_amount !== undefined && item.discount_amount !== null && item.discount_amount !== '' ? Number(item.discount_amount) : 0,
                final_item_price: item.final_item_price !== undefined && item.final_item_price !== null && item.final_item_price !== '' ? Number(item.final_item_price) : null,
                is_customized: !!(item.is_customized || (item as any).is_custom),
                max_discount_type: item.max_discount_type || null,
                max_discount_value: item.max_discount_value !== undefined && item.max_discount_value !== null && item.max_discount_value !== '' ? Number(item.max_discount_value) : null,
                designer_notes: item.designer_notes || (item as any).custom_notes || null
            };
        });

        let { data: insertedItems, error: itemsErr } = await supabase
            .from('make_order_items')
            .insert(itemsPayload)
            .select('id, product_name');

        // Schema compatibility fallback:
        if (itemsErr && (itemsErr.code === '42703' || (itemsErr.message && /column.*does not exist/i.test(itemsErr.message)))) {
            console.warn('[MakeOrderService] Detected missing column on make_order_items insert:', itemsErr.message, 'Retrying with schema-compatible payload...');
            const missingColMatch = itemsErr.message.match(/column (?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+) does not exist/i);
            const missingCol = missingColMatch ? missingColMatch[1] : null;

            const compatiblePayload = itemsPayload.map(rawItem => {
                const sanitized: any = { ...rawItem };
                if (missingCol && missingCol in sanitized) {
                    delete sanitized[missingCol];
                } else {
                    delete sanitized.designer_notes;
                    delete sanitized.technical_drawing_url;
                    delete sanitized.pdf_urls;
                    delete sanitized.max_discount_type;
                    delete sanitized.max_discount_value;
                    delete sanitized.discount_type;
                    delete sanitized.discount_value;
                    delete sanitized.discount_amount;
                    delete sanitized.final_item_price;
                }
                return sanitized;
            });

            const retryRes = await supabase
                .from('make_order_items')
                .insert(compatiblePayload)
                .select('id, product_name');
            insertedItems = retryRes.data;
            itemsErr = retryRes.error;
        }

        if (itemsErr) {
            // ATOMIC ROLLBACK: Remove orphaned order header
            console.error('[MakeOrderService] Items insertion failed. Rolling back order header:', itemsErr.message);
            await supabase.from('make_orders').delete().eq('id', orderId);
            return { success: false, error: `Order creation rolled back due to item insertion error: ${itemsErr.message}` };
        }

        const requestionItemIds = Array.from(new Set(input.items
            .map((item: any) => Number(item.requestion_item_id || 0))
            .filter((id: number) => Number.isInteger(id) && id > 0)));
        for (const requestionItemId of requestionItemIds) {
            try {
                const { data: linkedItem } = await supabase.from('make_costing_request_items').update({ status: 'ordered', updated_at: new Date().toISOString() }).eq('id', requestionItemId).select('request_id').maybeSingle();
                if (linkedItem?.request_id) {
                    const { data: requestItems } = await supabase.from('make_costing_request_items').select('status').eq('request_id', linkedItem.request_id);
                    if ((requestItems || []).length && (requestItems || []).every((row: any) => row.status === 'ordered')) {
                        await supabase.from('make_costing_requests').update({ status: 'ordered', updated_at: new Date().toISOString() }).eq('id', linkedItem.request_id);
                    }
                }
            } catch (err: any) {
                console.warn('[MakeOrderService] Could not mark linked costing request item ordered:', err?.message || err);
            }
        }

        // 3.5 Record initial payment into make_order_payments if money received
        if (payment.moneyReceived > 0) {
            try {
                const initRef = input.reference_bill_no || 'INITIAL_PAYMENT';
                // Idempotency check: check if initial payment for this order already exists
                const { data: existingInit } = await supabase
                    .from('make_order_payments')
                    .select('id, amount')
                    .eq('order_id', orderId)
                    .eq('reference', initRef)
                    .maybeSingle();

                if (!existingInit) {
                    const { error: payErr } = await supabase.from('make_order_payments').insert({
                        order_id: orderId,
                        amount: payment.moneyReceived,
                        payment_method: 'CASH',
                        reference: initRef,
                        notes: 'Initial payment recorded at order placement',
                        received_by: actorSession.fullName || actorSession.username || 'System'
                    });

                    if (payErr) {
                        const tableMissing = payErr.code === '42P01' || /relation.*does not exist/i.test(payErr.message);
                        if (!tableMissing) {
                            console.error('[MakeOrderService] Could not insert initial payment record into make_order_payments:', payErr.message);
                            // ATOMIC ROLLBACK: Remove order items and header to prevent inconsistent state
                            await supabase.from('make_order_items').delete().eq('order_id', orderId);
                            await supabase.from('make_orders').delete().eq('id', orderId);
                            return { success: false, error: `Failed to persist initial payment in payment ledger: ${payErr.message}` };
                        }
                    }
                }
            } catch (payErr: any) {
                console.error('[MakeOrderService] Exception persisting initial payment record into make_order_payments:', payErr);
                await supabase.from('make_order_items').delete().eq('order_id', orderId);
                await supabase.from('make_orders').delete().eq('id', orderId);
                return { success: false, error: `Failed to persist initial payment: ${payErr?.message || 'Database error'}` };
            }
        }

        // 4. Initial timeline update (preserve any item notes in timeline so they are never lost)
        const collectedItemNotes = input.items
            .map((it, idx) => {
                const note = it.designer_notes || (it as any).custom_notes;
                return note ? `Item #${idx + 1} (${it.product_name}): ${note}` : null;
            })
            .filter(Boolean);
        let baseTimelineNote = input.salesman_id ? 'Order created, awaiting salesperson approval' : 'Order placed and approved';
        if (payment.productionHold) {
            baseTimelineNote += ` [PRODUCTION HOLD: Outstanding balance of ৳${payment.amountDue.toLocaleString()} due]`;
        }
        const finalTimelineNote = collectedItemNotes.length > 0
            ? `${baseTimelineNote} [Item Notes: ${collectedItemNotes.join('; ')}]`
            : baseTimelineNote;

        await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: initialStatus,
            note: finalTimelineNote,
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

        // 5.5 If order is placed with outstanding balance, notify admins of production hold
        if (payment.productionHold) {
            try {
                const { data: adminUsers } = await supabase
                    .from('users')
                    .select('id')
                    .in('role', ['admin', 'superadmin'])
                    .eq('is_active', 1);
                if (adminUsers && adminUsers.length > 0) {
                    for (const adm of adminUsers) {
                        await supabase.from('notifications').insert({
                            title: 'Order on Production Hold (Payment Due)',
                            message: `Order ${orderNumber} ("${input.furniture_name}") placed with outstanding balance of ৳${payment.amountDue.toLocaleString()}. Production is on hold.`,
                            recipient_id: adm.id,
                            sender_id: actorSession.userId,
                            action_path: '/make/track',
                            action_label: 'Review Order Hold',
                            metadata: { type: 'make_order_hold', order_id: orderId, amount_due: payment.amountDue }
                        });
                    }
                }
            } catch (holdNotifErr) {
                console.warn('[MakeOrderService] Hold notification error (non-fatal):', holdNotifErr);
            }
        }

        // 6. Associate any pre-staged uploads with the newly created order and item records
        const failedAssociations: Array<{ ref: string; meta: any }> = [];
        try {
            const durableUpload = DurableUploadService.getInstance();
            const invAttachments = orderHeaderPayload.invoice_attachment_urls;
            if (Array.isArray(invAttachments)) {
                for (const att of invAttachments) {
                    if (typeof att === 'string') {
                        const meta = {
                            entityType: 'make_orders',
                            entityId: orderId,
                            fieldName: 'invoice_attachment_urls'
                        };
                        const associated = durableUpload.associateUploadWithEntity(att, meta);
                        if (!associated && (att.includes('upl_') || att.includes('make-order-files/'))) {
                            console.warn(`[MakeOrderService] Failed to associate invoice attachment "${att}" with order ${orderId}. Stored in pending retry queue.`);
                            failedAssociations.push({ ref: att, meta });
                        }
                    }
                }
            }

            if (Array.isArray(insertedItems)) {
                for (let idx = 0; idx < insertedItems.length; idx++) {
                    const itemRecord = insertedItems[idx];
                    const rawItem = input.items[idx];
                    if (!itemRecord?.id || !rawItem) continue;

                    const drawings = (rawItem as any).pdf_urls || (rawItem as any).drawings || [(rawItem as any).technical_drawing_url].filter(Boolean);
                    if (Array.isArray(drawings)) {
                        for (const d of drawings) {
                            const dRef = typeof d === 'string' ? d : d?.url;
                            if (dRef) {
                                const meta = {
                                    entityType: 'make_order_items',
                                    entityId: itemRecord.id,
                                    fieldName: 'technical_drawing_url'
                                };
                                const associated = durableUpload.associateUploadWithEntity(dRef, meta);
                                if (!associated && (dRef.includes('upl_') || dRef.includes('make-order-files/'))) {
                                    console.warn(`[MakeOrderService] Failed to associate drawing "${dRef}" with item ${itemRecord.id}. Stored in pending retry queue.`);
                                    failedAssociations.push({ ref: dRef, meta });
                                }
                            }
                        }
                    }
                }
            }

            if (failedAssociations.length > 0) {
                console.warn(`[MakeOrderService] Order ${orderNumber} created with ${failedAssociations.length} unassociated staged upload(s). Retained in durable queue for reconciliation.`);
            }
        } catch (assocErr: any) {
            console.warn('[MakeOrderService] Pre-staged upload association warning (non-fatal):', assocErr.message);
        }

        return {
            success: true,
            id: orderId,
            order_number: orderNumber,
            items: insertedItems || [],
            unassociatedUploads: failedAssociations.length > 0 ? failedAssociations : undefined
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

        // 2.5 Outstanding balance & Admin approval enforcement
        const dueAmount = Number(order.amount_due || 0);
        const isAdminActor = ['admin', 'superadmin', 'manager'].includes((actorSession.role || '').toLowerCase().trim());
        const hasAdminApproval = order.admin_approval_status === 'approved';

        if ((dueAmount > 0 || order.production_hold) && !isAdminActor && !hasAdminApproval) {
            return {
                success: false,
                error: `Cannot start processing order with outstanding balance (৳${dueAmount.toLocaleString()}). Submit a Request for Admin Review.`
            };
        }

        const actorName = actorSession.fullName || actorSession.username;
        const actorRole = actorSession.role;
        const approvalVersion = Math.max(1, Number(order.current_version) || 1);

        // 3. Create or reuse the exact pending revision snapshot.
        const versionResult = await MakeVersionService.createSnapshot({
            orderId,
            versionNumber: approvalVersion,
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
        const approvalAudit = await MakeVersionService.recordApprovalAudit({
            orderId,
            versionNumber: approvalVersion,
            action: 'approved',
            actedBy: actorName,
            userRole: actorRole,
            notesOrReason: notes || override?.overrideReason || 'Order approved and placed into factory queue'
        });
        if (!approvalAudit.success) {
            return { success: false, error: `Failed to record approval audit: ${approvalAudit.error || 'unknown database error'}` };
        }

        // 5. Update make_orders table atomically
        const { error: updErr } = await supabase
            .from('make_orders')
            .update({
                status: 'Placed',
                approval_status: 'sales_approved',
                is_approved: true,
                approved_version: approvalVersion,
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

        if (fetchErr) return { success: false, error: `Failed to load order: ${fetchErr.message}` };
        if (!current) return { success: false, error: 'Order not found' };

        let calcCostPrice = 0;
        let calcSalePrice = 0;
        let hasItemCost = false;
        let hasItemSale = false;

        // 2. Validate and total item changes before writing anything.
        const itemUpdates: Array<{ item: any; itemQty: number; itemCost: number; hasSale: boolean }> = [];
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
                if (item.id) itemUpdates.push({ item, itemQty, itemCost, hasSale });
            }
        }

        const finalCostPrice = hasItemCost ? calcCostPrice : (Number(costPrice) || 0);
        const finalSalePrice = hasItemSale ? calcSalePrice : (salePrice ? Number(salePrice) : null);

        if (finalCostPrice <= 0) {
            return { success: false, error: 'Cost price must be greater than 0.' };
        }

        // Do not accept an item id from another order (or stale UI state).
        if (itemUpdates.length > 0) {
            const itemIds = itemUpdates.map(({ item }) => String(item.id));
            const { data: ownedItems, error: ownedItemsErr } = await supabase
                .from('make_order_items')
                .select('id')
                .eq('order_id', orderId)
                .in('id', itemIds);
            if (ownedItemsErr) {
                return { success: false, error: `Failed to validate order items: ${ownedItemsErr.message}` };
            }
            const ownedIds = new Set((ownedItems || []).map((row: any) => String(row.id)));
            const missingId = itemIds.find(id => !ownedIds.has(id));
            if (missingId) {
                return { success: false, error: `Order item ${missingId} is no longer part of this order. Refresh Track Orders and try again.` };
            }
        }

        const isReModification = Number(current.approved_version || 0) > 0 ||
            current.approval_status === 'sales_approved' || String(current.status || '').trim().toLowerCase() === 'placed';
        const nextVersion = isReModification ? (current.current_version || 1) + 1 : (current.current_version || 1);

        const actorName = actorSession.fullName || actorSession.username;
        const actorRole = actorSession.role;

        // 3. Audit approved-order modifications. The immutable vN+1 snapshot is
        // written after item updates so the version reflects the designer's new data.
        if (isReModification) {
            const { error: auditErr } = await supabase.from('make_order_alteration_log').insert({
                order_id: orderId,
                altered_by: actorName,
                user_role: actorRole,
                field_name: 'pricing_and_specs',
                old_value: `v${current.current_version}: Cost ৳${current.cost_price || 0}, Sale ৳${current.sale_price || 0}`,
                new_value: `v${nextVersion}: Cost ৳${finalCostPrice}, Sale ৳${finalSalePrice || 0}`,
                reason: modificationReason || 'Designer adjusted individual product specifications/pricing'
            });
            if (auditErr) return { success: false, error: `Could not record order modification audit: ${auditErr.message}` };
        }

        // Save item-level details only after validation/snapshot has succeeded.
        for (const { item, itemQty, itemCost, hasSale } of itemUpdates) {
            const { data: updatedItem, error: itemUpdateErr } = await supabase
                .from('make_order_items')
                .update({
                    quantity: itemQty,
                    item_cost_price: itemCost,
                    item_sale_price: hasSale ? Number(item.item_sale_price) : null,
                    spec_name: item.spec_name ?? '',
                    size_label: item.size_label ?? '',
                    color_name: item.color_name ?? '',
                    salesperson_note: item.salesperson_note || null,
                    designer_notes: item.designer_notes || null,
                    technical_drawing_url: item.technical_drawing_url || null
                })
                .eq('id', item.id)
                .eq('order_id', orderId)
                .select('id')
                .maybeSingle();
            if (itemUpdateErr) {
                return { success: false, error: `Failed to save order item ${item.id}: ${itemUpdateErr.message}` };
            }
            if (!updatedItem) {
                return { success: false, error: `Order item ${item.id} was not updated. Refresh Track Orders and try again.` };
            }
        }

        if (isReModification) {
            const { data: latestItems, error: latestItemsError } = await supabase.from('make_order_items').select('*').eq('order_id', orderId).order('id', { ascending: true });
            if (latestItemsError) return { success: false, error: `Could not read the revised order items: ${latestItemsError.message}` };
            const snapshotOrder = {
                ...current,
                cost_price: finalCostPrice,
                sale_price: finalSalePrice,
                current_version: nextVersion,
                approved_version: null,
                approval_status: 'modification_pending_approval',
                status: 'Modification Pending Approval',
                is_approved: false,
                rejection_reason: null,
                updated_at: new Date().toISOString()
            };
            const snapshotResult = await MakeVersionService.createSnapshot({
                orderId,
                versionNumber: nextVersion,
                changeReason: modificationReason || `Designer submitted revised order v${nextVersion}; salesperson re-approval required`,
                actorName,
                actorRole,
                snapshotOverride: { order: snapshotOrder, items: latestItems || [], timestamp: new Date().toISOString() }
            });
            if (!snapshotResult.success) return { success: false, error: `Could not save revised order v${nextVersion}: ${snapshotResult.error || 'snapshot failed'}` };
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
        const { error: timelineErr } = await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: isReModification ? 'Modification Pending Approval' : 'Awaiting Salesperson Approval',
            note: `Cost price set to ৳${finalCostPrice.toLocaleString()}${finalSalePrice ? ` | Sale price: ৳${finalSalePrice.toLocaleString()}` : ''}${isReModification ? ` (v${nextVersion} requires re-approval)` : ''}`,
            updated_by: `${actorName} (${actorRole})`
        });
        if (timelineErr) console.error('[MakeOrderService] Failed to add designer pricing timeline entry:', timelineErr);

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
    /**
     * Authoritative role-based order alteration with complete audit logging.
     * Enforces canonical MAKE stages:
     * 1. Work in process
     * 2. Production On Going
     * 3. Primary QC
     * 4. Color Ongoing (oven)
     * 5. QC Final
     * 6. Packaging
     * 7. Ready to Ship
     * 8. Delivered
     * 
     * Before production (not yet reached Production On Going):
     *   - Designer can modify
     *   - Admin can modify
     *   - Salesperson is denied
     * At or after Production On Going:
     *   - Only Admin can modify
     *   - Designer is denied
     *   - Salesperson is denied
     */
    public static async alterOrder(
        paramsOrOrderId: number | {
            orderId: number;
            changes?: Record<string, any>;
            itemChanges?: any[];
            items?: any[];
            reason?: string;
            actorSession?: { userId?: number; username?: string; fullName?: string; role?: string };
            alteredBy?: string;
            userRole?: string;
        },
        changesArg?: Record<string, any>,
        alteredByArg?: string,
        userRoleArg?: string,
        itemsArg?: any[],
        reasonArg?: string,
        actorSessionArg?: any
    ): Promise<{ success: boolean; changed?: string[]; error?: string; message?: string; order_number?: string }> {
        let orderId: number;
        let changes: Record<string, any>;
        let itemChanges: any[];
        let reason: string | undefined;
        let actorSession: { userId?: number; username?: string; fullName?: string; role?: string } | null;

        if (typeof paramsOrOrderId === 'object' && paramsOrOrderId !== null) {
            orderId = paramsOrOrderId.orderId;
            changes = paramsOrOrderId.changes || {};
            itemChanges = paramsOrOrderId.itemChanges || paramsOrOrderId.items || [];
            reason = paramsOrOrderId.reason;
            actorSession = paramsOrOrderId.actorSession || SessionManager.getSession() || (paramsOrOrderId.userRole ? { role: paramsOrOrderId.userRole, username: paramsOrOrderId.alteredBy || 'User' } : null);
        } else {
            orderId = paramsOrOrderId as number;
            changes = changesArg || {};
            itemChanges = itemsArg || [];
            reason = reasonArg;
            actorSession = actorSessionArg || SessionManager.getSession() || (userRoleArg ? { role: userRoleArg, username: alteredByArg || 'User' } : null);
        }

        if (!actorSession) {
            return { success: false, error: 'Unauthorized: Session or user identity required' };
        }

        const { data: current, error: fetchErr } = await supabase
            .from('make_orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !current) return { success: false, error: 'Order not found' };

        const role = (actorSession.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin' || role === 'manager';
        const isDesigner = role === 'furniture_designer' || role === 'furniture designer' || role === 'designer' || role === 'make_designer';
        const isSalesperson = role === 'salesperson' || role === 'salesman';

        // 1. Strict denial for salespersons
        if (isSalesperson) {
            return {
                success: false,
                error: 'Forbidden: Salespersons cannot modify production orders.'
            };
        }

        // 2. Canonical stage progression check
        // Stages at or after "Production On Going" are post-production
        const postProductionStages = [
            'production on going',
            'in production',
            'primary qc',
            'color ongoing',
            'color ongoing (oven)',
            'qc final',
            'packaging',
            'ready to ship',
            'delivered',
            // legacy stage names mapped defensively:
            'welding',
            'painting',
            'ready for dispatch'
        ];

        const currentStageNorm = (current.status || '').trim().toLowerCase();
        const hasProductionStarted = postProductionStages.includes(currentStageNorm);

        if (hasProductionStarted && !isAdmin) {
            return {
                success: false,
                error: `Order has entered "${current.status}". At or after "Production On Going", only Administrators can modify orders.`
            };
        }

        if (!isAdmin && !isDesigner) {
            return {
                success: false,
                error: 'Forbidden: You do not have permission to modify this order.'
            };
        }

        const actorName = actorSession.fullName || actorSession.username || 'System';
        const actorRole = actorSession.role || (isAdmin ? 'Admin' : 'Designer');
        const actionContext = hasProductionStarted ? 'admin_post_production_override' : 'order_modification';
        const auditReason = reason?.trim() || '';

        const auditRows: any[] = [];
        const changedFieldNames: Set<string> = new Set();

        // 3. Process Item Changes (Product replacement, quantity change, spec/size/color modification)
        // Fetch current items for order
        const { data: existingItems } = await supabase
            .from('make_order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('id', { ascending: true });

        const itemsList = existingItems || [];
        let itemsModified = false;

        // If itemChanges array is provided:
        if (itemChanges.length > 0) {
            for (const itUpd of itemChanges) {
                const targetItemId = itUpd.id || itUpd.itemId;
                const currentItem = itemsList.find((it: any) => String(it.id) === String(targetItemId)) || (itemsList.length === 1 ? itemsList[0] : null);
                if (!currentItem) continue;

                const itemPayload: Record<string, any> = {};

                // Product Replacement
                const newProductId = itUpd.productId || itUpd.product_id;
                if (newProductId && String(newProductId) !== String(currentItem.product_id)) {
                    // Fetch new product details from catalog
                    const { data: prodData } = await supabase
                        .from('make_products')
                        .select('id, product_name, product_code')
                        .eq('id', newProductId)
                        .maybeSingle();

                    if (prodData) {
                        itemPayload.product_id = prodData.id;
                        itemPayload.product_name = prodData.product_name;
                        itemPayload.is_customized = false;

                        auditRows.push({
                            order_id: orderId,
                            order_number: current.order_number || '',
                            altered_by: actorName,
                            user_role: actorRole,
                            action_type: 'product_replacement',
                            field_name: 'product_id',
                            old_value: `${currentItem.product_name} (ID: ${currentItem.product_id})`,
                            new_value: `${prodData.product_name} (ID: ${prodData.id})`,
                            reason: auditReason,
                            altered_at: new Date().toISOString()
                        });
                        changedFieldNames.add('product');
                        itemsModified = true;
                    }
                }

                // Quantity change
                if (itUpd.quantity !== undefined && itUpd.quantity !== null) {
                    const newQty = Math.max(1, Number(itUpd.quantity) || 1);
                    if (Number(currentItem.quantity) !== newQty) {
                        itemPayload.quantity = newQty;
                        auditRows.push({
                            order_id: orderId,
                            order_number: current.order_number || '',
                            altered_by: actorName,
                            user_role: actorRole,
                            action_type: 'quantity_change',
                            field_name: `quantity (item #${currentItem.id})`,
                            old_value: String(currentItem.quantity),
                            new_value: String(newQty),
                            reason: auditReason,
                            altered_at: new Date().toISOString()
                        });
                        changedFieldNames.add('quantity');
                        itemsModified = true;
                    }
                }

                // Attributes (spec, size, color)
                if (itUpd.spec_name !== undefined && itUpd.spec_name !== currentItem.spec_name) {
                    itemPayload.spec_name = itUpd.spec_name;
                    itemPayload.spec_id = itUpd.spec_id || itUpd.specId || null;
                    itemsModified = true;
                    changedFieldNames.add('specification');
                }
                if (itUpd.size_label !== undefined && itUpd.size_label !== currentItem.size_label) {
                    itemPayload.size_label = itUpd.size_label;
                    itemPayload.size_id = itUpd.size_id || itUpd.sizeId || null;
                    itemsModified = true;
                    changedFieldNames.add('size');
                }
                if (itUpd.color_name !== undefined && itUpd.color_name !== currentItem.color_name) {
                    itemPayload.color_name = itUpd.color_name;
                    itemPayload.color_id = itUpd.color_id || itUpd.colorId || null;
                    itemsModified = true;
                    changedFieldNames.add('color');
                }
                if (itUpd.item_cost_price !== undefined && itUpd.item_cost_price !== currentItem.item_cost_price) {
                    itemPayload.item_cost_price = Number(itUpd.item_cost_price) || 0;
                    itemsModified = true;
                }
                if (itUpd.item_sale_price !== undefined && itUpd.item_sale_price !== currentItem.item_sale_price) {
                    itemPayload.item_sale_price = itUpd.item_sale_price !== null ? Number(itUpd.item_sale_price) : null;
                    itemsModified = true;
                }

                if (Object.keys(itemPayload).length > 0) {
                    await supabase
                        .from('make_order_items')
                        .update(itemPayload)
                        .eq('id', currentItem.id);
                }
            }
        }

        // Support flat changes: product_id or quantity on single-item orders
        if (changes.product_id && itemsList.length > 0) {
            const firstItem = itemsList[0];
            if (String(firstItem.product_id) !== String(changes.product_id)) {
                const { data: prodData } = await supabase
                    .from('make_products')
                    .select('id, product_name, product_code')
                    .eq('id', changes.product_id)
                    .maybeSingle();

                if (prodData) {
                    await supabase
                        .from('make_order_items')
                        .update({ product_id: prodData.id, product_name: prodData.product_name, is_customized: false })
                        .eq('id', firstItem.id);

                    auditRows.push({
                        order_id: orderId,
                        order_number: current.order_number || '',
                        altered_by: actorName,
                        user_role: actorRole,
                        action_type: 'product_replacement',
                        field_name: 'product_id',
                        old_value: `${firstItem.product_name} (ID: ${firstItem.product_id})`,
                        new_value: `${prodData.product_name} (ID: ${prodData.id})`,
                        reason: auditReason,
                        altered_at: new Date().toISOString()
                    });
                    changedFieldNames.add('product');
                    itemsModified = true;
                }
            }
        }

        if (changes.quantity !== undefined && itemsList.length > 0 && !changedFieldNames.has('quantity')) {
            const firstItem = itemsList[0];
            const newQty = Math.max(1, Number(changes.quantity) || 1);
            if (Number(firstItem.quantity) !== newQty) {
                await supabase
                    .from('make_order_items')
                    .update({ quantity: newQty })
                    .eq('id', firstItem.id);

                auditRows.push({
                    order_id: orderId,
                    order_number: current.order_number || '',
                    altered_by: actorName,
                    user_role: actorRole,
                    action_type: 'quantity_change',
                    field_name: 'quantity',
                    old_value: String(firstItem.quantity),
                    new_value: String(newQty),
                    reason: auditReason,
                    altered_at: new Date().toISOString()
                });
                changedFieldNames.add('quantity');
                itemsModified = true;
            }
        }

        // 4. Recalculate totals if items were modified
        const filteredOrderChanges: Record<string, any> = {};

        if (itemsModified) {
            const { data: updatedItems } = await supabase
                .from('make_order_items')
                .select('*')
                .eq('order_id', orderId);

            const allItems = updatedItems || [];
            const totalQty = allItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
            const totalCost = allItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.item_cost_price) || 0)), 0);
            const totalSale = allItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.item_sale_price) || 0)), 0);

            filteredOrderChanges.quantity = totalQty;
            filteredOrderChanges.total_cost_price = totalCost;
            filteredOrderChanges.cost_price = totalCost;
            filteredOrderChanges.total_sale_price = totalSale;
            filteredOrderChanges.sale_price = totalSale;
            filteredOrderChanges.remaining_balance = Math.max(0, totalSale - Number(current.advance_amount || 0));
            const historicalMoneyReceived = Number(current.money_received || 0);
            filteredOrderChanges.money_received = historicalMoneyReceived;
            filteredOrderChanges.amount_due = Math.max(0, Math.round((totalSale - historicalMoneyReceived + Number.EPSILON) * 100) / 100);
            filteredOrderChanges.payment_status = filteredOrderChanges.amount_due <= 0 ? 'paid' : (historicalMoneyReceived > 0 ? 'partial' : 'unpaid');

            // If there is a primary item product name, keep furniture_name consistent
            if (allItems.length === 1 && allItems[0].product_name) {
                filteredOrderChanges.furniture_name = allItems[0].product_name;
            }
        }

        // 5. Order Header level editable fields
        const ALTERABLE_HEADER_FIELDS = [
            'furniture_name',
            'description',
            'quantity',
            'priority',
            'delivery_date',
            'target_delivery_date',
            'requested_delivery_date',
            'shipping_address',
            'delivery_address',
            'location_landmark',
            'receiver_name',
            'receiver_phone',
            'special_instructions',
            'customer_name',
            'customer_phone',
            'customer_email'
        ];

        for (const [field, newVal] of Object.entries(changes)) {
            if (ALTERABLE_HEADER_FIELDS.includes(field)) {
                if (field === 'quantity' && changedFieldNames.has('quantity')) continue;
                const currentVal = current[field];
                if (String(currentVal ?? '') !== String(newVal ?? '')) {
                    filteredOrderChanges[field] = field === 'quantity' ? Math.max(1, Number(newVal) || 1) : newVal;
                    auditRows.push({
                        order_id: orderId,
                        order_number: current.order_number || '',
                        altered_by: actorName,
                        user_role: actorRole,
                        action_type: field === 'quantity' ? 'quantity_change' : actionContext,
                        field_name: field,
                        old_value: String(currentVal ?? ''),
                        new_value: String(newVal ?? ''),
                        reason: auditReason,
                        altered_at: new Date().toISOString()
                    });
                    changedFieldNames.add(field);
                }
            }
        }

        if (auditRows.length === 0 && Object.keys(filteredOrderChanges).length === 0) {
            return { success: true, message: 'No changes detected', order_number: current.order_number };
        }

        const designerRevisingApprovedOrder = isDesigner && (
            Number(current.approved_version || 0) > 0 ||
            current.approval_status === 'sales_approved' ||
            String(current.status || '').trim().toLowerCase() === 'placed'
        );
        if (designerRevisingApprovedOrder) {
            const currentVersion = Math.max(1, Number(current.current_version) || 1);
            const nextVersion = currentVersion + 1;
            filteredOrderChanges.current_version = nextVersion;
            filteredOrderChanges.approved_version = null;
            filteredOrderChanges.approval_status = 'modification_pending_approval';
            filteredOrderChanges.status = 'Modification Pending Approval';
            filteredOrderChanges.is_approved = false;
            filteredOrderChanges.rejection_reason = null;
            const { data: latestItems, error: latestItemsError } = await supabase.from('make_order_items').select('*').eq('order_id', orderId).order('id', { ascending: true });
            if (latestItemsError) return { success: false, error: `Could not read the revised order items: ${latestItemsError.message}` };
            const projectedOrder = { ...current, ...filteredOrderChanges, updated_at: new Date().toISOString() };
            const snapshot = await MakeVersionService.createSnapshot({
                orderId,
                versionNumber: nextVersion,
                changeReason: reason?.trim() || `Designer submitted revised order v${nextVersion}; salesperson re-approval is required.`,
                actorName,
                actorRole,
                snapshotOverride: { order: projectedOrder, items: latestItems || [], timestamp: new Date().toISOString() }
            });
            if (!snapshot.success) return { success: false, error: `Could not save revised order v${nextVersion}: ${snapshot.error || 'snapshot failed'}` };
            auditRows.push({
                order_id: orderId,
                altered_by: actorName,
                user_role: actorRole,
                field_name: 'order_version',
                old_value: `v${currentVersion}`,
                new_value: `v${nextVersion}`,
                reason: reason?.trim() || 'Designer modification requires salesperson re-approval',
                altered_at: new Date().toISOString()
            });
        }

        // 6. Save audit rows
        if (auditRows.length > 0) {
            await supabase.from('make_order_alteration_log').insert(auditRows);
        }

        // 7. Update order header
        if (Object.keys(filteredOrderChanges).length > 0) {
            filteredOrderChanges.updated_at = new Date().toISOString();
            const { error: updateErr } = await supabase
                .from('make_orders')
                .update(filteredOrderChanges)
                .eq('id', orderId);

            if (updateErr) return { success: false, error: updateErr.message };
        }

        if (designerRevisingApprovedOrder) {
            const nextVersion = Math.max(1, Number(current.current_version) || 1) + 1;
            const { error: timelineError } = await supabase.from('make_order_updates').insert({
                order_id: orderId,
                status: 'Modification Pending Approval',
                note: `Designer submitted v${nextVersion}; salesperson approval is required before production continues.`,
                updated_by: `${actorName} (${actorRole})`
            });
            if (timelineError) console.warn('[MakeOrderService] Failed to write version timeline update:', timelineError.message);
        }

        return {
            success: true,
            changed: Array.from(changedFieldNames),
            order_number: current.order_number
        };
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

    /**
     * Request administrator approval to proceed with production despite an unpaid balance / production hold.
     */
    public static async requestProductionApproval(
        orderId: number,
        notes: string | undefined,
        actorSession: UserSession
    ): Promise<{ success: boolean; error?: string; message?: string }> {
        const { data: order, error: fetchErr } = await supabase
            .from('make_orders')
            .select('id, order_number, furniture_name, amount_due, production_hold, admin_approval_status')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr) return { success: false, error: `Failed to load order: ${fetchErr.message}` };
        if (!order) return { success: false, error: 'Order not found.' };

        const role = (actorSession.role || '').toLowerCase().trim();
        const requestPermission = actorSession.permissions?.['request_make_production_approval'];
        if (role !== 'admin' && role !== 'superadmin' && role !== 'manager' && requestPermission === false) {
            return { success: false, error: 'Forbidden: your user group cannot request production release approval.' };
        }
        if (!['salesperson', 'salesman', 'sales', 'admin', 'superadmin', 'manager'].includes(role) && requestPermission !== true) {
            return { success: false, error: 'Only Sales or Admin can request production release for an order with a due balance.' };
        }
        const due = Number(order.amount_due || 0);
        if (due <= 0) return { success: false, error: 'This order has no outstanding payment due.' };
        if (order.admin_approval_status === 'approved') {
            return { success: false, error: 'Admin has already approved this order for production.' };
        }

        const requester = actorSession.fullName || actorSession.username || 'Staff';
        const nowIso = new Date().toISOString();

        const { error: updErr } = await supabase
            .from('make_orders')
            .update({
                admin_approval_status: 'pending',
                admin_approval_requested_by: requester,
                admin_approval_requested_at: nowIso,
                admin_approval_notes: notes || null,
                updated_at: nowIso
            })
            .eq('id', orderId);

        if (updErr) {
            return { success: false, error: `Failed to update approval status: ${updErr.message}` };
        }

        const noteText = `Production release approval requested from Admin${notes ? ': ' + notes : ''}`;
        const { error: timelineErr } = await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: 'Pending Admin Approval',
            note: noteText,
            updated_by: requester
        });
        if (timelineErr) console.error('[MakeOrderService] Failed to add production approval request to timeline:', timelineErr);

        // Notify admins
        try {
            const { data: adminUsers } = await supabase
                .from('users')
                .select('id')
                .in('role', ['admin', 'superadmin'])
                .eq('is_active', 1);

            if (adminUsers && adminUsers.length > 0) {
                const balMsg = order.amount_due ? `৳${Number(order.amount_due).toLocaleString()}` : 'unpaid balance';
                for (const adm of adminUsers) {
                    await supabase.from('notifications').insert({
                        title: 'Production Approval Requested',
                        message: `${requester} requested production approval for Order ${order.order_number} ("${order.furniture_name}") with ${balMsg} due.${notes ? ' Note: ' + notes : ''}`,
                        recipient_id: adm.id,
                        sender_id: actorSession.userId,
                        action_path: '/make/track',
                        action_label: 'Review Approval Request',
                        metadata: { type: 'make_production_approval_requested', order_id: orderId }
                    });
                }
            }
        } catch (notifErr) {
            console.warn('[MakeOrderService] Error sending approval request notifications:', notifErr);
        }

        return { success: true, message: 'Production approval request submitted to Administrators.' };
    }

    /**
     * Authoritatively decide (approve or reject) production release on a held order.
     * Strictly restricted to Administrators and Superadmins.
     */
    public static async decideProductionApproval(
        orderId: number,
        decision: 'approved' | 'rejected',
        notes: string | undefined,
        actorSession: UserSession
    ): Promise<{ success: boolean; decision?: 'approved' | 'rejected'; error?: string; message?: string }> {
        const role = (actorSession.role || '').toLowerCase();
        const isAdmin = role === 'admin' || role === 'superadmin';
        const decisionPermission = actorSession.permissions?.['decide_make_production_approval'];
        if (!isAdmin && decisionPermission !== true) {
            return { success: false, error: 'Forbidden: Only Administrators can decide production approval.' };
        }
        if (!isAdmin && decisionPermission === false) {
            return { success: false, error: 'Forbidden: your user group cannot decide production approval.' };
        }

        const { data: order, error: fetchErr } = await supabase
            .from('make_orders')
            .select('id, order_number, furniture_name, amount_due, production_hold, admin_approval_status, created_by')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr) return { success: false, error: `Failed to load order: ${fetchErr.message}` };
        if (!order) return { success: false, error: 'Order not found.' };

        const approver = actorSession.fullName || actorSession.username || 'Admin';
        const nowIso = new Date().toISOString();
        const isApproved = decision === 'approved';

        const updatePayload: Record<string, any> = {
            admin_approval_status: decision,
            admin_approval_decision_by: approver,
            admin_approval_decision_at: nowIso,
            admin_approval_notes: notes || null,
            // If approved, release the production hold override; if rejected, keep production hold active
            production_hold: !isApproved,
            updated_at: nowIso
        };

        const { error: updErr } = await supabase
            .from('make_orders')
            .update(updatePayload)
            .eq('id', orderId);

        if (updErr) {
            return { success: false, error: `Failed to record approval decision: ${updErr.message}` };
        }

        const actionText = isApproved ? 'APPROVED' : 'REJECTED';
        const noteText = `Production release ${actionText} by ${approver}${notes ? ': ' + notes : ''}${isApproved ? ' (Production hold override active)' : ''}`;

        await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: isApproved ? 'Approved for Production' : 'Hold Confirmed',
            note: noteText,
            updated_by: approver
        });

        // Notify order creator if available
        if (order.created_by) {
            try {
                await supabase.from('notifications').insert({
                    title: `Production Approval ${actionText}`,
                    message: `Production release for Order ${order.order_number} ("${order.furniture_name}") was ${actionText.toLowerCase()} by ${approver}.${notes ? ' Note: ' + notes : ''}`,
                    recipient_id: order.created_by,
                    sender_id: actorSession.userId,
                    action_path: '/make/track',
                    action_label: 'View Order',
                    metadata: { type: 'make_production_approval_decision', order_id: orderId, decision }
                });
            } catch (notifErr) {
                console.warn('[MakeOrderService] Error notifying creator:', notifErr);
            }
        }

        return {
            success: true,
            decision,
            message: `Production approval successfully ${decision}.`
        };
    }

    /**
     * Authoritatively record an order payment, update amount due, and evaluate production hold.
     */
    public static async recordOrderPayment(params: {
        orderId: number;
        amount: number;
        paymentMethod?: string;
        reference?: string;
        notes?: string;
        actorSession: UserSession;
    }): Promise<{
        success: boolean;
        error?: string;
        moneyReceived?: number;
        amountDue?: number;
        paymentStatus?: string;
        productionHold?: boolean;
    }> {
        const { orderId, amount, paymentMethod, reference, notes, actorSession } = params;

        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return { success: false, error: 'Payment amount must be a positive number.' };
        }

        const { data: order, error: fetchErr } = await supabase
            .from('make_orders')
            .select('id, order_number, furniture_name, status, final_price, sale_price, money_received, amount_due, payment_status, production_hold, admin_approval_status')
            .eq('id', orderId)
            .maybeSingle();

        if (fetchErr || !order) {
            return { success: false, error: 'Order not found.' };
        }

        const totalOrderPrice = order.final_price !== null && order.final_price !== undefined
            ? Number(order.final_price)
            : Number(order.sale_price || 0);

        const currentReceived = Number(order.money_received || 0);
        const newReceived = Math.round((currentReceived + amount + Number.EPSILON) * 100) / 100;

        if (totalOrderPrice > 0 && newReceived > totalOrderPrice + 0.01) {
            return {
                success: false,
                error: `Total payments (৳${newReceived.toLocaleString()}) cannot exceed the order price (৳${totalOrderPrice.toLocaleString()}).`
            };
        }

        const newAmountDue = Math.max(0, Math.round((totalOrderPrice - newReceived + Number.EPSILON) * 100) / 100);
        const newPaymentStatus = newAmountDue <= 0 ? 'paid' : (newReceived > 0 ? 'partial' : 'unpaid');
        // If balance cleared, hold is false; if still balance, hold is false only if admin approved
        const newProductionHold = newAmountDue > 0 && order.admin_approval_status !== 'approved';
        const receiver = actorSession.fullName || actorSession.username || 'Staff';

        // 1. Insert payment record into make_order_payments
        const { data: paymentRow, error: payErr } = await supabase.from('make_order_payments').insert({
            order_id: orderId,
            amount,
            payment_method: paymentMethod || 'CASH',
            reference: reference || null,
            notes: notes || null,
            received_by: receiver
        }).select('id').single();

        if (payErr) {
            return { success: false, error: `Payment was not recorded in the payment ledger: ${payErr.message}` };
        }

        // 2. Update order header
        const { error: updErr } = await supabase
            .from('make_orders')
            .update({
                money_received: newReceived,
                amount_due: newAmountDue,
                payment_status: newPaymentStatus,
                production_hold: newProductionHold,
                hold_reason: newProductionHold ? `Outstanding balance of ৳${newAmountDue.toLocaleString()} due` : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updErr) {
            if (paymentRow?.id) {
                const { error: rollbackErr } = await supabase.from('make_order_payments').delete().eq('id', paymentRow.id);
                if (rollbackErr) console.error('[MakeOrderService] Failed to remove payment ledger row after order update failure:', rollbackErr);
            }
            return { success: false, error: `Failed to update order financial status: ${updErr.message}` };
        }

        // 3. Add order timeline entry
        const timelineMsg = `Payment of ৳${amount.toLocaleString()} received (${paymentMethod || 'CASH'}${reference ? ', Ref: ' + reference : ''}). Remaining balance: ৳${newAmountDue.toLocaleString()}${newProductionHold ? ' [HOLD ACTIVE]' : ' [HOLD RELEASED]'}`;
        const { error: timelineErr } = await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: newProductionHold ? 'Production Hold' : (order.status || 'Payment Received'),
            note: timelineMsg,
            updated_by: receiver
        });
        if (timelineErr) console.error('[MakeOrderService] Failed to add payment timeline entry:', timelineErr);

        return {
            success: true,
            moneyReceived: newReceived,
            amountDue: newAmountDue,
            paymentStatus: newPaymentStatus,
            productionHold: newProductionHold
        };
    }

    /**
     * Remove a line item during the designer's initial review, before the
     * salesperson approves the order. This avoids altering issued invoices,
     * approved versions, or an order with received payments.
     */
    public static async removeOrderItem(params: {
        orderId: number;
        itemId: number;
        actorSession: { userId: number; username: string; fullName: string; role: string };
    }): Promise<{ success: boolean; error?: string }> {
        const { orderId, itemId, actorSession } = params;
        const role = (actorSession.role || '').toLowerCase().trim();
        const isDesigner = ['furniture_designer', 'furniture designer', 'designer', 'make_designer'].includes(role);
        const isAdmin = ['admin', 'superadmin', 'manager'].includes(role);
        if (!isDesigner && !isAdmin) return { success: false, error: 'Only Furniture Designers or Administrators can remove an order item.' };

        const { data: order, error: orderErr } = await supabase.from('make_orders')
            .select('id, order_number, furniture_name, status, approval_status, bill_id, bill_item_id, money_received, custom_details')
            .eq('id', orderId).maybeSingle();
        if (orderErr) return { success: false, error: `Failed to load order: ${orderErr.message}` };
        if (!order) return { success: false, error: 'Order not found.' };
        if (order.approval_status !== 'awaiting_designer') {
            return { success: false, error: 'Items can only be removed during the initial designer review, before Sales approval. Use the order alteration workflow for later changes.' };
        }
        if (order.bill_id || order.bill_item_id) return { success: false, error: 'This order is linked to a bill and its items cannot be removed here.' };
        if (Number(order.money_received || 0) > 0) return { success: false, error: 'This order has received payment. Reconcile the payment before removing an item.' };

        const { data: items, error: itemsErr } = await supabase.from('make_order_items')
            .select('*').eq('order_id', orderId).order('id', { ascending: true });
        if (itemsErr) return { success: false, error: `Failed to load order items: ${itemsErr.message}` };
        const allItems = items || [];
        const target = allItems.find((item: any) => String(item.id) === String(itemId));
        if (!target) return { success: false, error: 'The selected item is no longer part of this order. Refresh Track Orders.' };
        if (allItems.length <= 1) return { success: false, error: 'An order must keep at least one product. Cancel the entire order if it should not proceed.' };

        const actorName = actorSession.fullName || actorSession.username || 'User';
        const remaining = allItems.filter((item: any) => String(item.id) !== String(itemId));
        const { error: auditErr } = await supabase.from('make_order_alteration_log').insert({
            order_id: orderId,
            order_number: order.order_number || '',
            altered_by: actorName,
            user_role: role,
            action_type: 'product_removed_during_designer_review',
            field_name: 'make_order_items',
            old_value: `${target.product_name} (Qty: ${target.quantity})`,
            new_value: 'Removed during designer review',
            reason: 'Designer review before Sales approval',
            altered_at: new Date().toISOString()
        });
        if (auditErr) return { success: false, error: `Could not record the item removal audit: ${auditErr.message}` };

        const { data: deleted, error: deleteErr } = await supabase.from('make_order_items').delete()
            .eq('id', itemId).eq('order_id', orderId).select('id').maybeSingle();
        if (deleteErr) return { success: false, error: `Failed to remove order item: ${deleteErr.message}` };
        if (!deleted) return { success: false, error: 'The item was not removed. Refresh Track Orders and try again.' };

        const totalQuantity = remaining.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0);
        const updatedDetails = order.custom_details && typeof order.custom_details === 'object'
            ? { ...order.custom_details, items: remaining }
            : order.custom_details;
        const { error: updateErr } = await supabase.from('make_orders').update({
            quantity: totalQuantity,
            furniture_name: remaining.length === 1 ? remaining[0].product_name : order.furniture_name,
            custom_details: updatedDetails,
            updated_at: new Date().toISOString()
        }).eq('id', orderId);
        if (updateErr) return { success: false, error: `Item was removed, but order summary could not be refreshed: ${updateErr.message}. Contact an administrator before approval.` };

        const { error: timelineErr } = await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: order.status,
            note: `Furniture Designer removed ${target.product_name} (Qty: ${target.quantity}) during initial review.`,
            updated_by: `${actorName} (${role})`
        });
        if (timelineErr) console.error('[MakeOrderService] Failed to add item removal timeline entry:', timelineErr);
        return { success: true };
    }

    public static async updateDesignerOrderItemQuantity(params: {
        orderId: number;
        itemId: number;
        quantity: number;
        actorSession: { userId: number; username: string; fullName: string; role: string };
    }): Promise<{ success: boolean; error?: string }> {
        const { orderId, itemId, quantity, actorSession } = params;
        const role = (actorSession.role || '').toLowerCase().trim();
        if (!['furniture_designer', 'furniture designer', 'designer', 'make_designer', 'admin', 'superadmin', 'manager'].includes(role)) {
            return { success: false, error: 'Only Furniture Designers or Administrators can change item quantities during initial review.' };
        }
        if (!Number.isInteger(quantity) || quantity < 1) return { success: false, error: 'Quantity must be a positive whole number.' };

        const { data: order, error: orderErr } = await supabase.from('make_orders')
            .select('id, order_number, status, approval_status, bill_id, bill_item_id, money_received, custom_details')
            .eq('id', orderId).maybeSingle();
        if (orderErr) return { success: false, error: `Failed to load order: ${orderErr.message}` };
        if (!order) return { success: false, error: 'Order not found.' };
        if (order.approval_status !== 'awaiting_designer') return { success: false, error: 'Item quantities can only be changed during initial designer review, before Sales approval.' };
        if (order.bill_id || order.bill_item_id) return { success: false, error: 'This order is linked to a bill and its items cannot be changed here.' };
        if (Number(order.money_received || 0) > 0) return { success: false, error: 'This order has received payment. Reconcile the payment before changing item quantities.' };

        const { data: items, error: itemsErr } = await supabase.from('make_order_items')
            .select('*').eq('order_id', orderId).order('id', { ascending: true });
        if (itemsErr) return { success: false, error: `Failed to load order items: ${itemsErr.message}` };
        const allItems = items || [];
        const target = allItems.find((item: any) => String(item.id) === String(itemId));
        if (!target) return { success: false, error: 'The selected item is no longer part of this order. Refresh Track Orders.' };
        const oldQuantity = Number(target.quantity) || 1;
        if (oldQuantity === quantity) return { success: true };

        const actorName = actorSession.fullName || actorSession.username || 'User';
        const { error: auditErr } = await supabase.from('make_order_alteration_log').insert({
            order_id: orderId,
            order_number: order.order_number || '',
            altered_by: actorName,
            user_role: role,
            action_type: 'quantity_change_during_designer_review',
            field_name: `quantity (item #${itemId})`,
            old_value: String(oldQuantity),
            new_value: String(quantity),
            reason: 'Designer review before Sales approval',
            altered_at: new Date().toISOString()
        });
        if (auditErr) return { success: false, error: `Could not record the quantity-change audit: ${auditErr.message}` };

        const { data: changedItem, error: itemErr } = await supabase.from('make_order_items')
            .update({ quantity }).eq('id', itemId).eq('order_id', orderId).select('id').maybeSingle();
        if (itemErr) return { success: false, error: `Failed to update item quantity: ${itemErr.message}` };
        if (!changedItem) return { success: false, error: 'The item was not updated. Refresh Track Orders and try again.' };

        const updatedItems = allItems.map((item: any) => String(item.id) === String(itemId) ? { ...item, quantity } : item);
        const totalQuantity = updatedItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0);
        const updatedDetails = order.custom_details && typeof order.custom_details === 'object'
            ? { ...order.custom_details, items: updatedItems }
            : order.custom_details;
        const { error: orderUpdateErr } = await supabase.from('make_orders').update({
            quantity: totalQuantity,
            custom_details: updatedDetails,
            updated_at: new Date().toISOString()
        }).eq('id', orderId);
        if (orderUpdateErr) return { success: false, error: `Item quantity changed, but the order summary could not be refreshed: ${orderUpdateErr.message}. Contact an administrator before approval.` };

        const { error: timelineErr } = await supabase.from('make_order_updates').insert({
            order_id: orderId,
            status: order.status,
            note: `${target.product_name} quantity changed from ${oldQuantity} to ${quantity} during designer review.`,
            updated_by: `${actorName} (${role})`
        });
        if (timelineErr) console.error('[MakeOrderService] Failed to add item quantity timeline entry:', timelineErr);
        return { success: true };
    }

    /**
     * Retrieve payment ledger history for an order.
     */
    public static async getOrderPayments(orderId: number): Promise<{ success: boolean; payments: any[]; error?: string }> {
        try {
            const { data, error } = await supabase
                .from('make_order_payments')
                .select('*')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('[MakeOrderService] getOrderPayments error:', error.message);
                return { success: false, payments: [], error: error.message };
            }

            return { success: true, payments: data || [] };
        } catch (err: any) {
            return { success: false, payments: [], error: err.message || 'Failed to load payment history.' };
        }
    }
}
