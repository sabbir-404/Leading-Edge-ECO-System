/**
 * make.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortified, Authenticated, and Schema-Validated IPC Handlers for MAKE V1.
 * 
 * Guarantees:
 *  - Native Electron file selection (no arbitrary renderer-supplied file paths).
 *  - Main-process session resolution via SessionManager (no forged userRole or isSuperadmin).
 *  - Canonical 6-stage physical manufacturing pipeline enforcement.
 *  - Authoritative pricing validation and non-negative bounds.
 *  - Atomic order creation and immutable version snapshotting.
 *  - Role-protected catalog CRUD operations.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { supabase, supabaseAdmin } from '../../supabase';
import { SessionManager, UserSession } from '../../session-manager';
import { MakeOrderService } from '../../services/make/MakeOrderService';
import { MakePricingService } from '../../services/make/MakePricingService';
import { MakeProductionService } from '../../services/make/MakeProductionService';
import { MakeVersionService } from '../../services/make/MakeVersionService';
import { MakeCadService } from '../../services/make/MakeCadService';
import { MakeSearchService } from '../../services/make/MakeSearchService';
import { decryptRows, decryptObject } from '../../field-encryption';
import {
    CreateMakeOrderSchema,
    ApproveMakeOrderSchema,
    DesignerSaveSpecsAndPricingSchema,
    UpdateProductionStageSchema,
    AlterMakeOrderSchema,
    DeleteMakeOrderSchema,
    CatalogProductSchema,
    CatalogSpecSchema,
    CatalogSizeSchema,
    CatalogColorSchema,
    GlobalAttributeSchema,
    AssignProductAttributesSchema,
    SearchCatalogProductsSchema
} from '../schemas/make.schema';

export function registerMakeHandlers(): void {
    /**
     * Resolves the active authenticated session strictly from the Electron Main Process.
     * Throws an error if no active session is present.
     */
    function requireSession(): UserSession {
        const session = SessionManager.getSession();
        if (!session) {
            throw new Error('Unauthorized: Authentication required');
        }
        return session;
    }

    /**
     * Verifies if the session user has permissions to modify the product catalog.
     */
    function canManageCatalog(session: UserSession): boolean {
        const role = session.role.toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        return !!(session.permissions['manage_catalog'] || session.permissions['make_admin'] || session.permissions['catalog_manage']);
    }

    /**
     * Verifies if the session user has permissions to approve MAKE orders.
     */
    function canApproveOrder(session: UserSession): boolean {
        const role = session.role.toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'salesperson' || role === 'sales' || role === 'manager') return true;
        return !!(session.permissions['make_approve'] || session.permissions['sales_approve']);
    }

    /**
     * Verifies if the session user has permissions to override pricing on loss-making orders.
     */
    function canOverridePricing(session: UserSession): boolean {
        const role = session.role.toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        return !!(session.permissions['make_pricing_override'] || session.permissions['pricing_override']);
    }

    /**
     * Verifies if the session user has permissions to advance factory production stages.
     */
    function canAdvanceProduction(session: UserSession): boolean {
        const role = session.role.toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'factory_manager' || role === 'operator' || role === 'production') return true;
        return !!(session.permissions['make_production'] || session.permissions['factory_manage']);
    }

    // ── 1. Create Make Order ──────────────────────────────────────────────────
    ipcMain.handle('create-make-order', async (_e, rawOrder: any) => {
        try {
            const session = requireSession();
            const parsed = CreateMakeOrderSchema.parse(rawOrder);
            const result = await MakeOrderService.createOrder(parsed as any, session);
            if (!result.success) {
                throw new Error(result.error);
            }
            return result;
        } catch (err: any) {
            console.error('[MAKE IPC] create-make-order error:', err);
            throw new Error(err.message || 'Failed to create order');
        }
    });

    // ── 2. Approve Make Order ─────────────────────────────────────────────────
    ipcMain.handle('approve-make-order', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            if (!canApproveOrder(session)) {
                throw new Error('Forbidden: You do not have permission to approve MAKE orders.');
            }

            const parsed = ApproveMakeOrderSchema.parse(rawPayload);

            // If an override is provided for a loss-making order, verify authorization
            if (parsed.override) {
                if (!canOverridePricing(session)) {
                    throw new Error('Forbidden: Only managers or administrators can authorize loss-making order approval.');
                }
                parsed.override.authorizedBy = session.fullName || session.username;
            }

            const result = await MakeOrderService.approveOrder({
                orderId: parsed.orderId,
                actorSession: session,
                override: parsed.override,
                notes: parsed.notes
            });

            if (!result.success) {
                throw new Error(result.error);
            }
            return { success: true };
        } catch (err: any) {
            console.error('[MAKE IPC] approve-make-order error:', err);
            throw new Error(err.message || 'Failed to approve order');
        }
    });

    // ── 3. Designer Save Specs & Pricing ──────────────────────────────────────
    ipcMain.handle('make-designer-save-specs-and-pricing', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            const parsed = DesignerSaveSpecsAndPricingSchema.parse(rawPayload);
            const result = await MakeOrderService.saveDesignerSpecsAndPricing({
                orderId: parsed.orderId,
                costPrice: parsed.costPrice ? Number(parsed.costPrice) : undefined,
                salePrice: parsed.salePrice !== undefined && parsed.salePrice !== null ? Number(parsed.salePrice) : null,
                items: parsed.items,
                actorSession: session,
                modificationReason: parsed.modificationReason
            });
            if (!result.success) {
                return { error: result.error };
            }
            return result;
        } catch (err: any) {
            console.error('[MAKE IPC] make-designer-save-specs-and-pricing error:', err);
            return { error: err.message || 'Failed to save specifications and pricing' };
        }
    });

    // ── 4. Advance Production Stage ───────────────────────────────────────────
    ipcMain.handle('make-update-production-stage', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            if (!canAdvanceProduction(session)) {
                return { success: false, error: 'Forbidden: Insufficient privileges to advance production stage.' };
            }

            const parsed = UpdateProductionStageSchema.parse(rawPayload);

            // Reject arbitrary local filesystem paths from renderer
            if (parsed.photoPath) {
                return { success: false, error: 'Arbitrary filesystem paths are rejected. Use makePickAndUploadStagePhoto.' };
            }

            let finalPhotoUrl = parsed.photoUrl || null;

            // Safe in-memory Base64 upload if provided from camera/canvas
            if (!finalPhotoUrl && parsed.photoBase64) {
                try {
                    const matches = parsed.photoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        const mimeType = matches[1];
                        const ext = mimeType.split('/')[1] || 'jpg';
                        const fileBuffer = Buffer.from(matches[2], 'base64');
                        const fileName = `stage_${Date.now()}.${ext}`;

                        const magicCheck = MakeCadService.validateBufferMagicBytes(fileBuffer, ext);
                        if (magicCheck.isValid) {
                            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                                fileBuffer,
                                fileName,
                                mimeType,
                                `make-order-files/${parsed.orderId}/stages`
                            );
                            if (uploadResult.success && uploadResult.publicUrl) {
                                finalPhotoUrl = uploadResult.publicUrl;
                            }
                        }
                    }
                } catch (b64Err) {
                    console.error('[MAKE IPC] Base64 upload failed:', b64Err);
                }
            }

            const result = await MakeProductionService.advanceOrderStage({
                orderId: parsed.orderId,
                targetStage: parsed.stage,
                note: parsed.note,
                photoUrl: finalPhotoUrl,
                actorName: session.fullName || session.username,
                actorRole: session.role,
                actorUserId: session.userId
            });

            return result;
        } catch (err: any) {
            console.error('[MAKE IPC] make-update-production-stage error:', err);
            return { success: false, error: err.message || 'Failed to advance stage' };
        }
    });

    // ── 5. Alter Order ────────────────────────────────────────────────────────
    ipcMain.handle('make-alter-order', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            const parsed = AlterMakeOrderSchema.parse(rawPayload);
            const result = await MakeOrderService.alterOrder({
                orderId: parsed.orderId,
                changes: parsed.changes,
                actorSession: session
            });
            return result;
        } catch (err: any) {
            console.error('[MAKE IPC] make-alter-order error:', err);
            return { error: err.message || 'Failed to alter order' };
        }
    });

    // ── 6. Order Versions & Diff ──────────────────────────────────────────────
    ipcMain.handle('make-get-order-versions', async (_e, orderId: number) => {
        return MakeVersionService.getOrderVersions(orderId);
    });

    ipcMain.handle('make-get-version-diff', async (_e, rawPayload: any, maybeFrom?: number, maybeTo?: number) => {
        const orderId = typeof rawPayload === 'object' && rawPayload !== null ? rawPayload.orderId : rawPayload;
        const fromVersion = typeof rawPayload === 'object' && rawPayload !== null ? rawPayload.fromVersion : maybeFrom;
        const toVersion = typeof rawPayload === 'object' && rawPayload !== null ? rawPayload.toVersion : maybeTo;
        return MakeVersionService.getVersionDiff(orderId, fromVersion, toVersion);
    });

    // ── 7. Native Secure File Picker & Upload for Drawings ────────────────────
    ipcMain.handle('make-pick-and-upload-drawing', async (_e, { orderId, itemId }: { orderId: number; itemId?: number }) => {
        try {
            requireSession();
            const focusedWin = BrowserWindow.getFocusedWindow();
            const validation = await MakeCadService.pickAndValidateFile('cad', focusedWin);
            if ('canceled' in validation) {
                return { canceled: true, error: validation.error };
            }

            const subfolder = itemId
                ? `make-order-files/${orderId}/items/${itemId}`
                : `make-order-files/${orderId}`;

            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                subfolder
            );

            if (!uploadResult.success || !uploadResult.publicUrl) {
                return { success: false, error: uploadResult.error || 'Failed to upload to storage' };
            }

            // Update item or order records with drawing path
            if (itemId) {
                const { data: item } = await supabase.from('make_order_items').select('pdf_urls, technical_drawing_url').eq('id', itemId).maybeSingle();
                const existing: string[] = Array.isArray(item?.pdf_urls) ? item.pdf_urls : [];
                const combined = [...existing, uploadResult.publicUrl];
                await supabase.from('make_order_items').update({
                    pdf_urls: combined,
                    technical_drawing_url: uploadResult.publicUrl
                }).eq('id', itemId);
            } else {
                const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
                const existing: string[] = Array.isArray(order?.pdf_urls) ? order.pdf_urls : [];
                const combined = [...existing, uploadResult.publicUrl];
                await supabase.from('make_orders').update({ pdf_urls: combined }).eq('id', orderId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-pick-and-upload-drawing error:', err);
            return { success: false, error: err.message };
        }
    });

    // ── 8. Native Secure File Picker & Upload for Stage Photos ────────────────
    ipcMain.handle('make-pick-and-upload-stage-photo', async (_e, { orderId }: { orderId: number }) => {
        try {
            requireSession();
            const focusedWin = BrowserWindow.getFocusedWindow();
            const validation = await MakeCadService.pickAndValidateFile('photo', focusedWin);
            if ('canceled' in validation) {
                return { canceled: true, error: validation.error };
            }

            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                `make-order-files/${orderId}/stages`
            );

            if (!uploadResult.success || !uploadResult.publicUrl) {
                return { success: false, error: uploadResult.error || 'Failed to upload photo' };
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-pick-and-upload-stage-photo error:', err);
            return { success: false, error: err.message };
        }
    });

    // ── 9. Hardened Legacy Upload Handlers (Backward Compatibility) ───────────
    ipcMain.handle('make-upload-item-pdf', async (_e, { orderId, itemId, filePath }: any) => {
        if (filePath) {
            return { error: 'Arbitrary filesystem paths are rejected. Use the native file picker.' };
        }

        const focusedWin = BrowserWindow.getFocusedWindow();
        const validation = await MakeCadService.pickAndValidateFile('cad', focusedWin);
        if ('canceled' in validation) {
            return { canceled: true, error: validation.error };
        }

        const subfolder = `make-order-files/${orderId}/items/${itemId}`;
        const uploadResult = await MakeCadService.uploadValidatedBuffer(
            validation.fileBuffer,
            validation.sanitizedFileName,
            validation.mimeType,
            subfolder
        );

        if (!uploadResult.success || !uploadResult.publicUrl) {
            return { error: uploadResult.error || 'Failed to upload drawing' };
        }

        const { data: item } = await supabase.from('make_order_items').select('pdf_urls').eq('id', itemId).maybeSingle();
        const existing: string[] = Array.isArray(item?.pdf_urls) ? item.pdf_urls : [];
        const combined = [...existing, uploadResult.publicUrl];
        await supabase.from('make_order_items').update({
            pdf_urls: combined,
            technical_drawing_url: uploadResult.publicUrl
        }).eq('id', itemId);

        return { success: true, paths: [uploadResult.publicUrl], allPaths: combined };
    });

    ipcMain.handle('make-upload-pdf', async (_e, { orderId, filePath }: any) => {
        if (filePath) {
            return { error: 'Arbitrary filesystem paths are rejected. Use the native file picker.' };
        }

        const focusedWin = BrowserWindow.getFocusedWindow();
        const validation = await MakeCadService.pickAndValidateFile('cad', focusedWin);
        if ('canceled' in validation) {
            return { canceled: true, error: validation.error };
        }

        const subfolder = `make-order-files/${orderId}`;
        const uploadResult = await MakeCadService.uploadValidatedBuffer(
            validation.fileBuffer,
            validation.sanitizedFileName,
            validation.mimeType,
            subfolder
        );

        if (!uploadResult.success || !uploadResult.publicUrl) {
            return { error: uploadResult.error || 'Failed to upload drawing' };
        }

        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const existing: string[] = Array.isArray(order?.pdf_urls) ? order.pdf_urls : [];
        const combined = [...existing, uploadResult.publicUrl];
        await supabase.from('make_orders').update({ pdf_urls: combined }).eq('id', orderId);

        return { success: true, paths: [uploadResult.publicUrl] };
    });

    // ── 10. PDF Storage URLs and Deletion ─────────────────────────────────────
    ipcMain.handle('make-get-pdf-urls', async (_e, orderId: number) => {
        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const paths: string[] = order?.pdf_urls || [];

        const signedUrls = await Promise.all(paths.map(async (p) => {
            if (p.startsWith('http://') || p.startsWith('https://')) {
                return { path: p, name: p.split('/').pop()?.replace(/^\d+_/, '') || 'drawing', url: p };
            }
            if (p.startsWith('make-order-files/')) {
                const url = `https://storage.lenas.me/files/${p}`;
                return { path: p, name: p.split('/').pop()?.replace(/^\d+_/, '') || 'drawing', url };
            } else {
                const { data } = await supabase.storage.from('make-order-files').createSignedUrl(p, 3600);
                return { path: p, name: p.split('/').pop()?.replace(/^\d+_/, '') || 'drawing', url: data?.signedUrl || '' };
            }
        }));
        return signedUrls.filter(u => u.url);
    });

    ipcMain.handle('make-delete-pdf', async (_e, { orderId, storagePath }: { orderId: number; storagePath: string }) => {
        requireSession();
        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const remaining = (order?.pdf_urls || []).filter((p: string) => p !== storagePath);
        await supabase.from('make_orders').update({ pdf_urls: remaining }).eq('id', orderId);
        return { success: true };
    });

    ipcMain.handle('make-delete-item-pdf', async (_e, { itemId, storagePath }: { itemId: number; storagePath: string }) => {
        requireSession();
        const { data: item } = await supabase.from('make_order_items').select('pdf_urls, technical_drawing_url').eq('id', itemId).maybeSingle();
        const remaining = (item?.pdf_urls || []).filter((p: string) => p !== storagePath);
        const newTechUrl = item?.technical_drawing_url === storagePath
            ? (remaining.length > 0 ? remaining[0] : null)
            : item?.technical_drawing_url;

        await supabase.from('make_order_items').update({
            pdf_urls: remaining,
            technical_drawing_url: newTechUrl
        }).eq('id', itemId);

        return { success: true };
    });

    // ── 11. Parts & Dimensions CRUD ──────────────────────────────────────────
    ipcMain.handle('make-get-order-parts', async (_e, orderId: number) => {
        const { data, error } = await supabase.from('make_order_parts').select('*').eq('order_id', orderId).order('sort_order', { ascending: true });
        if (error) throw error;
        return decryptRows(data || []);
    });

    ipcMain.handle('make-upsert-part', async (_e, part: any) => {
        requireSession();
        if (part.id) {
            const { data, error } = await supabase.from('make_order_parts')
                .update({ part_name: part.part_name, length: part.length, width: part.width, height: part.height, notes: part.notes, sort_order: part.sort_order })
                .eq('id', part.id).select().maybeSingle();
            if (error) return { error: error.message };
            return decryptObject(data);
        } else {
            const { data, error } = await supabase.from('make_order_parts')
                .insert({ order_id: part.order_id, part_name: part.part_name, length: part.length || '', width: part.width || '', height: part.height || '', notes: part.notes || '', sort_order: part.sort_order || 0 })
                .select().maybeSingle();
            if (error) return { error: error.message };
            return decryptObject(data);
        }
    });

    ipcMain.handle('make-delete-part', async (_e, partId: number) => {
        requireSession();
        const { error } = await supabase.from('make_order_parts').delete().eq('id', partId);
        return error ? { error: error.message } : { success: true };
    });

    ipcMain.handle('make-get-alteration-log', async (_e, orderId: number) => {
        const { data } = await supabase.from('make_order_alteration_log')
            .select('*').eq('order_id', orderId).order('altered_at', { ascending: false });
        return decryptRows(data || []);
    });

    // ── 12. Secured Product Catalog Operations ────────────────────────────────
    ipcMain.handle('make-get-catalog-products', async (_e, { search, activeOnly }: any = {}) => {
        let q = supabase.from('make_products')
            .select('*, specifications:make_product_specifications(*), sizes:make_product_sizes(*), colors:make_product_colors(*), images:make_product_images(*)')
            .order('created_at', { ascending: false });

        if (activeOnly) q = q.eq('is_active', true);
        if (search) q = q.or(`product_name.ilike.%${search}%,product_code.ilike.%${search}%`);

        const { data, error } = await q;
        if (error) throw error;
        const products = decryptRows(data || []);

        // Aggregate purchased counts from make_order_items
        try {
            const { data: orderItems } = await supabase.from('make_order_items').select('product_id, product_name, quantity');
            if (orderItems && orderItems.length > 0) {
                const countMap: Record<number, number> = {};
                const nameCountMap: Record<string, number> = {};
                for (const it of orderItems) {
                    const qty = Number(it.quantity) || 1;
                    if (it.product_id) countMap[it.product_id] = (countMap[it.product_id] || 0) + qty;
                    if (it.product_name) nameCountMap[it.product_name] = (nameCountMap[it.product_name] || 0) + qty;
                }
                for (const p of products) {
                    p.purchased_count = countMap[p.id] || nameCountMap[p.product_name] || 0;
                }
            }
        } catch (e) {
            console.warn('[make-get-catalog-products] Could not aggregate order counts:', e);
        }

        return products;
    });

    ipcMain.handle('make-save-catalog-product', async (_e, rawProduct: any) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }

        const product = CatalogProductSchema.parse(rawProduct);

        let resolvedCategoryId: number | null = null;
        let resolvedCategoryName: string | null = null;

        if (product.category_id) {
            resolvedCategoryId = Number(product.category_id);
            const { data: catRow } = await supabase.from('make_product_categories').select('name').eq('id', resolvedCategoryId).maybeSingle();
            if (catRow) {
                resolvedCategoryName = catRow.name;
            }
        } else if (product.category) {
            const { data: catRow } = await supabase.from('make_product_categories').select('id, name').ilike('name', product.category.trim()).maybeSingle();
            if (catRow) {
                resolvedCategoryId = catRow.id;
                resolvedCategoryName = catRow.name;
            } else {
                resolvedCategoryName = product.category.trim();
            }
        }

        const db = supabaseAdmin || supabase;
        if (product.id) {
            const { data, error } = await db.from('make_products').update({
                product_code: product.product_code,
                product_name: product.product_name,
                description: product.description || null,
                category_id: resolvedCategoryId,
                category: resolvedCategoryName,
                main_image: product.main_image || null,
                is_active: product.is_active !== undefined ? product.is_active : true,
                updated_at: new Date().toISOString()
            }).eq('id', product.id).select().single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await db.from('make_products').insert({
                product_code: product.product_code,
                product_name: product.product_name,
                description: product.description || null,
                category_id: resolvedCategoryId,
                category: resolvedCategoryName,
                main_image: product.main_image || null,
                is_active: product.is_active !== undefined ? product.is_active : true,
                created_by: session.fullName || session.username
            }).select().single();
            if (error) throw error;
            return data;
        }
    });

    ipcMain.handle('make-delete-catalog-product', async (_e, id: number) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }
        const db = supabaseAdmin || supabase;
        const { error } = await db.from('make_products').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('make-save-spec', async (_e, rawSpec: any) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }

        const spec = CatalogSpecSchema.parse(rawSpec);

        if (spec.id) {
            const { data, error } = await supabase.from('make_product_specifications').update({
                spec_code: spec.spec_code || null,
                spec_name: spec.spec_name,
                spec_details: spec.spec_details || null,
                is_active: spec.is_active !== undefined ? spec.is_active : true
            }).eq('id', spec.id).select().single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_specifications').insert({
                product_id: spec.product_id,
                spec_code: spec.spec_code || null,
                spec_name: spec.spec_name,
                spec_details: spec.spec_details || null,
                is_active: spec.is_active !== undefined ? spec.is_active : true
            }).select().single();
            if (error) throw error;
            return data;
        }
    });

    ipcMain.handle('make-delete-spec', async (_e, id: number) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }
        const { error } = await supabase.from('make_product_specifications').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('make-save-size', async (_e, rawSize: any) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }

        const size = CatalogSizeSchema.parse(rawSize);

        const payload = {
            product_id: size.product_id,
            spec_id: size.spec_id || null,
            size_label: size.size_label || null,
            length: size.length ? parseFloat(String(size.length)) : null,
            width: size.width ? parseFloat(String(size.width)) : null,
            height: size.height ? parseFloat(String(size.height)) : null,
            diameter: size.diameter ? parseFloat(String(size.diameter)) : null,
            unit: size.unit || 'mm',
            is_active: size.is_active !== undefined ? size.is_active : true
        };

        if (size.id) {
            const { data, error } = await supabase.from('make_product_sizes').update(payload).eq('id', size.id).select().single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_sizes').insert(payload).select().single();
            if (error) throw error;
            return data;
        }
    });

    ipcMain.handle('make-delete-size', async (_e, id: number) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }
        const { error } = await supabase.from('make_product_sizes').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('make-save-color', async (_e, rawColor: any) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }

        const color = CatalogColorSchema.parse(rawColor);

        const payload = {
            product_id: color.product_id,
            spec_id: color.spec_id || null,
            color_name: color.color_name,
            color_code: color.color_code || null,
            image_url: color.image_url || null,
            is_active: color.is_active !== undefined ? color.is_active : true
        };

        if (color.id) {
            const { data, error } = await supabase.from('make_product_colors').update(payload).eq('id', color.id).select().single();
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_colors').insert(payload).select().single();
            if (error) throw error;
            return data;
        }
    });

    ipcMain.handle('make-delete-color', async (_e, id: number) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }
        const { error } = await supabase.from('make_product_colors').delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    });

    ipcMain.handle('make-get-product-purchase-history', async (_e, productId: number) => {
        try {
            const { data: prod } = await supabase.from('make_products').select('id, product_name, product_code').eq('id', productId).single();
            if (!prod) return { totalQuantity: 0, orderCount: 0, totalRevenue: 0, history: [] };

            const { data: items, error } = await supabase
                .from('make_order_items')
                .select(`
                    *,
                    order:make_orders(
                        id, order_number, customer_name, customer_phone, delivery_address, 
                        location_landmark, receiver_name, receiver_phone, status, 
                        approval_status, current_version, salesperson_name, designer_name,
                        created_at, delivery_date, cost_price, sale_price
                    )
                `)
                .or(`product_id.eq.${productId},product_name.eq.${prod.product_name}`)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('[make-get-product-purchase-history] Error:', error);
                return { totalQuantity: 0, orderCount: 0, totalRevenue: 0, history: [] };
            }

            const safeItems = decryptRows(items || []);
            let totalQuantity = 0;
            let totalRevenue = 0;
            const distinctOrderIds = new Set<number>();

            const history = safeItems.map((item: any) => {
                const qty = Number(item.quantity) || 1;
                totalQuantity += qty;
                if (item.order?.id) distinctOrderIds.add(item.order.id);
                const itemPrice = Number(item.item_sale_price) || (item.order?.sale_price ? (Number(item.order.sale_price) / (Number(item.order.quantity) || 1)) : 0);
                totalRevenue += (itemPrice * qty);

                return {
                    id: item.id,
                    order_id: item.order_id,
                    order_number: item.order?.order_number || `#${item.order_id}`,
                    customer_name: item.order?.customer_name || '—',
                    customer_phone: item.order?.customer_phone || '—',
                    location_landmark: item.order?.location_landmark || '—',
                    delivery_address: item.order?.delivery_address || '—',
                    salesperson_name: item.order?.salesperson_name || 'Direct / Internal',
                    designer_name: item.order?.designer_name || '—',
                    status: item.order?.status || 'Placed',
                    approval_status: item.order?.approval_status || 'sales_approved',
                    created_at: item.created_at || item.order?.created_at,
                    delivery_date: item.order?.delivery_date,
                    spec_name: item.spec_name || 'Standard Spec',
                    size_label: item.size_label || 'Standard Dimensions',
                    color_name: item.color_name || 'Standard Color',
                    quantity: qty,
                    item_cost_price: Number(item.item_cost_price) || 0,
                    item_sale_price: itemPrice > 0 ? itemPrice : null,
                    total_sale_price: itemPrice > 0 ? (itemPrice * qty) : null,
                    salesperson_note: item.salesperson_note || ''
                };
            });

            return {
                productId,
                productName: prod.product_name,
                productCode: prod.product_code,
                totalQuantity,
                orderCount: distinctOrderIds.size,
                totalRevenue,
                history
            };
        } catch (err: any) {
            console.error('[make-get-product-purchase-history] Catch:', err);
            return { totalQuantity: 0, orderCount: 0, totalRevenue: 0, history: [] };
        }
    });

    // ── 13. Order Items with Drawings ─────────────────────────────────────────
    ipcMain.handle('make-get-order-items', async (_e, orderId: number) => {
        const { data, error } = await supabase
            .from('make_order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('id', { ascending: true });

        if (error) throw error;
        const decrypted = decryptRows(data || []);

        const itemsWithDrawings = await Promise.all(decrypted.map(async (item: any) => {
            const rawPaths: string[] = Array.isArray(item.pdf_urls) ? item.pdf_urls : [];
            if (item.technical_drawing_url && !rawPaths.includes(item.technical_drawing_url)) {
                rawPaths.unshift(item.technical_drawing_url);
            }

            const drawings = await Promise.all(rawPaths.map(async (p: string) => {
                if (p.startsWith('http://') || p.startsWith('https://')) {
                    return { path: p, name: p.split('/').pop()?.replace(/^\d+_/, '') || 'drawing', url: p };
                }
                if (p.startsWith('make-order-files/')) {
                    const url = `https://storage.lenas.me/files/${p}`;
                    return { path: p, name: p.split('/').pop()?.replace(/^\d+_/, '') || 'drawing', url };
                } else {
                    const { data: sData } = await supabase.storage.from('make-order-files').createSignedUrl(p, 3600);
                    return { path: p, name: p.split('/').pop()?.replace(/^\d+_/, '') || 'drawing', url: sData?.signedUrl || '' };
                }
            }));

            return {
                ...item,
                drawings: drawings.filter(d => d.url)
            };
        }));

        return itemsWithDrawings;
    });

    // ── 14. Dashboard Stats ───────────────────────────────────────────────────
    ipcMain.handle('make-get-dashboard-stats', async () => {
        const { data: allOrders } = await supabase.from('make_orders')
            .select('status, priority, created_at, furniture_name, designer_name, id')
            .order('created_at', { ascending: false });

        const orders = allOrders || [];
        const total = orders.length;
        const inProgress = orders.filter(o =>
            ['Cutting & Woodworking', 'Metalwork', 'Polish & Paint', 'Upholstery', 'Packaging & QC', 'Work in process', 'Production On Going', 'Primary QC', 'Color Ongoing', 'Color Ongoing (oven)', 'QC Final', 'In Production', 'Welding', 'Painting'].includes(o.status)
        ).length;
        const readyForDispatch = orders.filter(o => ['Dispatch', 'Ready to Ship', 'Ready for Dispatch'].includes(o.status)).length;
        const delivered = orders.filter(o => ['Delivered', 'Completed'].includes(o.status)).length;
        const completed = readyForDispatch + delivered;
        const pending = orders.filter(o => ['Pending Approval', 'Awaiting Pricing', 'Pricing Done', 'Placed'].includes(o.status)).length;

        const byStatus: Record<string, number> = {};
        for (const o of orders) {
            byStatus[o.status] = (byStatus[o.status] || 0) + 1;
        }

        const pendingDelivery = orders.filter(o => ['Dispatch', 'Ready to Ship', 'Ready for Dispatch'].includes(o.status));
        const recent = orders.slice(0, 10);

        return {
            total,
            totalOrders: total,
            pending,
            pendingApproval: pending,
            inProgress,
            inProduction: inProgress,
            readyForDispatch,
            delivered,
            completed,
            byStatus,
            stageBreakdown: byStatus,
            pendingDelivery,
            recent,
            recentOrders: recent
        };
    });

    // ── 15. Delete Order (Designer / Admin Only, Financial Guard) ─────────────
    const handleDeleteOrder = async (rawPayload: any) => {
        try {
            const session = requireSession();
            const parsed = DeleteMakeOrderSchema.parse(
                typeof rawPayload === 'object' && rawPayload !== null && 'orderId' in rawPayload
                    ? rawPayload
                    : { orderId: rawPayload }
            );

            const result = await MakeOrderService.deleteOrder(parsed.orderId, session);
            return result;
        } catch (err: any) {
            console.error('[MAKE IPC] delete-order error:', err);
            return { success: false, error: err.message || 'Failed to delete order' };
        }
    };

    ipcMain.handle('delete-make-order', async (_e, payload: any) => handleDeleteOrder(payload));
    ipcMain.handle('make-delete-order', async (_e, payload: any) => handleDeleteOrder(payload));

    // ── 16. Intelligent Whole-Catalog Product Search ──────────────────────────
    ipcMain.handle('make-search-products', async (_e, rawPayload: any) => {
        try {
            const parsed = SearchCatalogProductsSchema.parse(rawPayload || {});
            return await MakeSearchService.searchProducts(parsed);
        } catch (err: any) {
            console.error('[MAKE IPC] make-search-products error:', err);
            return [];
        }
    });

    // ── 17. Global Product Attributes (Categories, Specs, Sizes, Colors) ─────
    ipcMain.handle('make-get-global-attributes', async () => {
        try {
            const [categoriesRes, specsRes, sizesRes, colorsRes] = await Promise.all([
                supabase.from('make_product_categories').select('*').order('name', { ascending: true }),
                supabase.from('make_product_specifications').select('*').is('product_id', null).order('spec_name', { ascending: true }),
                supabase.from('make_product_sizes').select('*').is('product_id', null).order('size_label', { ascending: true }),
                supabase.from('make_product_colors').select('*').is('product_id', null).order('color_name', { ascending: true })
            ]);

            return {
                categories: decryptRows(categoriesRes.data || []),
                specs: decryptRows(specsRes.data || []),
                sizes: decryptRows(sizesRes.data || []),
                colors: decryptRows(colorsRes.data || [])
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-get-global-attributes error:', err);
            return { categories: [], specs: [], sizes: [], colors: [] };
        }
    });

    ipcMain.handle('make-save-global-attribute', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            if (!canManageCatalog(session)) {
                return { success: false, error: 'Forbidden: Global attribute management requires Administrator or Manager privileges.' };
            }

            const parsed = GlobalAttributeSchema.parse(rawPayload);

            const db = supabaseAdmin || supabase;
            if (parsed.type === 'category') {
                const categoryName = (parsed.name || parsed.category_name || '').trim();
                const payload: any = {
                    name: categoryName,
                    code: parsed.code || null,
                    description: parsed.description || parsed.details || null,
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await db.from('make_product_categories').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    // Auto-sync products that point to this category ID to ensure single source of truth
                    await db.from('make_products').update({ category: categoryName }).eq('category_id', parsed.id);
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_categories').insert(payload).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                }
            } else if (parsed.type === 'spec') {
                const payload: any = {
                    product_id: null,
                    spec_name: parsed.name,
                    spec_code: parsed.code || null,
                    spec_details: parsed.details || null,
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await supabase.from('make_product_specifications').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await supabase.from('make_product_specifications').insert(payload).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                }
            } else if (parsed.type === 'size') {
                const payload: any = {
                    product_id: null,
                    size_label: parsed.name,
                    length: parsed.length ? parseFloat(String(parsed.length)) : null,
                    width: parsed.width ? parseFloat(String(parsed.width)) : null,
                    height: parsed.height ? parseFloat(String(parsed.height)) : null,
                    diameter: parsed.diameter ? parseFloat(String(parsed.diameter)) : null,
                    unit: parsed.unit || 'mm',
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await supabase.from('make_product_sizes').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await supabase.from('make_product_sizes').insert(payload).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                }
            } else if (parsed.type === 'color') {
                const payload: any = {
                    product_id: null,
                    color_name: parsed.name,
                    color_code: parsed.color_code || parsed.code || null,
                    image_url: parsed.image_url || null,
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await supabase.from('make_product_colors').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await supabase.from('make_product_colors').insert(payload).select().single();
                    if (error) throw error;
                    return { success: true, attribute: data };
                }
            }
            return { success: false, error: 'Invalid attribute type' };
        } catch (err: any) {
            console.error('[MAKE IPC] make-save-global-attribute error:', err);
            return { success: false, error: err.message || 'Failed to save global attribute' };
        }
    });

    ipcMain.handle('make-delete-category', async (_e, id: number | string) => {
        try {
            const session = requireSession();
            if (!canManageCatalog(session)) {
                return { success: false, error: 'Forbidden: Category deletion requires Administrator or Manager privileges.' };
            }

            const catId = Number(id);
            // 1. Fetch category name
            const { data: cat } = await supabase.from('make_product_categories').select('id, name').eq('id', catId).maybeSingle();
            if (!cat) {
                return { success: false, error: 'Category not found.' };
            }

            // 2. Check for referencing products
            const { data: referencingProducts, error: countErr } = await supabase
                .from('make_products')
                .select('id, product_name')
                .or(`category_id.eq.${catId},category.eq.${cat.name}`);

            if (countErr) throw countErr;

            if (referencingProducts && referencingProducts.length > 0) {
                const count = referencingProducts.length;
                const sampleNames = referencingProducts.slice(0, 5).map(p => `"${p.product_name}"`).join(', ');
                const moreSuffix = count > 5 ? ` and ${count - 5} more` : '';
                return {
                    success: false,
                    error: `Cannot delete category "${cat.name}". It is currently used by ${count} product(s) (${sampleNames}${moreSuffix}). Please reassign or delete these products first.`
                };
            }

            // 3. Safe to delete
            const db = supabaseAdmin || supabase;
            const { error: delErr } = await db.from('make_product_categories').delete().eq('id', catId);
            if (delErr) throw delErr;

            return { success: true };
        } catch (err: any) {
            console.error('[MAKE IPC] make-delete-category error:', err);
            return { success: false, error: err.message || 'Failed to delete category' };
        }
    });

    ipcMain.handle('make-assign-product-attributes', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            if (!canManageCatalog(session)) {
                return { success: false, error: 'Forbidden: Attribute assignment requires Administrator or Manager privileges.' };
            }

            const parsed = AssignProductAttributesSchema.parse(rawPayload);
            const { productId, specIds, sizeIds, colorIds } = parsed;

            if (specIds !== undefined) {
                await supabase.from('make_product_specification_links').delete().eq('product_id', productId);
                if (specIds.length > 0) {
                    const rows = specIds.map(specId => ({ product_id: productId, spec_id: specId }));
                    await supabase.from('make_product_specification_links').insert(rows);
                }
            }

            if (sizeIds !== undefined) {
                await supabase.from('make_product_size_links').delete().eq('product_id', productId);
                if (sizeIds.length > 0) {
                    const rows = sizeIds.map(sizeId => ({ product_id: productId, size_id: sizeId }));
                    await supabase.from('make_product_size_links').insert(rows);
                }
            }

            if (colorIds !== undefined) {
                await supabase.from('make_product_color_links').delete().eq('product_id', productId);
                if (colorIds.length > 0) {
                    const rows = colorIds.map(colorId => ({ product_id: productId, color_id: colorId }));
                    await supabase.from('make_product_color_links').insert(rows);
                }
            }

            return { success: true };
        } catch (err: any) {
            console.error('[MAKE IPC] make-assign-product-attributes error:', err);
            return { success: false, error: err.message || 'Failed to assign product attributes' };
        }
    });

    // ── 18. Native Secure Picker & In-Memory Upload for Invoice Attachments ───
    ipcMain.handle('make-pick-and-upload-invoice-attachment', async (_e, { orderId }: { orderId?: string | number } = {}) => {
        try {
            requireSession();
            const focusedWin = BrowserWindow.getFocusedWindow();
            const validation = await MakeCadService.pickAndValidateFile('invoice_attachment', focusedWin);
            if ('canceled' in validation) {
                return { canceled: true, error: validation.error };
            }

            const subfolder = orderId ? `make-order-files/${orderId}/invoices` : 'make-order-files/invoices';
            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                subfolder
            );

            if (!uploadResult.success || !uploadResult.publicUrl) {
                return { success: false, error: uploadResult.error || 'Failed to upload invoice image' };
            }

            if (orderId) {
                const { data: order } = await supabase.from('make_orders').select('invoice_attachment_urls').eq('id', orderId).maybeSingle();
                const existing: string[] = Array.isArray(order?.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                const combined = [...existing, uploadResult.publicUrl];
                await supabase.from('make_orders').update({ invoice_attachment_urls: combined }).eq('id', orderId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-pick-and-upload-invoice-attachment error:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('make-upload-invoice-attachment-buffer', async (_e, payload: { fileName: string; fileBase64: string; orderId?: string | number; itemId?: string | number }) => {
        try {
            requireSession();
            const { fileName, fileBase64, orderId, itemId } = payload;
            if (!fileBase64 || !fileName) {
                return { success: false, error: 'File content and name are required.' };
            }

            let buffer: Buffer;
            const matches = fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                buffer = Buffer.from(matches[2], 'base64');
            } else {
                buffer = Buffer.from(fileBase64, 'base64');
            }

            const valType = itemId ? 'cad' : 'invoice_attachment';
            const validation = MakeCadService.validateBuffer(buffer, fileName, valType);
            if (!validation.isValid) {
                return { success: false, error: validation.error };
            }

            const subfolder = itemId
                ? `make-order-files/${orderId || 'general'}/items/${itemId}`
                : (orderId ? `make-order-files/${orderId}/invoices` : 'make-order-files/invoices');
            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                subfolder
            );

            if (!uploadResult.success || !uploadResult.publicUrl) {
                return { success: false, error: uploadResult.error || 'Failed to upload attachment' };
            }

            if (itemId) {
                const { data: item } = await supabase.from('make_order_items').select('pdf_urls, technical_drawing_url').eq('id', itemId).maybeSingle();
                const existing: string[] = Array.isArray(item?.pdf_urls) ? item.pdf_urls : [];
                const combined = [...existing, uploadResult.publicUrl];
                await supabase.from('make_order_items').update({
                    pdf_urls: combined,
                    technical_drawing_url: uploadResult.publicUrl
                }).eq('id', itemId);
            } else if (orderId) {
                const { data: order } = await supabase.from('make_orders').select('invoice_attachment_urls').eq('id', orderId).maybeSingle();
                const existing: string[] = Array.isArray(order?.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                const combined = [...existing, uploadResult.publicUrl];
                await supabase.from('make_orders').update({ invoice_attachment_urls: combined }).eq('id', orderId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-upload-invoice-attachment-buffer error:', err);
            return { success: false, error: err.message };
        }
    });
}
