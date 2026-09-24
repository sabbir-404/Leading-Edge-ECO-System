/**
 * make.schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Strict Zod Validation Schemas for MAKE Module IPC Payloads.
 */

import { z } from 'zod';

export const MakeOrderItemInputSchema = z.object({
    product_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    product_name: z.string().min(1, 'Product item name is required').max(255),
    spec_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    spec_name: z.string().max(255).nullable().optional(),
    spec_details: z.string().nullable().optional(),
    size_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    dimensions_text: z.string().nullable().optional(),
    color_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    color_name: z.string().max(100).nullable().optional(),
    quantity: z.number().positive('Quantity must be greater than zero').default(1),
    item_cost_price: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
    item_sale_price: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
    is_customized: z.boolean().default(false),
    custom_dimensions: z.string().nullable().optional(),
    designer_notes: z.string().nullable().optional()
});

export const CreateMakeOrderSchema = z.object({
    furniture_name: z.string().min(1, 'Order furniture title is required').max(255),
    description: z.string().optional(),
    priority: z.enum(['Low', 'Normal', 'High', 'Urgent']).default('Normal'),
    delivery_date: z.string().nullable().optional(),
    target_delivery_date: z.string().nullable().optional(),
    requested_delivery_date: z.string().nullable().optional(),
    salesman_id: z.number().int().positive().nullable().optional(),
    customer_id: z.union([z.string(), z.number()]).nullable().optional(),
    customer_name: z.string({ required_error: 'Customer name is required' }).min(1, 'Customer name is required').max(255),
    customer_phone: z.string().max(50).nullable().optional().refine(val => {
        if (!val || val.trim() === '') return true;
        const cleaned = val.trim();
        // Reject dummy placeholders
        const dummyPatterns = [/^(0)\1+$/, /^n\/?a$/i, /^unknown$/i, /^none$/i, /^test$/i];
        if (dummyPatterns.some(p => p.test(cleaned))) return false;
        // Must contain valid phone characters with at least 6 digits
        const digits = cleaned.replace(/\D/g, '');
        return digits.length >= 6 && /^[\d\s+\-()./]+$/.test(cleaned);
    }, { message: 'Invalid customer phone number format. Provide a valid phone number or leave empty.' }),
    customer_email: z.string().max(100).nullable().optional(),
    shipping_address: z.string().nullable().optional(),
    delivery_address: z.string().nullable().optional(),
    location_landmark: z.string().nullable().optional(),
    receiver_name: z.string().max(255).nullable().optional(),
    receiver_phone: z.string().max(50).nullable().optional(),
    special_instructions: z.string().nullable().optional(),
    cost_price: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
    sale_price: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
    reference_bill_no: z.string().nullable().optional(),
    invoice_attachments: z.array(z.string()).optional(),
    items: z.array(MakeOrderItemInputSchema).min(1, 'At least one product item must be included in the order.')
});

export const ApproveMakeOrderSchema = z.object({
    orderId: z.union([z.string().min(1), z.number()]),
    approvedBy: z.string().optional(),
    notes: z.string().optional(),
    override: z.object({
        overrideReason: z.string().min(1, 'Override reason is required'),
        authorizedBy: z.string().min(1, 'Authorized manager name is required'),
        timestamp: z.string().optional()
    }).nullable().optional()
});

export const DesignerSaveSpecsAndPricingSchema = z.object({
    orderId: z.union([z.string().min(1), z.number()]),
    costPrice: z.union([z.number().nonnegative(), z.string()]).optional(),
    salePrice: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
    items: z.array(z.object({
        id: z.union([z.number().int().positive(), z.string()]).optional(),
        quantity: z.number().positive(),
        item_cost_price: z.union([z.number().nonnegative(), z.string()]).optional(),
        item_sale_price: z.union([z.number().nonnegative(), z.string(), z.null()]).optional(),
        spec_name: z.string().optional(),
        size_label: z.string().optional(),
        color_name: z.string().optional(),
        salesperson_note: z.string().nullable().optional(),
        designer_notes: z.string().nullable().optional(),
        technical_drawing_url: z.string().nullable().optional()
    })).optional(),
    modificationReason: z.string().optional()
});

