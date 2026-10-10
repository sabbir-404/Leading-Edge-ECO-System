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
import * as path from 'path';
import * as fs from 'fs';
import { supabase, supabaseAdmin, failoverEngine, getNasStorageCandidates, getCfAccessHeaders } from '../../supabase';
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
    normalizeGlobalAttributePayload,
    AssignProductAttributesSchema,
    SearchCatalogProductsSchema
} from '../schemas/make.schema';

export interface ValidatedDownloadUrlResult {
    isValid: boolean;
    error?: string;
    subPath?: string;
    candidates: string[];
}

/**
 * Validates whether a hostname and port correspond to an approved NAS storage endpoint.
 */
export function isApprovedNasHost(hostname: string, port?: string): boolean {
    if (!hostname || typeof hostname !== 'string') return false;
    const lowerHost = hostname.toLowerCase();

    const runtimeCandidates = typeof getNasStorageCandidates === 'function'
        ? getNasStorageCandidates()
        : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];

    const approvedHosts = new Set<string>(['storage.lenas.me', '100.88.85.6', '192.168.1.14']);
    for (const c of runtimeCandidates) {
        try {
            const u = new URL(c);
            approvedHosts.add(u.hostname.toLowerCase());
        } catch {}
    }

    if (!approvedHosts.has(lowerHost)) {
        return false;
    }

    if (port !== undefined) {
        return isApprovedNasPort(hostname, port);
    }

    return true;
}

/**
 * Validates whether a port is allowed on an approved NAS host.
 */
export function isApprovedNasPort(hostname: string, port?: string): boolean {
    const lowerHost = (hostname || '').toLowerCase();

    const runtimeCandidates = typeof getNasStorageCandidates === 'function'
        ? getNasStorageCandidates()
        : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];

    if (lowerHost === 'storage.lenas.me') {
        return !port || port === '443';
    }

    if (lowerHost === '100.88.85.6' || lowerHost === '192.168.1.14') {
        if (!port || port === '8080' || port === '8081') return true;
        for (const c of runtimeCandidates) {
            try {
                const u = new URL(c);
                const candPort = u.port || (u.protocol === 'https:' ? '443' : '80');
                if (u.hostname.toLowerCase() === lowerHost && candPort === port) return true;
            } catch {}
        }
        return false;
    }

    // Explicit port rules for configured candidate hosts (reject arbitrary ports)
    const matchingCandidates = runtimeCandidates
        .map(c => { try { return new URL(c); } catch { return null; } })
        .filter((u): u is URL => u !== null && u.hostname.toLowerCase() === lowerHost);

    if (matchingCandidates.length > 0) {
        return matchingCandidates.some(cand => {
            const candPort = cand.port || (cand.protocol === 'https:' ? '443' : '80');
            const reqPort = port || (cand.protocol === 'https:' ? '443' : '80');
            return candPort === reqPort;
        });
    }

    return false;
}

/**
 * Strictly validates download URLs against approved hosts/protocols and normalizes candidates.
 */
export function validateAndNormalizeDownloadUrl(rawUrl: string): ValidatedDownloadUrlResult {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return { isValid: false, error: 'URL must be a non-empty string', candidates: [] };
    }

    const trimmed = rawUrl.trim();

    // Guard against directory traversal in raw URL
    if (trimmed.includes('../') || trimmed.includes('..\\') || trimmed.includes('/..') || trimmed.includes('\\..')) {
        return { isValid: false, error: 'Path traversal is not permitted in URL path', candidates: [] };
    }

    const candidateBases = typeof getNasStorageCandidates === 'function'
        ? getNasStorageCandidates()
        : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];

    // 1. app-media://nas/...
    if (/^app-media:\/\/nas\//i.test(trimmed)) {
        const sub = trimmed.replace(/^app-media:\/\/nas\/?/i, '');
        const cleanSub = decodeURIComponent(sub).replace(/^\/+/, '');
        if (cleanSub.includes('..')) {
            return { isValid: false, error: 'Path traversal is not permitted in URL path', candidates: [] };
        }
        const candidates = candidateBases.map(b => `${b.replace(/\/$/, '')}/${encodeURI(cleanSub)}`);
        return { isValid: true, subPath: cleanSub, candidates };
    }

    // 2. Reject unsupported protocols
    if (!/^https?:\/\//i.test(trimmed)) {
        const proto = trimmed.split(':')[0] || 'unknown';
        return { isValid: false, error: `Unsupported protocol "${proto}:". Only HTTP, HTTPS, and app-media are permitted.`, candidates: [] };
    }

    // 3. HTTP / HTTPS URL parsing
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(trimmed);
    } catch {
        return { isValid: false, error: 'Malformed URL', candidates: [] };
    }

    if (!isApprovedNasHost(parsedUrl.hostname)) {
        return { isValid: false, error: `Host "${parsedUrl.hostname}" is not an approved NAS storage endpoint.`, candidates: [] };
    }

    if (!isApprovedNasPort(parsedUrl.hostname, parsedUrl.port)) {
        return { isValid: false, error: `Unapproved port: ${parsedUrl.port}`, candidates: [] };
    }

    const lowerHost = parsedUrl.hostname.toLowerCase();
    if (lowerHost === 'storage.lenas.me') {
        if (parsedUrl.protocol !== 'https:') {
            return { isValid: false, error: 'storage.lenas.me is only permitted over HTTPS', candidates: [] };
        }
        if (parsedUrl.port && parsedUrl.port !== '443') {
            return { isValid: false, error: `Unapproved port: ${parsedUrl.port}`, candidates: [] };
        }
    } else if (lowerHost === '100.88.85.6' || lowerHost === '192.168.1.14') {
        if (parsedUrl.protocol !== 'http:') {
            return { isValid: false, error: `Host "${parsedUrl.hostname}" is only permitted over HTTP`, candidates: [] };
        }
        if (parsedUrl.port && parsedUrl.port !== '8080' && parsedUrl.port !== '8081') {
            return { isValid: false, error: `Unapproved port: ${parsedUrl.port}`, candidates: [] };
        }
    } else {
        // Explicit protocol and port rules for other configured candidate hosts
        const matchingCandidates = candidateBases
            .map(c => { try { return new URL(c); } catch { return null; } })
            .filter((u): u is URL => u !== null && u.hostname.toLowerCase() === lowerHost);

        const effectivePort = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
        const matches = matchingCandidates.some(cand => {
            const candPort = cand.port || (cand.protocol === 'https:' ? '443' : '80');
            return cand.protocol.toLowerCase() === parsedUrl.protocol.toLowerCase() &&
                   candPort === effectivePort;
        });

        if (!matches) {
            return { isValid: false, error: `Unapproved endpoint: ${parsedUrl.protocol}//${parsedUrl.host}`, candidates: [] };
        }
    }

    // Extract subpath and guard against directory traversal
    const cleanSub = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '');
    if (cleanSub.includes('..')) {
        return { isValid: false, error: 'Path traversal is not permitted in URL path', candidates: [] };
    }

    // Normalize: even for legacy :8080 URLs, candidates route strictly through active candidate base URLs
    const candidates = candidateBases.map(b => `${b.replace(/\/$/, '')}/${encodeURI(cleanSub)}`);

    return { isValid: true, subPath: cleanSub, candidates };
}