export const UpdateProductionStageSchema = z.object({
    orderId: z.union([z.string().min(1), z.number()]),
    stage: z.string().min(1, 'Production stage cannot be empty'),
    note: z.string().optional(),
    photoPath: z.string().optional(),
    photoBase64: z.string().optional(),
    photoUrl: z.string().nullable().optional()
});

export const AlterMakeOrderSchema = z.object({
    orderId: z.union([z.string().min(1), z.number()]),
    changes: z.record(z.any()),
    alteredBy: z.string().optional()
});

export const DeleteMakeOrderSchema = z.object({
    orderId: z.union([z.string().min(1), z.number()]),
    reason: z.string().optional()
});

export const CatalogProductSchema = z.object({
    id: z.union([z.number().int().positive(), z.string()]).optional(),
    product_code: z.string().min(1).max(50),
    product_name: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    category_id: z.union([z.number().int().positive(), z.string(), z.null()]).optional(),
    category: z.string().nullable().optional(),
    main_image: z.string().nullable().optional(),
    is_active: z.boolean().default(true)
});

export const CatalogSpecSchema = z.object({
    id: z.union([z.number().int().positive(), z.string()]).optional(),
    product_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    spec_code: z.string().max(50).nullable().optional(),
    spec_name: z.string().min(1).max(255),
    spec_details: z.string().nullable().optional(),
    is_active: z.boolean().default(true)
});

export const CatalogSizeSchema = z.object({
    id: z.union([z.number().int().positive(), z.string()]).optional(),
    product_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    spec_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    size_label: z.string().nullable().optional(),
    length: z.union([z.number(), z.string(), z.null()]).optional(),
    width: z.union([z.number(), z.string(), z.null()]).optional(),
    height: z.union([z.number(), z.string(), z.null()]).optional(),
    diameter: z.union([z.number(), z.string(), z.null()]).optional(),
    unit: z.string().default('mm'),
    is_active: z.boolean().default(true)
});

export const CatalogColorSchema = z.object({
    id: z.union([z.number().int().positive(), z.string()]).optional(),
    product_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    spec_id: z.union([z.number().int().positive(), z.string()]).nullable().optional(),
    color_name: z.string().min(1).max(100),
    color_code: z.string().max(50).nullable().optional(),
    image_url: z.string().nullable().optional(),
    is_active: z.boolean().default(true)
});

export const GlobalAttributeSchema = z.object({
    type: z.enum(['spec', 'size', 'color', 'category']),
    id: z.union([z.number().int().positive(), z.string()]).optional(),
    name: z.string().optional(),
    spec_name: z.string().optional(),
    size_label: z.string().optional(),
    color_name: z.string().optional(),
    category_name: z.string().optional(),
    spec_code: z.string().nullable().optional(),
    spec_details: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    details: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    length: z.union([z.number(), z.string(), z.null()]).optional(),
    width: z.union([z.number(), z.string(), z.null()]).optional(),
    height: z.union([z.number(), z.string(), z.null()]).optional(),
    diameter: z.union([z.number(), z.string(), z.null()]).optional(),
    unit: z.string().optional().default('mm'),
    color_code: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    is_active: z.boolean().default(true)
}).refine(data => {
    return !!(data.name || data.spec_name || data.size_label || data.color_name || data.category_name);
}, { message: 'Attribute name/label is required' });

export const AssignProductAttributesSchema = z.object({
    productId: z.union([z.string(), z.number()]),
    specIds: z.array(z.union([z.number(), z.string()])).optional(),
    sizeIds: z.array(z.union([z.number(), z.string()])).optional(),
    colorIds: z.array(z.union([z.number(), z.string()])).optional()
});

export const SearchCatalogProductsSchema = z.object({
    query: z.string().optional().default(''),
    category: z.string().optional(),
    activeOnly: z.boolean().optional().default(true)
});