/**
 * Sanitizes the requested file name and guarantees it stays inside the temporary directory.
 */
export function sanitizeDownloadDestination(rawFileName: string, tempDir: string): { targetPath: string; fileName: string } {
    const input = (typeof rawFileName === 'string' && rawFileName.trim()) ? rawFileName.trim() : 'document.pdf';
    const forwardSlashed = input.replace(/\\/g, '/');
    const base = path.basename(forwardSlashed);
    // Strip illegal filename characters and control characters
    // eslint-disable-next-line no-control-regex
    const cleaned = base.replace(/[\/\\:*?"<>|\x00-\x1F\x7F]/g, '_').replace(/^\.+/, '').trim() || 'document.pdf';

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const finalFileName = `${uniqueId}_${cleaned}`;
    const targetPath = path.resolve(tempDir, finalFileName);

    const normalizedTemp = path.resolve(tempDir);
    if (!targetPath.startsWith(normalizedTemp + path.sep)) {
        throw new Error('Path traversal detected');
    }

    return { targetPath, fileName: finalFileName };
}

/**
 * Validates the complete redirect target URL (protocol, hostname, effective port, downgrade, traversal)
 * and safely normalizes legacy :8080 ports to :8081 without requesting port 8080 directly.
 */
export function validateAndNormalizeRedirect(redirectUrlStr: string, currentUrlStr: string): string {
    if (!redirectUrlStr || typeof redirectUrlStr !== 'string') {
        throw new Error('Redirect URL must be a non-empty string');
    }

    let currentParsed: URL;
    let redirectParsed: URL;
    try {
        currentParsed = new URL(currentUrlStr);
        redirectParsed = new URL(redirectUrlStr, currentUrlStr);
    } catch {
        throw new Error('Malformed redirect URL');
    }

    // Reject unsupported protocols
    if (redirectParsed.protocol !== 'http:' && redirectParsed.protocol !== 'https:') {
        throw new Error(`Unsupported redirect protocol "${redirectParsed.protocol}". Only HTTP and HTTPS are permitted.`);
    }

    // Reject HTTPS-to-HTTP downgrade redirects
    if (currentParsed.protocol === 'https:' && redirectParsed.protocol === 'http:') {
        throw new Error('HTTPS-to-HTTP downgrade redirect is forbidden');
    }

    // Path traversal defense in redirect URL
    if (
        redirectUrlStr.includes('../') ||
        redirectUrlStr.includes('..\\') ||
        redirectUrlStr.includes('/..') ||
        redirectUrlStr.includes('\\..') ||
        decodeURIComponent(redirectParsed.pathname).includes('..')
    ) {
        throw new Error('Path traversal is not permitted in redirect URL');
    }

    const lowerHost = redirectParsed.hostname.toLowerCase();

    // Legacy :8080 normalization:
    // Ensure redirects cannot bypass legacy :8080 normalization.
    // Either reject those redirects or safely normalize them through approved candidates; do not request port 8080 directly.
    if (redirectParsed.port === '8080') {
        if (lowerHost === '100.88.85.6' || lowerHost === '192.168.1.14') {
            redirectParsed.port = '8081';
        } else {
            throw new Error(`Unapproved port 8080 on host "${redirectParsed.hostname}"`);
        }
    }

    const runtimeCandidates = typeof getNasStorageCandidates === 'function'
        ? getNasStorageCandidates()
        : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];

    const effectivePort = redirectParsed.port || (redirectParsed.protocol === 'https:' ? '443' : '80');

    // Rule 1: storage.lenas.me is permitted ONLY over HTTPS on default port or 443
    if (lowerHost === 'storage.lenas.me') {
        if (redirectParsed.protocol !== 'https:') {
            throw new Error('storage.lenas.me is only permitted over HTTPS');
        }
        if (effectivePort !== '443') {
            throw new Error(`Unapproved port "${redirectParsed.port}" for storage.lenas.me`);
        }
        return redirectParsed.href;
    }

    // Rule 2: Explicit rules for standard NAS IP endpoints
    if (lowerHost === '100.88.85.6' || lowerHost === '192.168.1.14') {
        if (redirectParsed.protocol !== 'http:') {
            const hasHttpsCandidate = runtimeCandidates.some(c => {
                try {
                    const u = new URL(c);
                    return u.hostname.toLowerCase() === lowerHost && u.protocol === 'https:';
                } catch { return false; }
            });
            if (!hasHttpsCandidate) {
                throw new Error(`Host "${lowerHost}" is only permitted over HTTP`);
            }
        }
        if (effectivePort !== '8081') {
            throw new Error(`Unapproved port "${redirectParsed.port || effectivePort}" for ${lowerHost}`);
        }
        return redirectParsed.href;
    }

    // Rule 3: Explicit protocol and port rules for every other configured candidate host
    const matchingCandidates = runtimeCandidates
        .map(c => { try { return new URL(c); } catch { return null; } })
        .filter((u): u is URL => u !== null && u.hostname.toLowerCase() === lowerHost);

    if (matchingCandidates.length === 0) {
        throw new Error(`Redirect to unapproved host "${redirectParsed.hostname}" was blocked`);
    }

    const matchesCandidate = matchingCandidates.some(cand => {
        const candEffectivePort = cand.port || (cand.protocol === 'https:' ? '443' : '80');
        return cand.protocol.toLowerCase() === redirectParsed.protocol.toLowerCase() &&
               candEffectivePort === effectivePort;
    });

    if (!matchesCandidate) {
        throw new Error(`Unapproved endpoint (protocol/port) "${redirectParsed.protocol}//${redirectParsed.host}" for candidate host "${redirectParsed.hostname}"`);
    }

    return redirectParsed.href;
}

/**
 * Reads the response body buffer while keeping the download timeout signal actively enforced.
 */
export async function readResponseBodyWithSignal(
    res: Response,
    signal: AbortSignal,
    timeoutMs: number
): Promise<ArrayBuffer> {
    if (signal.aborted) {
        throw new Error(`Download timed out after ${timeoutMs}ms`);
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
        let settled = false;

        const onAbort = () => {
            if (settled) return;
            settled = true;
            reject(new Error(`Download timed out after ${timeoutMs}ms`));
        };

        signal.addEventListener('abort', onAbort, { once: true });

        res.arrayBuffer().then(
            (buf) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                resolve(buf);
            },
            (err) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                reject(err);
            }
        );
    });
}

/**
 * Downloads a file from NAS storage candidates with Cloudflare Access headers,
 * redirect policy validation, active body streaming timeout, and partial file cleanup.
 */
export async function downloadPdfFromNas(
    url: string,
    fileName: string,
    tempDir: string,
    timeoutMs: number = 6000
): Promise<{ success: boolean; path?: string; error?: string }> {
    const validation = validateAndNormalizeDownloadUrl(url);
    if (!validation.isValid) {
        return { success: false, error: validation.error || 'Invalid download URL' };
    }

    let targetPath: string;
    try {
        const dest = sanitizeDownloadDestination(fileName, tempDir);
        targetPath = dest.targetPath;
    } catch (err: any) {
        return { success: false, error: err.message || 'Invalid filename' };
    }

    const { candidates } = validation;
    const cfHeaders = typeof getCfAccessHeaders === 'function' ? getCfAccessHeaders() : {};

    let lastError = 'No candidates available';

    const cleanupTemp = () => {
        try {
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
            }
        } catch {}
    };

    const electron = await import('electron').catch(() => null);
    const fetchFn: typeof fetch = (electron as any)?.net?.fetch || globalThis.fetch;

    for (const candidateUrl of candidates) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort(new Error(`Download timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        try {
            let currentUrl = candidateUrl;
            let redirectCount = 0;
            const maxRedirects = 3;
            let res: Response | null = null;

            while (redirectCount <= maxRedirects) {
                // Cloudflare Access headers are strictly forbidden over unencrypted HTTP
                const isHttpsTunnel = currentUrl.startsWith('https://storage.lenas.me');
                const headers: Record<string, string> = (isHttpsTunnel && currentUrl.startsWith('https://'))
                    ? { ...cfHeaders }
                    : {};

                res = await fetchFn(currentUrl, {
                    headers,
                    signal: controller.signal,
                    redirect: 'manual'
                });

                if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
                    const location = res.headers.get('location')!;
                    const resolvedRedirect = new URL(location, currentUrl).href;

                    // Strictly validate and normalize redirect target
                    const normalizedRedirect = validateAndNormalizeRedirect(resolvedRedirect, currentUrl);

                    currentUrl = normalizedRedirect;
                    redirectCount++;
                    continue;
                }

                break;
            }

            if (!res || !res.ok || res.status !== 200) {
                lastError = `Candidate ${currentUrl} returned HTTP ${res?.status || 'no response'}`;
                continue;
            }

            // Keep download timeout active while reading response body
            const arrayBuf = await readResponseBodyWithSignal(res, controller.signal, timeoutMs);
            if (!arrayBuf || arrayBuf.byteLength === 0) {
                throw new Error('Downloaded file is empty (0 bytes)');
            }

            await fs.promises.writeFile(targetPath, Buffer.from(arrayBuf));

            const stat = await fs.promises.stat(targetPath);
            if (stat.size === 0) {
                throw new Error('Written file is empty');
            }

            return { success: true, path: targetPath };
        } catch (err: any) {
            cleanupTemp();
            if (err.message && (
                err.message.includes('Redirect to unapproved host') ||
                err.message.includes('downgrade redirect is forbidden') ||
                err.message.includes('only permitted over HTTPS') ||
                err.message.includes('Unapproved port') ||
                err.message.includes('Unapproved endpoint') ||
                err.message.includes('Path traversal')
            )) {
                return { success: false, error: err.message };
            }
            if (err.name === 'AbortError' || controller.signal.aborted || (err.message && err.message.includes('timed out'))) {
                lastError = `Download timed out after ${timeoutMs}ms`;
            } else {
                lastError = err.message || 'Fetch failed';
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    cleanupTemp();
    return { success: false, error: `Failed to download file from NAS: ${lastError}` };
}

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
     * Furniture Designer and Admin groups are authorized.
     * Salesperson / Sales group is strictly denied.
     */
    function canManageCatalog(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        // Salespersons and Factory Managers are strictly forbidden from creating or managing products
        if (role === 'salesperson' || role === 'salesman' || role === 'sales') return false;
        if (role === 'factory_manager' || role === 'factory manager' || role === 'factory') return false;
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (
            role === 'furniture_designer' || 
            role === 'furniture designer' || 
            role === 'designer' ||
            role === 'make_designer'
        ) return true;
        return !!(
            session.permissions && (
                session.permissions['manage_catalog'] ||
                session.permissions['make_admin'] ||
                session.permissions['catalog_manage'] ||
                session.permissions['write_make_catalog'] ||
                session.permissions['create_product_from_place_order']
            )
        );
    }

    /**
     * Verifies if the session user has permissions to manage global product attributes
     * (Categories, Specs, Sizes, Colors).
     * Superadmin, Admin, and Manager retain access.
     * Furniture Designer and other roles require explicit 'manage_global_product_attributes' permission.
     * Does NOT infer from write_make_catalog, manage_catalog, or product creation permissions.
     */
    function canManageGlobalProductAttributes(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        return !!(session.permissions && session.permissions['manage_global_product_attributes']);
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
            const role = (session.role || '').toLowerCase();
            if (role === 'factory_manager' || role === 'factory manager' || role === 'factory') {
                throw new Error('Forbidden: Factory Manager is strictly prohibited from creating orders.');
            }
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
                orderId: Number(parsed.orderId),
                changes: parsed.changes,
                itemChanges: parsed.itemChanges || parsed.items,
                reason: parsed.reason,
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

    ipcMain.handle('make-download-pdf', async (_e, { url, fileName }: { url: string; fileName: string }) => {
        try {
            const { app, shell } = await import('electron');
            const tempDir = app.getPath('temp');
            const res = await downloadPdfFromNas(url, fileName, tempDir);
            if (res.success && res.path) {
                await shell.openPath(res.path);
            }
            return res;
        } catch (e: any) {
            console.error('[make-download-pdf] Download error:', e);
            return { success: false, error: e?.message || 'Download error' };
        }
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
        const queryFn = async (client: any) => {
            let q = client.from('make_products')
                .select('*, specifications:make_product_specifications(*), sizes:make_product_sizes(*), colors:make_product_colors(*), images:make_product_images(*)')
                .order('created_at', { ascending: false });

            if (activeOnly) q = q.eq('is_active', true);
            if (search) q = q.or(`product_name.ilike.%${search}%,product_code.ilike.%${search}%`);

            const res = await q;

            // If the images join fails (PGRST200: missing relationship on Cloud), retry without images
            if (res.error?.code === 'PGRST200' && res.error?.message?.includes('make_product_images')) {
                console.warn('[make-get-catalog-products] make_product_images relationship missing (Cloud fallback), retrying without images join.');
                let q2 = client.from('make_products')
                    .select('*, specifications:make_product_specifications(*), sizes:make_product_sizes(*), colors:make_product_colors(*)')
                    .order('created_at', { ascending: false });
                if (activeOnly) q2 = q2.eq('is_active', true);
                if (search) q2 = q2.or(`product_name.ilike.%${search}%,product_code.ilike.%${search}%`);
                const fallbackRes = await q2;
                // Ensure products have empty images array for consistent shape
                if (fallbackRes.data) {
                    for (const p of fallbackRes.data) {
                        (p as any).images = [];
                    }
                }
                return fallbackRes;
            }

            return res;
        };

        const { data, error, databaseUsed } = await failoverEngine.executeRead(queryFn, 'make-get-catalog-products');
        if (error) {
            console.error(`[make-get-catalog-products] Query failed on ${databaseUsed}:`, error);
            throw error;
        }

        const products = decryptRows(data || []);

        // Aggregate purchased counts from make_order_items for returned products only (bounded to first 100 to avoid huge joins)
        try {
            const productIds = products.map((p: any) => p.id).filter(Boolean);
            if (productIds.length > 0 && productIds.length <= 100) {
                const activeClient = failoverEngine.getActiveClient();
                const { data: orderItems } = await activeClient
                    .from('make_order_items')
                    .select('product_id, product_name, quantity')
                    .in('product_id', productIds);
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
            }
        } catch (e) {
            console.warn('[make-get-catalog-products] Could not aggregate order counts:', e);
        }

        // Aggregate multi-category links for returned products
        try {
            const productIds = products.map((p: any) => p.id).filter(Boolean);
            if (productIds.length > 0) {
                const activeClient = failoverEngine.getActiveClient();
                const [catLinksRes, allCatsRes] = await Promise.all([
                    activeClient.from('make_product_category_links').select('product_id, category_id').in('product_id', productIds),
                    activeClient.from('make_product_categories').select('id, name')
                ]);
                const catMap = new Map((allCatsRes.data || []).map((c: any) => [c.id, c.name]));
                const linksMap = new Map<number, number[]>();
                (catLinksRes.data || []).forEach((link: any) => {
                    const list = linksMap.get(link.product_id) || [];
                    list.push(link.category_id);
                    linksMap.set(link.product_id, list);
                });
                for (const p of products) {
                    const ids = linksMap.get(p.id) || (p.category_id ? [p.category_id] : []);
                    p.category_ids = ids;
                    p.categories = ids.map(id => ({ id, name: catMap.get(id) || p.category || '' }));
                }
            }
        } catch (e) {
            for (const p of products) {
                p.category_ids = p.category_id ? [p.category_id] : [];
                p.categories = p.category_id ? [{ id: p.category_id, name: p.category || '' }] : [];
            }
        }

        return products;
    });

    ipcMain.handle('make-save-catalog-product', async (_e, rawProduct: any) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Furniture Designer privileges.');
        }

        const product = CatalogProductSchema.parse(rawProduct);

        // Extract multi-category IDs
        const rawCatIds = (product.category_ids || product.categoryIds || (product.category_id ? [product.category_id] : [])) as any[];
        const categoryIds = rawCatIds.map(Number).filter(id => !isNaN(id) && id > 0);

        let resolvedCategoryId: number | null = null;
        let resolvedCategoryName: string | null = null;

        if (categoryIds.length > 0) {
            resolvedCategoryId = categoryIds[0];
            const { data: catRows } = await failoverEngine.executeRead(async client => 
                client.from('make_product_categories').select('id, name').in('id', categoryIds),
                'resolve-category-ids'
            );
            if (catRows && catRows.length > 0) {
                resolvedCategoryName = catRows.map((c: any) => c.name).join(', ');
            }
        } else if (product.category) {
            const { data: catRow } = await failoverEngine.executeRead(async client => 
                client.from('make_product_categories').select('id, name').ilike('name', product.category!.trim()).maybeSingle(),
                'resolve-category-name'
            );
            if (catRow) {
                resolvedCategoryId = catRow.id;
                resolvedCategoryName = catRow.name;
                categoryIds.push(catRow.id);
            } else {
                resolvedCategoryName = product.category.trim();
            }
        }

        const isUpdate = Boolean(product.id);
        const writePayload = isUpdate ? {
            product_code: product.product_code,
            product_name: product.product_name,
            description: product.description || null,
            category_id: resolvedCategoryId,
            category: resolvedCategoryName,
            main_image: product.main_image || null,
            is_active: product.is_active !== undefined ? product.is_active : true,
            updated_at: new Date().toISOString()
        } : {
            product_code: product.product_code,
            product_name: product.product_name,
            description: product.description || null,
            category_id: resolvedCategoryId,
            category: resolvedCategoryName,
            main_image: product.main_image || null,
            is_active: product.is_active !== undefined ? product.is_active : true,
            created_by: session.fullName || session.username
        };

        const writeResult = await failoverEngine.executeWrite(
            async (client) => {
                if (isUpdate) {
                    return await client.from('make_products').update(writePayload).eq('id', product.id).select().single();
                } else {
                    return await client.from('make_products').insert(writePayload).select().single();
                }
            },
            {
                table: 'make_products',
                operation: isUpdate ? 'update' : 'insert',
                primaryKey: isUpdate ? { name: 'id', value: product.id } : undefined,
                data: writePayload
            },
            isUpdate ? 'update-product' : 'insert-product'
        );

        if (writeResult.error) throw writeResult.error;
        const savedData = writeResult.data;

        // Process attribute junction links in parallel if provided
        const specIds = (product as any).specIds;
        const sizeIds = (product as any).sizeIds;
        const colorIds = (product as any).colorIds;

        const junctionPromises: Promise<any>[] = [];

        // Save multiple categories
        junctionPromises.push((async () => {
            await failoverEngine.executeWrite(async client => {
                await client.from('make_product_category_links').delete().eq('product_id', savedData.id);
                if (categoryIds.length > 0) {
                    const rows = categoryIds.map(catId => ({ product_id: savedData.id, category_id: catId }));
                    return await client.from('make_product_category_links').insert(rows).select();
                }
                return { data: [], error: null };
            }, { table: 'make_product_category_links', operation: 'insert' }, 'link-categories');
        })());

        if (specIds !== undefined && Array.isArray(specIds)) {
            junctionPromises.push((async () => {
                await failoverEngine.executeWrite(async client => {
                    await client.from('make_product_specification_links').delete().eq('product_id', savedData.id);
                    if (specIds.length > 0) {
                        const rows = specIds.map(sId => ({ product_id: savedData.id, spec_id: sId }));
                        return await client.from('make_product_specification_links').insert(rows).select();
                    }
                    return { data: [], error: null };
                }, { table: 'make_product_specification_links', operation: 'insert' }, 'link-specs');
            })());
        }

        if (sizeIds !== undefined && Array.isArray(sizeIds)) {
            junctionPromises.push((async () => {
                await failoverEngine.executeWrite(async client => {
                    await client.from('make_product_size_links').delete().eq('product_id', savedData.id);
                    if (sizeIds.length > 0) {
                        const rows = sizeIds.map(sId => ({ product_id: savedData.id, size_id: sId }));
                        return await client.from('make_product_size_links').insert(rows).select();
                    }
                    return { data: [], error: null };
                }, { table: 'make_product_size_links', operation: 'insert' }, 'link-sizes');
            })());
        }

        if (colorIds !== undefined && Array.isArray(colorIds)) {
            junctionPromises.push((async () => {
                await failoverEngine.executeWrite(async client => {
                    await client.from('make_product_color_links').delete().eq('product_id', savedData.id);
                    if (colorIds.length > 0) {
                        const rows = colorIds.map(cId => ({ product_id: savedData.id, color_id: cId }));
                        return await client.from('make_product_color_links').insert(rows).select();
                    }
                    return { data: [], error: null };
                }, { table: 'make_product_color_links', operation: 'insert' }, 'link-colors');
            })());
        }

        if (junctionPromises.length > 0) {
            await Promise.all(junctionPromises);
        }

        MakeSearchService.invalidateCache();
        return savedData;
    });

    ipcMain.handle('make-delete-catalog-product', async (_e, id: number) => {
        const session = requireSession();
        if (!canManageCatalog(session)) {
            throw new Error('Forbidden: Catalog modification requires Administrator or Manager privileges.');
        }
        const writeResult = await failoverEngine.executeWrite(
            async client => client.from('make_products').delete().eq('id', id),
            { table: 'make_products', operation: 'delete', primaryKey: { name: 'id', value: id } },
            'delete-catalog-product'
        );
        if (writeResult.error) throw writeResult.error;
        MakeSearchService.invalidateCache();
        return { success: true };
    });

    ipcMain.handle('make-save-spec', async (_e, rawSpec: any) => {
        const session = requireSession();
        const spec = CatalogSpecSchema.parse(rawSpec);
        const isGlobal = !spec.product_id;
        if (isGlobal ? !canManageGlobalProductAttributes(session) : !canManageCatalog(session)) {
            throw new Error(`Forbidden: ${isGlobal ? 'Global specification modification requires "manage_global_product_attributes" permission.' : 'Catalog modification requires Administrator or Manager privileges.'}`);
        }

        if (spec.id) {
            const { data, error } = await supabase.from('make_product_specifications').update({
                spec_code: spec.spec_code || null,
                spec_name: spec.spec_name,
                spec_details: spec.spec_details || null,
                is_active: spec.is_active !== undefined ? spec.is_active : true
            }).eq('id', spec.id).select().single();
            if (error) throw error;
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                supabaseAdmin.from('make_product_specifications').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud spec sync:', e.message));
            }
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
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                supabaseAdmin.from('make_product_specifications').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud spec sync:', e.message));
            }
            return data;
        }
    });

    ipcMain.handle('make-delete-spec', async (_e, id: number) => {
        const session = requireSession();
        const { data: spec } = await failoverEngine.executeRead(
            async client => client.from('make_product_specifications').select('product_id').eq('id', id).maybeSingle(),
            'check-spec-global'
        );
        const isGlobal = !spec || spec.product_id === null;
        if (isGlobal ? !canManageGlobalProductAttributes(session) : !canManageCatalog(session)) {
            throw new Error(`Forbidden: ${isGlobal ? 'Global specification deletion requires "manage_global_product_attributes" permission.' : 'Catalog modification requires Administrator or Manager privileges.'}`);
        }
        const writeResult = await failoverEngine.executeWrite(
            async client => client.from('make_product_specifications').delete().eq('id', id),
            { table: 'make_product_specifications', operation: 'delete', primaryKey: { name: 'id', value: id } },
            'delete-spec'
        );
        if (writeResult.error) throw writeResult.error;
        MakeSearchService.invalidateCache();
        return { success: true };
    });

    ipcMain.handle('make-save-size', async (_e, rawSize: any) => {
        const session = requireSession();
        const size = CatalogSizeSchema.parse(rawSize);
        const isGlobal = !size.product_id;
        if (isGlobal ? !canManageGlobalProductAttributes(session) : !canManageCatalog(session)) {
            throw new Error(`Forbidden: ${isGlobal ? 'Global size modification requires "manage_global_product_attributes" permission.' : 'Catalog modification requires Administrator or Manager privileges.'}`);
        }

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
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                supabaseAdmin.from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
            }
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_sizes').insert(payload).select().single();
            if (error) throw error;
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                supabaseAdmin.from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
            }
            return data;
        }
    });

    ipcMain.handle('make-delete-size', async (_e, id: number) => {
        const session = requireSession();
        const { data: size } = await failoverEngine.executeRead(
            async client => client.from('make_product_sizes').select('product_id').eq('id', id).maybeSingle(),
            'check-size-global'
        );
        const isGlobal = !size || size.product_id === null;
        if (isGlobal ? !canManageGlobalProductAttributes(session) : !canManageCatalog(session)) {
            throw new Error(`Forbidden: ${isGlobal ? 'Global size deletion requires "manage_global_product_attributes" permission.' : 'Catalog modification requires Administrator or Manager privileges.'}`);
        }
        const writeResult = await failoverEngine.executeWrite(
            async client => client.from('make_product_sizes').delete().eq('id', id),
            { table: 'make_product_sizes', operation: 'delete', primaryKey: { name: 'id', value: id } },
            'delete-size'
        );
        if (writeResult.error) throw writeResult.error;
        MakeSearchService.invalidateCache();
        return { success: true };
    });

    ipcMain.handle('make-save-color', async (_e, rawColor: any) => {
        const session = requireSession();
        const color = CatalogColorSchema.parse(rawColor);
        const isGlobal = !color.product_id;
        if (isGlobal ? !canManageGlobalProductAttributes(session) : !canManageCatalog(session)) {
            throw new Error(`Forbidden: ${isGlobal ? 'Global color modification requires "manage_global_product_attributes" permission.' : 'Catalog modification requires Administrator or Manager privileges.'}`);
        }

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
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                supabaseAdmin.from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
            }
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_colors').insert(payload).select().single();
            if (error) throw error;
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                supabaseAdmin.from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
            }
            return data;
        }
    });

    ipcMain.handle('make-delete-color', async (_e, id: number) => {
        const session = requireSession();
        const { data: color } = await failoverEngine.executeRead(
            async client => client.from('make_product_colors').select('product_id').eq('id', id).maybeSingle(),
            'check-color-global'
        );
        const isGlobal = !color || color.product_id === null;
        if (isGlobal ? !canManageGlobalProductAttributes(session) : !canManageCatalog(session)) {
            throw new Error(`Forbidden: ${isGlobal ? 'Global color deletion requires "manage_global_product_attributes" permission.' : 'Catalog modification requires Administrator or Manager privileges.'}`);
        }
        const writeResult = await failoverEngine.executeWrite(
            async client => client.from('make_product_colors').delete().eq('id', id),
            { table: 'make_product_colors', operation: 'delete', primaryKey: { name: 'id', value: id } },
            'delete-color'
        );
        if (writeResult.error) throw writeResult.error;
        MakeSearchService.invalidateCache();
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

        const session = SessionManager.getSession();
        const role = (session?.role || '').toLowerCase();
        if (role === 'factory_manager' || role === 'factory manager' || role === 'factory') {
            return itemsWithDrawings.map((it: any) => {
                const { item_sale_price, unit_sale_price, total_sale_price, ...rest } = it;
                return rest;
            });
        }

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

    // ── 16B. Global Order Search ──────────────────────────────────────────────
    ipcMain.handle('make-search-orders', async (_e, rawPayload: any) => {
        try {
            const parsed = rawPayload || {};
            const orders = await MakeSearchService.searchOrders({
                query: parsed.query,
                status: parsed.status,
                limit: parsed.limit
            });

            const session = SessionManager.getSession();
            const role = (session?.role || '').toLowerCase();
            if (role === 'factory_manager' || role === 'factory manager' || role === 'factory') {
                return (orders || []).map((o: any) => {
                    const { sale_price, custom_price, ...rest } = o;
                    return rest;
                });
            }

            return orders;
        } catch (err: any) {
            console.error('[MAKE IPC] make-search-orders error:', err);
            return [];
        }
    });

    // ── 16C. Automatic Order Number Generation ─────────────────────────────────
    ipcMain.handle('make-get-next-order-number', async () => {
        try {
            return await MakeOrderService.generateUniqueOrderNumber();
        } catch (err: any) {
            console.error('[MAKE IPC] make-get-next-order-number error:', err);
            return MakeOrderService.generateOrderNumber();
        }
    });

    // ── 17. Global Product Attributes (Categories, Specs, Sizes, Colors) ─────
    ipcMain.handle('make-get-global-attributes', async () => {
        try {
            const res = await failoverEngine.executeRead(async (client) => {
                const [categoriesRes, specsRes, sizesRes, colorsRes] = await Promise.all([
                    client.from('make_product_categories').select('*').order('name', { ascending: true }),
                    client.from('make_product_specifications').select('*').is('product_id', null).order('spec_name', { ascending: true }),
                    client.from('make_product_sizes').select('*').is('product_id', null).order('size_label', { ascending: true }),
                    client.from('make_product_colors').select('*').is('product_id', null).order('color_name', { ascending: true })
                ]);

                return {
                    data: {
                        categories: decryptRows(categoriesRes.data || []),
                        specs: decryptRows(specsRes.data || []),
                        sizes: decryptRows(sizesRes.data || []),
                        colors: decryptRows(colorsRes.data || [])
                    },
                    error: categoriesRes.error || specsRes.error || sizesRes.error || colorsRes.error
                };
            }, 'make-get-global-attributes');

            return res.data || { categories: [], specs: [], sizes: [], colors: [] };
        } catch (err: any) {
            console.error('[MAKE IPC] make-get-global-attributes error:', err);
            return { categories: [], specs: [], sizes: [], colors: [] };
        }
    });

    ipcMain.handle('make-save-global-attribute', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            if (!canManageGlobalProductAttributes(session)) {
                return { success: false, error: 'Forbidden: Global attribute management requires "manage_global_product_attributes" permission.' };
            }

            const normalized = normalizeGlobalAttributePayload(rawPayload);
            const parsed = GlobalAttributeSchema.parse(normalized);
            const db = supabase; // Operational MAKE Master (NAS)

            if (parsed.type === 'category') {
                const categoryName = (parsed.category_name || parsed.name || '').trim();
                if (!categoryName) {
                    return { success: false, error: 'Category name is required.' };
                }
                const payload: any = {
                    name: categoryName,
                    code: parsed.code || parsed.spec_code || null,
                    description: parsed.description || parsed.details || parsed.spec_details || null,
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await db.from('make_product_categories').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    // Auto-sync products that point to this category ID to ensure single source of truth
                    await db.from('make_products').update({ category: categoryName }).eq('category_id', parsed.id);
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        supabaseAdmin.from('make_product_categories').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud category sync:', e.message));
                    }
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_categories').insert(payload).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        supabaseAdmin.from('make_product_categories').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud category sync:', e.message));
                    }
                    return { success: true, attribute: data };
                }
            } else if (parsed.type === 'spec') {
                const specName = (parsed.spec_name || parsed.name || '').trim();
                if (!specName) {
                    return { success: false, error: 'Specification name is required.' };
                }
                const payload: any = {
                    product_id: null,
                    spec_name: specName,
                    spec_code: parsed.spec_code || parsed.code || null,
                    spec_details: parsed.spec_details || parsed.details || null,
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                // image_url is an optional column on make_product_specifications (see migration 066).
                // Only send it when provided so databases without the column keep working for specs without images.
                const specImageUrl = parsed.image_url || null;
                const writeSpec = async (body: any) => {
                    const q = db.from('make_product_specifications');
                    return parsed.id
                        ? await q.update(body).eq('id', parsed.id).select().single()
                        : await q.insert(body).select().single();
                };
                const isMissingImageColumn = (e: any) =>
                    !!e && (e.code === 'PGRST204' || e.code === '42703') && /image_url/i.test(String(e.message || ''));

                const result = await writeSpec(specImageUrl ? { ...payload, image_url: specImageUrl } : payload);
                if (result.error) {
                    if (specImageUrl && isMissingImageColumn(result.error)) {
                        return {
                            success: false,
                            error: 'Saving specification with an image requires database migration 066 (image_url column). Please contact your administrator.'
                        };
                    }
                    throw result.error;
                }
                const data = result.data;
                MakeSearchService.invalidateCache();
                if (supabaseAdmin && data) {
                    supabaseAdmin.from('make_product_specifications').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud spec sync:', e.message));
                }
                return { success: true, attribute: data };
            } else if (parsed.type === 'size') {
                const rawLabel = (parsed.size_label || parsed.name || '').trim();
                const sizeLabel = (rawLabel && rawLabel.toLowerCase() !== 'null' && rawLabel.toLowerCase() !== 'undefined') ? rawLabel : null;
                const payload: any = {
                    product_id: null,
                    size_label: sizeLabel,
                    length: parsed.length ? parseFloat(String(parsed.length)) : null,
                    width: parsed.width ? parseFloat(String(parsed.width)) : null,
                    height: parsed.height ? parseFloat(String(parsed.height)) : null,
                    diameter: parsed.diameter ? parseFloat(String(parsed.diameter)) : null,
                    unit: parsed.unit || 'mm',
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await db.from('make_product_sizes').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        supabaseAdmin.from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
                    }
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_sizes').insert(payload).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        supabaseAdmin.from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
                    }
                    return { success: true, attribute: data };
                }
            } else if (parsed.type === 'color') {
                const colorName = (parsed.color_name || parsed.name || '').trim();
                if (!colorName) {
                    return { success: false, error: 'Color name is required.' };
                }
                const payload: any = {
                    product_id: null,
                    color_name: colorName,
                    color_code: parsed.color_code || parsed.code || null,
                    image_url: parsed.image_url || null,
                    is_active: parsed.is_active !== undefined ? parsed.is_active : true
                };
                if (parsed.id) {
                    const { data, error } = await db.from('make_product_colors').update(payload).eq('id', parsed.id).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        supabaseAdmin.from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
                    }
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_colors').insert(payload).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        supabaseAdmin.from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
                    }
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
            if (!canManageGlobalProductAttributes(session)) {
                return { success: false, error: 'Forbidden: Category deletion requires "manage_global_product_attributes" permission.' };
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

            // 3. Safe to delete from operational master (NAS)
            const writeResult = await failoverEngine.executeWrite(
                async client => client.from('make_product_categories').delete().eq('id', catId),
                { table: 'make_product_categories', operation: 'delete', primaryKey: { name: 'id', value: catId } },
                'delete-category'
            );
            if (writeResult.error) throw writeResult.error;
            MakeSearchService.invalidateCache();
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

            const junctionPromises: Promise<any>[] = [];

            if (specIds !== undefined) {
                junctionPromises.push((async () => {
                    await failoverEngine.executeWrite(async client => {
                        await client.from('make_product_specification_links').delete().eq('product_id', productId);
                        if (specIds.length > 0) {
                            const rows = specIds.map(specId => ({ product_id: productId, spec_id: specId }));
                            return await client.from('make_product_specification_links').insert(rows).select();
                        }
                        return { data: [], error: null };
                    }, { table: 'make_product_specification_links', operation: 'insert' }, 'assign-specs');
                })());
            }

            if (sizeIds !== undefined) {
                junctionPromises.push((async () => {
                    await failoverEngine.executeWrite(async client => {
                        await client.from('make_product_size_links').delete().eq('product_id', productId);
                        if (sizeIds.length > 0) {
                            const rows = sizeIds.map(sizeId => ({ product_id: productId, size_id: sizeId }));
                            return await client.from('make_product_size_links').insert(rows).select();
                        }
                        return { data: [], error: null };
                    }, { table: 'make_product_size_links', operation: 'insert' }, 'assign-sizes');
                })());
            }

            if (colorIds !== undefined) {
                junctionPromises.push((async () => {
                    await failoverEngine.executeWrite(async client => {
                        await client.from('make_product_color_links').delete().eq('product_id', productId);
                        if (colorIds.length > 0) {
                            const rows = colorIds.map(colorId => ({ product_id: productId, color_id: colorId }));
                            return await client.from('make_product_color_links').insert(rows).select();
                        }
                        return { data: [], error: null };
                    }, { table: 'make_product_color_links', operation: 'insert' }, 'assign-colors');
                })());
            }

            await Promise.all(junctionPromises);
            MakeSearchService.invalidateCache();
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

    // ── 22. Customer Autocomplete & Search for Place Order ────────────────────
    ipcMain.handle('make-search-customers', async (_e, rawQuery: string) => {
        try {
            requireSession();
            const trimmed = (rawQuery || '').trim();
            if (!trimmed || trimmed.length < 2) {
                return { success: true, customers: [] };
            }

            // Extract numeric digits for phone and ID searches
            const digits = trimmed.replace(/\D/g, '');
            const isNumeric = /^\d+$/.test(trimmed);

            // Construct safe PostgREST OR conditions
            const conditions: string[] = [
                `name.ilike.%${trimmed}%`,
                `phone.ilike.%${trimmed}%`,
                `email.ilike.%${trimmed}%`
            ];

            if (digits.length >= 3 && digits !== trimmed) {
                conditions.push(`phone.ilike.%${digits}%`);
            }
            if (isNumeric && Number(trimmed) > 0 && Number(trimmed) < 2147483647) {
                conditions.push(`id.eq.${Number(trimmed)}`);
            }

            const orFilter = conditions.join(',');
            const { data, error } = await supabase
                .from('billing_customers')
                .select('id, name, phone, email, address, company')
                .or(orFilter)
                .order('name')
                .limit(15);

            if (error) {
                console.error('[MAKE IPC] make-search-customers database error:', error);
                return { success: false, error: error.message, customers: [] };
            }

            const decrypted = decryptRows(data || []);
            return {
                success: true,
                customers: decrypted.map(c => ({
                    id: c.id,
                    name: c.name || '',
                    phone: c.phone || null,
                    email: c.email || null,
                    address: c.address || null,
                    company: c.company || null
                }))
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-search-customers error:', err);
            return { success: false, error: err.message, customers: [] };
        }
    });

    // ── 23. Customer Authoritative Details for Place Order ────────────────────
    ipcMain.handle('make-get-customer-details', async (_e, customerId: number | string) => {
        try {
            requireSession();
            const cId = Number(customerId);
            if (!cId || isNaN(cId)) {
                return { success: false, error: 'Invalid customer ID' };
            }

            const { data: customer, error: custError } = await supabase
                .from('billing_customers')
                .select('id, name, phone, email, address, company')
                .eq('id', cId)
                .maybeSingle();

            if (custError) {
                console.error('[MAKE IPC] make-get-customer-details error:', custError);
                return { success: false, error: custError.message };
            }
            if (!customer) {
                return { success: false, error: 'Customer not found' };
            }

            const decrypted = decryptObject(customer, ['address']);

            // Optionally look up most recent make_orders delivery record for this customer
            let recentDelivery: any = null;
            try {
                const { data: latestOrder } = await supabase
                    .from('make_orders')
                    .select('delivery_address, location_landmark, receiver_name, receiver_phone')
                    .eq('customer_id', cId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestOrder) {
                    recentDelivery = latestOrder;
                }
            } catch (e) {
                console.warn('[MAKE IPC] Optional recent delivery lookup failed:', e);
            }

            return {
                success: true,
                customer: {
                    id: decrypted.id,
                    name: decrypted.name || '',
                    phone: decrypted.phone || null,
                    email: decrypted.email || null,
                    address: decrypted.address || null,
                    company: decrypted.company || null,
                    delivery_address: recentDelivery?.delivery_address || decrypted.address || null,
                    location_landmark: recentDelivery?.location_landmark || null,
                    receiver_name: recentDelivery?.receiver_name || decrypted.name || null,
                    receiver_phone: recentDelivery?.receiver_phone || decrypted.phone || null
                }
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-get-customer-details error:', err);
            return { success: false, error: err.message };
        }
    });
}

