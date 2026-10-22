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
import { DurableUploadService } from '../../services/media/DurableUploadService';
import { decryptRows, decryptObject } from '../../field-encryption';
import {
    CreateMakeOrderSchema,
    ApproveMakeOrderSchema,
    DesignerSaveSpecsAndPricingSchema,
    UpdateProductionStageSchema,
    AlterMakeOrderSchema,
    DeleteMakeOrderSchema,
    DeleteOrderPdfSchema,
    DeleteItemPdfSchema,
    hasUnsupportedStorageScheme,
    CatalogProductSchema,
    CatalogSpecSchema,
    CatalogSizeSchema,
    CatalogColorSchema,
    GlobalAttributeSchema,
    normalizeGlobalAttributePayload,
    AssignProductAttributesSchema,
    SearchCatalogProductsSchema,
    RequestProductionApprovalSchema,
    DecideProductionApprovalSchema,
    RecordOrderPaymentSchema
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
 * Detects directory traversal patterns in raw and percent-encoded URL or path strings.
 * Evaluates both raw and decoded representations before any URL normalization can erase traversal segments.
 */
export function hasPathTraversal(str: string): boolean {
    if (!str || typeof str !== 'string') return false;

    // Direct check for plain dot-dot traversal sequences
    if (
        str.includes('../') ||
        str.includes('..\\') ||
        str.includes('/..') ||
        str.includes('\\..') ||
        str === '..'
    ) {
        return true;
    }

    // Direct check for percent-encoded dot-dot combinations (%2e = '.')
    if (/%2e%2e|%2e\.|\.%2e|\.\.%2f|\.\.%5c|%2f\.\.|%5c\.\./i.test(str)) {
        return true;
    }

    // Check decoded representation(s) (handles single and double percent-encoding)
    let currentStr = str;
    for (let depth = 0; depth < 2; depth++) {
        try {
            const decoded = decodeURIComponent(currentStr);
            if (decoded === currentStr) break;
            currentStr = decoded;

            if (
                currentStr.includes('../') ||
                currentStr.includes('..\\') ||
                currentStr.includes('/..') ||
                currentStr.includes('\\..') ||
                currentStr === '..'
            ) {
                return true;
            }

            // Check if any path segment split by / or \ is exactly '..'
            const segments = currentStr.split(/[/\\]/);
            for (const seg of segments) {
                if (seg.trim() === '..') {
                    return true;
                }
            }
        } catch {
            if (/%2e/i.test(currentStr)) {
                return true;
            }
            break;
        }
    }

    return false;
}

/**
 * Determines whether a URL matches the exact approved Cloudflare tunnel HTTPS endpoint (storage.lenas.me).
 * Parses the URL to strictly validate that:
 *  - Protocol is 'https:'
 *  - Hostname is exactly 'storage.lenas.me' (no lookalike domains or suffixes)
 *  - Port is default or explicit '443'
 */
export function isApprovedCloudflareTunnelUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
        const u = new URL(urlStr);
        if (u.protocol.toLowerCase() !== 'https:') return false;
        if (u.hostname.toLowerCase() !== 'storage.lenas.me') return false;
        const effectivePort = u.port || '443';
        if (effectivePort !== '443') return false;
        return true;
    } catch {
        return false;
    }
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
    if (hasPathTraversal(trimmed)) {
        return { isValid: false, error: 'Path traversal is not permitted in URL path', candidates: [] };
    }

    const candidateBases = typeof getNasStorageCandidates === 'function'
        ? getNasStorageCandidates()
        : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];

    // 1. app-media://nas/...
    if (/^app-media:\/\/nas\//i.test(trimmed)) {
        const sub = trimmed.replace(/^app-media:\/\/nas\/?/i, '');
        const cleanSub = decodeURIComponent(sub).replace(/^\/+/, '');
        if (hasPathTraversal(cleanSub)) {
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
    if (hasPathTraversal(cleanSub)) {
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

    // Validate raw redirect target before any URL parsing or normalization
    if (hasPathTraversal(redirectUrlStr)) {
        throw new Error('Path traversal is not permitted in redirect URL');
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

    // Path traversal defense in resolved redirect URL
    if (
        hasPathTraversal(redirectParsed.pathname) ||
        hasPathTraversal(decodeURIComponent(redirectParsed.pathname))
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
    let targetPath: string;
    try {
        const dest = sanitizeDownloadDestination(fileName, tempDir);
        targetPath = dest.targetPath;
    } catch (err: any) {
        return { success: false, error: err.message || 'Invalid filename' };
    }

    // Check if this is a Supabase private bucket object or signed URL
    const canonicalSupabase = extractCanonicalSupabaseKey(url);
    const isSupabaseUrl = url.includes('.supabase.co/') || url.startsWith('make-order-files/') || url.startsWith('supabase://') || !!canonicalSupabase;
    if (isSupabaseUrl) {
        try {
            let fetchUrl = url;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                const resolved = await resolveAttachmentUrl(canonicalSupabase ? canonicalSupabase.objectPath : url);
                if (!resolved.url) {
                    return { success: false, error: 'Could not resolve attachment for download' };
                }
                fetchUrl = resolved.url;
            }

            const electron = await import('electron').catch(() => null);
            const fetchFn: typeof fetch = (electron as any)?.net?.fetch || globalThis.fetch;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(new Error(`Download timed out after ${timeoutMs}ms`)), timeoutMs);

            try {
                const resp = await fetchFn(fetchUrl, { signal: controller.signal });
                if (!resp.ok) {
                    return { success: false, error: `Supabase download failed: HTTP ${resp.status}` };
                }
                const arrayBuf = await resp.arrayBuffer();
                fs.writeFileSync(targetPath, Buffer.from(arrayBuf));
                return { success: true, path: targetPath };
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (err: any) {
            return { success: false, error: err.message || 'Failed to download attachment from cloud buffer' };
        }
    }

    const validation = validateAndNormalizeDownloadUrl(url);
    if (!validation.isValid) {
        return { success: false, error: validation.error || 'Invalid download URL' };
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
                // Attach Cloudflare Access headers strictly to the exact approved storage.lenas.me HTTPS endpoint.
                // Never attached to lookalike hostnames, unapproved ports, or unencrypted HTTP URLs.
                const isExactTunnel = isApprovedCloudflareTunnelUrl(currentUrl);
                const headers: Record<string, string> = isExactTunnel ? { ...cfHeaders } : {};

                res = await fetchFn(currentUrl, {
                    headers,
                    signal: controller.signal,
                    redirect: 'manual'
                });

                if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
                    const rawLocation = res.headers.get('location')!;

                    // Validate raw Location header before URL normalization can erase traversal segments
                    if (hasPathTraversal(rawLocation)) {
                        throw new Error('Path traversal is not permitted in redirect URL');
                    }

                    let resolvedRedirect: string;
                    try {
                        resolvedRedirect = new URL(rawLocation, currentUrl).href;
                    } catch {
                        throw new Error('Malformed redirect URL');
                    }

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

/**
 * Validates whether a raw URL string is an authorized, exact TrueNAS endpoint.
 * Enforces exact hostnames and approved ports, preventing lookalike domain prefix bypasses.
 */
export function isTrustedNasUrl(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        if (hasPathTraversal(parsed.pathname) || hasPathTraversal(decodeURIComponent(parsed.pathname))) return false;

        const lowerHost = parsed.hostname.toLowerCase();
        if (lowerHost === 'storage.lenas.me') {
            const port = parsed.port || '443';
            return parsed.protocol === 'https:' && port === '443';
        }
        if (lowerHost === '100.88.85.6' || lowerHost === '192.168.1.14') {
            const port = parsed.port || '80';
            return parsed.protocol === 'http:' && (port === '8080' || port === '8081' || port === '80');
        }
        return isApprovedNasHost(parsed.hostname, parsed.port);
    } catch {
        return false;
    }
}

/**
 * Extracts and canonicalizes the storage path within 'make-order-files' bucket.
 * Guarantees no directory traversal or null bytes, and strips query parameters.
 */
export function extractCanonicalSupabaseKey(ref: string): { fullKey: string; objectPath: string } | null {
    if (!ref || typeof ref !== 'string') return null;
    const trimmed = ref.trim();
    if (!trimmed) return null;
    if (trimmed.includes('..') || trimmed.includes('\0') || trimmed.includes('%00')) return null;

    let subPath = '';
    if (trimmed.includes('/storage/v1/object/sign/make-order-files/')) {
        subPath = decodeURIComponent(trimmed.split('/storage/v1/object/sign/make-order-files/')[1] || '').split('?')[0];
    } else if (trimmed.includes('/storage/v1/object/public/make-order-files/')) {
        subPath = decodeURIComponent(trimmed.split('/storage/v1/object/public/make-order-files/')[1] || '').split('?')[0];
    } else if (trimmed.startsWith('supabase://make-order-files/')) {
        subPath = trimmed.replace(/^supabase:\/\/make-order-files\//, '').split('?')[0];
    } else if (trimmed.startsWith('make-order-files/')) {
        subPath = trimmed.replace(/^make-order-files\//, '').split('?')[0];
    } else if (trimmed.startsWith('/make-order-files/')) {
        subPath = trimmed.replace(/^\/make-order-files\//, '').split('?')[0];
    } else if (!trimmed.includes('://') && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
        subPath = trimmed.split('?')[0];
    } else {
        return null;
    }

    subPath = subPath.replace(/^\/+/, '').trim();
    if (!subPath || subPath.includes('..') || subPath.includes('\0')) return null;

    return {
        fullKey: `make-order-files/${subPath}`,
        objectPath: subPath
    };
}

/**
 * Resolves a durable attachment reference (TrueNAS URL, Supabase private object key, or local pending file)
 * into a safe, authorized access URL for viewing/downloading.
 *
 * Rules:
 *  - Do NOT guess unconfirmed URLs.
 *  - Do NOT return file:// as a successful remote attachment.
 *  - Private bucket objects in 'make-order-files' are resolved on-demand via short-lived signed URLs (never persisted).
 *  - TrueNAS confirmed URLs (storage.lenas.me or 100.88.85.6) are verified via exact hostname and port matching.
 *  - Legacy unauthenticated public URLs to private buckets are recognized and resolved via signed URLs.
 */
export async function resolveAttachmentUrl(p: string): Promise<{ path: string; name: string; url: string; isPending?: boolean }> {
    if (!p || typeof p !== 'string') return { path: '', name: 'attachment', url: '' };

    const name = p.split('/').pop()?.replace(/^\d+_/, '')?.split('?')[0] || 'document';

    // 1. Staged local / pending upload
    if (p.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(p)) {
        return { path: p, name, url: '', isPending: true };
    }

    // 2. Confirmed TrueNAS Remote URL (exact hostname & port check, not string prefix)
    if (isTrustedNasUrl(p)) {
        return { path: p, name, url: p, isPending: false };
    }

    // 3. Supabase Storage Object Key in private bucket 'make-order-files'
    const canonical = extractCanonicalSupabaseKey(p);
    if (canonical) {
        const storagePath = canonical.objectPath;
        try {
            const { data, error } = await supabase.storage.from('make-order-files').createSignedUrl(storagePath, 3600);
            if (!error && data?.signedUrl) {
                return { path: p, name, url: data.signedUrl, isPending: true };
            }
        } catch (sErr: any) {
            console.warn('[resolveAttachmentUrl] Signed URL creation failed:', sErr.message);
        }
    }

    // 4. Other approved HTTP/HTTPS URLs (external or candidate hosts)
    if (isTrustedNasUrl(p)) {
        return { path: p, name, url: p, isPending: false };
    }

    // 5. If missing or unresolvable, NEVER return a guessed URL; mark pending if it resembles a durable key or upload reference
    const isPending = p.includes('upl_') || p.includes('make-order-files/');
    return { path: p, name, url: '', isPending: isPending || undefined };
}

/**
 * Verifies if the session user has permissions to modify MAKE orders or their attachments.
 *
 * Rules:
 *  - Superadmin, Admin, and Manager have global modification authority.
 *  - Furniture Designers have modification authority over orders not yet in or past production.
 *  - Users with explicit permissions ('make_edit', 'write_make', 'make_admin', 'delete_make_order',
 *    'make_delete', 'alter_make_order', 'manage_orders') have modification authority.
 *  - Read-only users, operators, guests, auditors, and unauthenticated sessions are strictly rejected.
 *  - If an authoritative order record is provided and has reached or passed production ('Production On Going', etc.),
 *    only Administrators retain modification rights.
 */
export function canModifyMakeOrder(
    session: UserSession | null | undefined,
    order?: { status?: string | null } | null
): boolean {
    if (!session) return false;
    const role = (session.role || '').toLowerCase().trim();
    const isAdmin = role === 'admin' || role === 'superadmin' || role === 'manager';
    const isDesigner = (
        role === 'furniture_designer' ||
        role === 'furniture designer' ||
        role === 'designer' ||
        role === 'make_designer'
    );
    const hasModifyPerm = !!(
        session.permissions && (
            session.permissions['make_edit'] ||
            session.permissions['write_make'] ||
            session.permissions['make_admin'] ||
            session.permissions['delete_make_order'] ||
            session.permissions['make_delete'] ||
            session.permissions['alter_make_order'] ||
            session.permissions['manage_orders']
        )
    );

    if (!isAdmin && !isDesigner && !hasModifyPerm) {
        return false;
    }

    // If an authoritative order record is provided, check stage boundaries
    if (order && order.status) {
        const postProductionStages = [
            'production on going',
            'production',
            'finishing',
            'packaging',
            'ready to ship',
            'delivered',
            'welding',
            'painting',
            'ready for dispatch'
        ];
        const statusNorm = order.status.trim().toLowerCase();
        if (postProductionStages.includes(statusNorm) && !isAdmin) {
            return false;
        }
    }

    return true;
}

/**
 * Strictly verifies whether an attachment reference is an approved storage reference.
 * Rejects illegal schemes (javascript:, file:, data:, etc.), traversal paths,
 * null bytes, and untrusted HTTP/HTTPS endpoints.
 */
export function isAllowedAttachmentReference(ref: string): boolean {
    if (!ref || typeof ref !== 'string') return false;
    const trimmed = ref.trim();
    if (trimmed.length === 0) return false;
    if (hasPathTraversal(trimmed) || trimmed.includes('\0') || trimmed.includes('%00')) return false;
    if (hasUnsupportedStorageScheme(trimmed)) return false;

    if (/^https?:\/\//i.test(trimmed)) {
        if (isTrustedNasUrl(trimmed)) return true;
        if (extractCanonicalSupabaseKey(trimmed) !== null) return true;
        return false;
    }

    if (/^app-media:\/\/nas\//i.test(trimmed)) return true;

    // Relative storage key or filename without dangerous schemes or Windows drive prefixes
    if (!trimmed.includes('://') && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
        return true;
    }

    return false;
}

/**
 * Checks if a stored attachment reference matches the requested deletion target.
 * Supports exact string equality, canonical Supabase object key equivalence,
 * and TrueNAS URL subpath equivalence.
 */
export function isMatchingAttachment(recordedRef: string, requestedRef: string): boolean {
    if (!recordedRef || !requestedRef) return false;
    const recTrim = recordedRef.trim();
    const reqTrim = requestedRef.trim();
    if (recTrim === reqTrim) return true;

    // Supabase canonical key comparison
    const canRec = extractCanonicalSupabaseKey(recTrim);
    const canReq = extractCanonicalSupabaseKey(reqTrim);
    if (canRec && canReq && canRec.objectPath === canReq.objectPath) {
        return true;
    }

    // NAS subpath comparison
    if (isTrustedNasUrl(recTrim) && isTrustedNasUrl(reqTrim)) {
        try {
            const u1 = new URL(recTrim);
            const u2 = new URL(reqTrim);
            const p1 = decodeURIComponent(u1.pathname).replace(/^\/+/, '');
            const p2 = decodeURIComponent(u2.pathname).replace(/^\/+/, '');
            if (p1 === p2) return true;
        } catch {}
    }

    return false;
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
     * Verifies if the session user has permissions to view product blueprint files.
     */
    function canViewBlueprintSession(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (session.permissions && session.permissions['view_product_blueprint'] !== undefined) {
            return !!session.permissions['view_product_blueprint'];
        }
        if (
            role === 'furniture_designer' ||
            role === 'furniture designer' ||
            role === 'designer' ||
            role === 'make_designer'
        ) return true;
        return false;
    }

    /**
     * Verifies if the session user has permissions to view cost prices of products.
     */
    function canViewCostPriceSession(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (['salesperson', 'salesman', 'sales', 'factory_manager', 'factory manager', 'factory'].includes(role)) return true;
        if (['furniture_designer', 'furniture designer', 'designer', 'make_designer'].includes(role)) return true;
        if (session.permissions && session.permissions['view_product_cost_price'] !== undefined) {
            return !!session.permissions['view_product_cost_price'];
        }
        return !!(session.permissions && (session.permissions['view_product_cost_price'] || session.permissions['view_cost_price'] || session.permissions['set_make_cost_price']));
    }

    /**
     * Verifies if the session user has permissions to view sale prices of products.
     */
    function canViewSalePriceSession(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (['salesperson', 'salesman', 'sales', 'factory_manager', 'factory manager', 'factory'].includes(role)) return false;
        if (['furniture_designer', 'furniture designer', 'designer', 'make_designer'].includes(role)) return true;
        if (session.permissions && session.permissions['view_product_sale_price'] !== undefined) {
            return !!session.permissions['view_product_sale_price'];
        }
        return false;
    }

    function canRecordMakePayment(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase().trim();
        if (['admin', 'superadmin', 'manager', 'salesperson', 'salesman', 'sales', 'furniture_designer', 'furniture designer', 'designer', 'make_designer'].includes(role)) return true;
        return !!(session.permissions && session.permissions['make_record_payment']);
    }

    /**
     * Verifies if the session user has permissions to view product maximum discount limits.
     */
    function canViewMaxDiscountSession(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (session.permissions && session.permissions['view_product_max_discount'] !== undefined) {
            return !!session.permissions['view_product_max_discount'];
        }
        if (role === 'factory_manager' || role === 'factory manager' || role === 'factory') {
            return !!(session.permissions && session.permissions['view_product_max_discount']);
        }
        return true;
    }

    /**
     * Verifies if the session user has permissions to edit/set product cost prices.
     * Strictly Superadmin, Admin, and Furniture Designer.
     * Factory Manager and Salespersons cannot set or edit cost prices.
     */
    function canEditCostPriceSession(session: UserSession): boolean {
        const role = (session.role || '').toLowerCase();
        if (role === 'salesperson' || role === 'salesman' || role === 'sales') return false;
        if (role === 'factory_manager' || role === 'factory manager' || role === 'factory') return false;
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (
            role === 'furniture_designer' ||
            role === 'furniture designer' ||
            role === 'designer' ||
            role === 'make_designer'
        ) return true;
        return !!(session.permissions && session.permissions['set_make_cost_price']);
    }

    /**
     * Verifies if the session user has permissions to approve MAKE orders.
     */
    function canApproveOrder(session: UserSession): boolean {
        const role = session.role.toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'salesperson' || role === 'salesman' || role === 'sales' || role === 'manager') return true;
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

    /**
     * Verifies if the session user has permissions to view MAKE orders and attachments.
     */
    function canViewMakeOrders(session: UserSession): boolean {
        if (!session) return false;
        const role = (session.role || '').toLowerCase();
        if (role === 'admin' || role === 'superadmin' || role === 'manager') return true;
        if (
            role === 'furniture_designer' || role === 'furniture designer' || role === 'designer' || role === 'make_designer' ||
            role === 'salesperson' || role === 'salesman' || role === 'sales' ||
            role === 'factory_manager' || role === 'factory manager' || role === 'factory' ||
            role === 'operator' || role === 'production'
        ) return true;
        return !!(
            session.permissions && (
                session.permissions['make_view'] ||
                session.permissions['make_read'] ||
                session.permissions['make_create'] ||
                session.permissions['make_orders'] ||
                session.permissions['make_admin'] ||
                session.permissions['make_production'] ||
                session.permissions['view_orders'] ||
                session.permissions['read_orders']
            )
        );
    }

    /**
     * Verifies that a given attachment reference or storage key belongs to an
     * order or item the current session is authorized to access.
     * Fails closed for unauthorized, malformed, or unassociated references.
     * Guarantees that parsed upload IDs cannot bypass path authorization,
     * unassociated buffered uploads cannot be signed, and NAS URLs require exact hostnames.
     */
    async function isAuthorizedAttachment(rawRef: string, _session: UserSession): Promise<{
        authorized: boolean;
        canonicalKey?: string;
        isNas?: boolean;
        isLocalPending?: boolean;
        error?: string;
    }> {
        if (!rawRef || typeof rawRef !== 'string' || !rawRef.trim()) {
            return { authorized: false, error: 'Empty or invalid attachment reference' };
        }
        // Reject path traversal, control chars, null bytes
        if (hasPathTraversal(rawRef) || rawRef.includes('\0') || rawRef.includes('%00')) {
            return { authorized: false, error: 'Path traversal or illegal characters detected' };
        }

        const uploadService = DurableUploadService.getInstance();
        const db = (uploadService as any).db;

        // 1. Confirmed TrueNAS Remote URLs (Exact hostname & port check)
        if (isTrustedNasUrl(rawRef)) {
            if (db) {
                try {
                    const row = db.prepare(`
                        SELECT id, entity_type, entity_id, status FROM durable_uploads
                        WHERE remote_url_nas = ?
                    `).get(rawRef) as any;
                    if (row && (row.entity_type === 'make_orders' || row.entity_type === 'make_order_items') && row.entity_id) {
                        if (row.entity_type === 'make_orders') {
                            const { data: order } = await supabase.from('make_orders')
                                .select('id, pdf_urls, invoice_attachment_urls')
                                .eq('id', row.entity_id)
                                .maybeSingle();
                            if (order) {
                                const pdfs = Array.isArray(order.pdf_urls) ? order.pdf_urls : [];
                                const invs = Array.isArray(order.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                                if (pdfs.includes(rawRef) || invs.includes(rawRef)) {
                                    return { authorized: true, canonicalKey: rawRef, isNas: true };
                                }
                            }
                        } else if (row.entity_type === 'make_order_items') {
                            const { data: item } = await supabase.from('make_order_items')
                                .select('id, technical_drawing_url, pdf_urls')
                                .eq('id', row.entity_id)
                                .maybeSingle();
                            if (item) {
                                const pdfs = Array.isArray(item.pdf_urls) ? item.pdf_urls : [];
                                if (item.technical_drawing_url === rawRef || pdfs.includes(rawRef)) {
                                    return { authorized: true, canonicalKey: rawRef, isNas: true };
                                }
                            }
                        }
                    }
                } catch {}
            }

            try {
                const { data: matchedOrders } = await supabase.from('make_orders').select('id, pdf_urls, invoice_attachment_urls');
                if (Array.isArray(matchedOrders)) {
                    const found = matchedOrders.some((o: any) => {
                        const pdfs = Array.isArray(o.pdf_urls) ? o.pdf_urls : [];
                        const invs = Array.isArray(o.invoice_attachment_urls) ? o.invoice_attachment_urls : [];
                        return pdfs.includes(rawRef) || invs.includes(rawRef);
                    });
                    if (found) return { authorized: true, canonicalKey: rawRef, isNas: true };
                }
            } catch {}

            try {
                const { data: matchedItems } = await supabase.from('make_order_items').select('id, technical_drawing_url, pdf_urls');
                if (Array.isArray(matchedItems)) {
                    const found = matchedItems.some((it: any) => {
                        const pdfs = Array.isArray(it.pdf_urls) ? it.pdf_urls : [];
                        return it.technical_drawing_url === rawRef || pdfs.includes(rawRef);
                    });
                    if (found) return { authorized: true, canonicalKey: rawRef, isNas: true };
                }
            } catch {}

            return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
        }

        // 2. Staged Local Files (Narrow explicit policy: local file on disk staged in SQLite)
        if (rawRef.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(rawRef)) {
            if (db) {
                try {
                    const rawClean = rawRef.replace(/^file:\/\/\/?/, '');
                    const row = db.prepare(`
                        SELECT id, local_path, status FROM durable_uploads
                        WHERE local_path = ? OR local_path LIKE ?
                    `).get(rawClean, `%${rawClean}%`) as any;
                    if (row && row.status === 'staged_local' && fs.existsSync(row.local_path)) {
                        return { authorized: true, canonicalKey: rawRef, isLocalPending: true };
                    }
                } catch {}
            }
            return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
        }

        // 3. Supabase Storage Object Key in private bucket 'make-order-files'
        const canonical = extractCanonicalSupabaseKey(rawRef);
        if (!canonical) {
            return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
        }

        const { fullKey, objectPath } = canonical;

        // (a) Verify in local SQLite registry by exact recorded remote_url_supabase.
        // A matching local record and nonempty owner metadata must NOT, by themselves, authorize a signed URL.
        // For an ordinary owned attachment, verify that the claimed owner row exists and actually contains the key.
        if (db) {
            try {
                const row = db.prepare(`
                    SELECT id, entity_type, entity_id, status, remote_url_supabase FROM durable_uploads
                    WHERE remote_url_supabase = ? OR remote_url_supabase = ?
                `).get(fullKey, objectPath) as any;

                if (row) {
                    const hasValidOwner = (row.entity_type === 'make_orders' || row.entity_type === 'make_order_items') && !!row.entity_id;
                    if (!hasValidOwner) {
                        // Unassociated buffered upload: cannot be signed
                        return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
                    }

                    if (row.entity_type === 'make_orders') {
                        const { data: order } = await supabase.from('make_orders')
                            .select('id, pdf_urls, invoice_attachment_urls')
                            .eq('id', row.entity_id)
                            .maybeSingle();

                        if (order) {
                            const pdfs = Array.isArray(order.pdf_urls) ? order.pdf_urls : [];
                            const invs = Array.isArray(order.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                            const allRefs = [...pdfs, ...invs].filter(Boolean);
                            const matches = allRefs.some((r: string) => {
                                const can = extractCanonicalSupabaseKey(r);
                                return r === rawRef || r === fullKey || r === objectPath || (can && can.objectPath === objectPath);
                            });
                            if (matches) {
                                return { authorized: true, canonicalKey: objectPath };
                            }
                        }
                        // Claimed order does not exist or does not contain this attachment key
                        return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
                    } else if (row.entity_type === 'make_order_items') {
                        const { data: item } = await supabase.from('make_order_items')
                            .select('id, technical_drawing_url, pdf_urls')
                            .eq('id', row.entity_id)
                            .maybeSingle();

                        if (item) {
                            const pdfs = Array.isArray(item.pdf_urls) ? item.pdf_urls : [];
                            const itemRefs = [item.technical_drawing_url, ...pdfs].filter(Boolean);
                            const matches = itemRefs.some((r: string) => {
                                const can = extractCanonicalSupabaseKey(r);
                                return r === rawRef || r === fullKey || r === objectPath || (can && can.objectPath === objectPath);
                            });
                            if (matches) {
                                return { authorized: true, canonicalKey: objectPath };
                            }
                        }
                        // Claimed item does not exist or does not contain this attachment key
                        return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
                    }
                }
            } catch {}
        }

        // (b) Verify in remote database make_orders (for attachments not in local upload queue)
        try {
            const orderMatch = objectPath.match(/^(\d+)\//);
            if (orderMatch) {
                const candidateOrderId = parseInt(orderMatch[1], 10);
                const { data: order } = await supabase.from('make_orders')
                    .select('id, pdf_urls, invoice_attachment_urls')
                    .eq('id', candidateOrderId)
                    .maybeSingle();

                if (order) {
                    const pdfs = Array.isArray(order.pdf_urls) ? order.pdf_urls : [];
                    const invs = Array.isArray(order.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                    const allRefs = [...pdfs, ...invs].filter(Boolean);
                    const matches = allRefs.some(r => {
                        const can = extractCanonicalSupabaseKey(r);
                        return r === rawRef || r === fullKey || r === objectPath || (can && can.objectPath === objectPath);
                    });
                    if (matches) {
                        return { authorized: true, canonicalKey: objectPath };
                    }
                }
            }

            const { data: matchedOrders } = await supabase.from('make_orders')
                .select('id, pdf_urls, invoice_attachment_urls');

            if (Array.isArray(matchedOrders)) {
                const found = matchedOrders.some((o: any) => {
                    const pdfs = Array.isArray(o.pdf_urls) ? o.pdf_urls : [];
                    const invs = Array.isArray(o.invoice_attachment_urls) ? o.invoice_attachment_urls : [];
                    return [...pdfs, ...invs].filter(Boolean).some((r: string) => {
                        const can = extractCanonicalSupabaseKey(r);
                        return r === rawRef || r === fullKey || r === objectPath || (can && can.objectPath === objectPath);
                    });
                });
                if (found) {
                    return { authorized: true, canonicalKey: objectPath };
                }
            }
        } catch (err: any) {
            console.warn('[isAuthorizedAttachment] make_orders check error:', err.message);
        }

        // (c) Verify in remote database make_order_items (for attachments not in local upload queue)
        try {
            const { data: matchedItems } = await supabase.from('make_order_items')
                .select('id, technical_drawing_url, pdf_urls');

            if (Array.isArray(matchedItems)) {
                const found = matchedItems.some((it: any) => {
                    const pdfs = Array.isArray(it.pdf_urls) ? it.pdf_urls : [];
                    const itemRefs = [it.technical_drawing_url, ...pdfs].filter(Boolean);
                    return itemRefs.some((r: string) => {
                        const can = extractCanonicalSupabaseKey(r);
                        return r === rawRef || r === fullKey || r === objectPath || (can && can.objectPath === objectPath);
                    });
                });
                if (found) {
                    return { authorized: true, canonicalKey: objectPath };
                }
            }
        } catch (err: any) {
            console.warn('[isAuthorizedAttachment] make_order_items check error:', err.message);
        }

        return { authorized: false, error: 'Forbidden: Attachment is unassociated or access is unauthorized.' };
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
            const isAdmin = role === 'admin' || role === 'superadmin' || role === 'manager';
            if (!isAdmin && rawOrder.salesman_id && Number(rawOrder.salesman_id) !== session.userId) {
                throw new Error('Forbidden: Only administrators can place orders on behalf of another salesperson.');
            }
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
                (parsed.override as any).timestamp = (parsed.override as any).timestamp || new Date().toISOString();
            }

            const result = await MakeOrderService.approveOrder({
                orderId: Number(parsed.orderId),
                actorSession: session,
                override: parsed.override as any,
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
                orderId: Number(parsed.orderId),
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
                                `make-order-files/${parsed.orderId}/stages`,
                                { entityType: 'make_orders', entityId: parsed.orderId, fieldName: 'current_stage_photo' }
                            );
                            if (uploadResult.success || uploadResult.isPendingUpload) {
                                finalPhotoUrl = uploadResult.durableKey || uploadResult.publicUrl || null;
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
            const session = requireSession();
            if (!canModifyMakeOrder(session)) {
                throw new Error('Forbidden: Session lacks MAKE order modification permissions');
            }
            const focusedWin = BrowserWindow.getFocusedWindow();
            const validation = await MakeCadService.pickAndValidateFile('cad', focusedWin);
            if ('canceled' in validation) {
                return { canceled: true, error: validation.error };
            }

            const subfolder = itemId
                ? `make-order-files/${orderId}/items/${itemId}`
                : `make-order-files/${orderId}`;

            const meta = itemId
                ? { entityType: 'make_order_items', entityId: itemId, fieldName: 'technical_drawing_url' }
                : { entityType: 'make_orders', entityId: orderId, fieldName: 'pdf_urls' };

            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                subfolder,
                meta
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { success: false, error: uploadResult.error || 'Failed to upload to storage' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { success: false, error: 'Failed to establish persistent storage reference' };
            }

            // Update item or order records with durable reference
            if (itemId) {
                const { data: item } = await supabase.from('make_order_items').select('pdf_urls, technical_drawing_url').eq('id', itemId).maybeSingle();
                const existing: string[] = Array.isArray(item?.pdf_urls) ? item.pdf_urls : [];
                const combined = Array.from(new Set([...existing, persistentRef]));
                await supabase.from('make_order_items').update({
                    pdf_urls: combined,
                    technical_drawing_url: persistentRef
                }).eq('id', itemId);
            } else {
                const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
                const existing: string[] = Array.isArray(order?.pdf_urls) ? order.pdf_urls : [];
                const combined = Array.from(new Set([...existing, persistentRef]));
                await supabase.from('make_orders').update({ pdf_urls: combined }).eq('id', orderId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status,
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
                `make-order-files/${orderId}/stages`,
                { entityType: 'make_orders', entityId: orderId, fieldName: 'current_stage_photo' }
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { success: false, error: uploadResult.error || 'Failed to upload photo' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { success: false, error: 'Failed to obtain persistent photo reference' };
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-pick-and-upload-stage-photo error:', err);
            return { success: false, error: err.message };
        }
    });

    // ── 9. Hardened Legacy Upload Handlers (Backward Compatibility) ───────────
    ipcMain.handle('make-upload-item-pdf', async (_e, { orderId, itemId, filePath }: any) => {
        try {
            const session = requireSession();
            if (!canModifyMakeOrder(session)) {
                return { error: 'Forbidden: Session lacks MAKE order modification permissions' };
            }
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
                subfolder,
                { entityType: 'make_order_items', entityId: itemId, fieldName: 'technical_drawing_url' }
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { error: uploadResult.error || 'Failed to upload drawing' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { error: 'Failed to establish persistent drawing reference' };
            }

            const { data: item } = await supabase.from('make_order_items').select('pdf_urls').eq('id', itemId).maybeSingle();
            const existing: string[] = Array.isArray(item?.pdf_urls) ? item.pdf_urls : [];
            const combined = Array.from(new Set([...existing, persistentRef]));
            await supabase.from('make_order_items').update({
                pdf_urls: combined,
                technical_drawing_url: persistentRef
            }).eq('id', itemId);

            return {
                success: true,
                paths: [persistentRef],
                allPaths: combined,
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status
            };
        } catch (err: any) {
            return { error: err?.message || 'Upload failed' };
        }
    });

    ipcMain.handle('make-upload-pdf', async (_e, { orderId, filePath }: any) => {
        try {
            const session = requireSession();
            if (!canModifyMakeOrder(session)) {
                return { error: 'Forbidden: Session lacks MAKE order modification permissions' };
            }
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
                subfolder,
                { entityType: 'make_orders', entityId: orderId, fieldName: 'pdf_urls' }
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { error: uploadResult.error || 'Failed to upload drawing' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { error: 'Failed to obtain persistent reference for uploaded drawing' };
            }

            const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
            const existing: string[] = Array.isArray(order?.pdf_urls) ? order.pdf_urls : [];
            const combined = Array.from(new Set([...existing, persistentRef]));
            await supabase.from('make_orders').update({ pdf_urls: combined }).eq('id', orderId);

            return {
                success: true,
                paths: [persistentRef],
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status
            };
        } catch (err: any) {
            return { error: err?.message || 'Upload failed' };
        }
    });

    // ── 10. PDF Storage URLs and Deletion ─────────────────────────────────────
    ipcMain.handle('make-get-pdf-urls', async (_e, orderId: number) => {
        const session = requireSession();
        if (!canViewMakeOrders(session)) {
            throw new Error('Forbidden: Session lacks MAKE permissions');
        }
        if (!orderId || typeof orderId !== 'number' || orderId <= 0) {
            throw new Error('Invalid order ID');
        }
        const { data: order } = await supabase.from('make_orders').select('pdf_urls').eq('id', orderId).maybeSingle();
        const paths: string[] = Array.isArray(order?.pdf_urls) ? order.pdf_urls : [];

        const signedUrls = await Promise.all(paths.map(async (p) => {
            return await resolveAttachmentUrl(p);
        }));
        return signedUrls.filter(u => u.url || u.isPending);
    });

    // ── Delete Order PDF (Hardened Authorization & Ownership Gate) ───────────
    ipcMain.handle('make-delete-pdf', async (_e, rawPayload: any) => {
        // 1. Session verification
        const session = requireSession();

        // 2. Authorization verification: caller must possess MAKE order modification permission
        if (!canModifyMakeOrder(session)) {
            throw new Error('Forbidden: Session lacks MAKE order modification permissions');
        }

        // 3. Schema & payload validation
        const parsed = DeleteOrderPdfSchema.parse(rawPayload);

        // 4. Strict attachment reference validation (reject traversal, illegal schemes, untrusted hosts)
        if (!isAllowedAttachmentReference(parsed.storagePath)) {
            throw new Error('Invalid or unsupported attachment reference');
        }

        // 5. Authoritative database lookup
        const { data: order, error: orderErr } = await supabase
            .from('make_orders')
            .select('id, status, pdf_urls')
            .eq('id', parsed.orderId)
            .maybeSingle();

        if (orderErr) {
            throw new Error(`Database error looking up order: ${orderErr.message}`);
        }
        if (!order) {
            throw new Error(`Order with ID ${parsed.orderId} not found`);
        }

        // 6. Verify caller permission on this specific order (e.g. post-production requires Admin)
        if (!canModifyMakeOrder(session, order)) {
            throw new Error(`Order #${parsed.orderId} is in "${order.status}". Only Administrators can modify this order.`);
        }

        // 7. Verify attachment ownership: must actually belong to this order
        const currentPdfs: string[] = Array.isArray(order.pdf_urls) ? order.pdf_urls : [];
        const matchIndex = currentPdfs.findIndex(p => isMatchingAttachment(p, parsed.storagePath));
        if (matchIndex === -1) {
            throw new Error(`Attachment "${parsed.storagePath}" does not belong to order #${parsed.orderId}`);
        }

        // 8. Execute update and assert affected rows > 0 (fail closed)
        const remaining = currentPdfs.filter((_, idx) => idx !== matchIndex);
        const { data: updateRes, error: updateErr, count } = await supabase
            .from('make_orders')
            .update({ pdf_urls: remaining }, { count: 'exact' })
            .eq('id', parsed.orderId)
            .select('id');

        if (updateErr) {
            throw new Error(`Database error removing attachment: ${updateErr.message}`);
        }
        const affectedCount = Array.isArray(updateRes) ? updateRes.length : (updateRes ? 1 : (count ?? 0));
        if (affectedCount === 0) {
            throw new Error(`Order attachment deletion failed: 0 rows affected for order #${parsed.orderId}`);
        }

        // 9. Safe post-update cleanup of cloud copy if buffered in Supabase (preserving metadata on failure)
        try {
            const can = extractCanonicalSupabaseKey(parsed.storagePath);
            if (can) {
                const uploadService = DurableUploadService.getInstance();
                await uploadService.pruneCloudCopy('make-order-files', can.fullKey, 0);
            }
        } catch (cleanupErr) {
            console.warn('[make-delete-pdf] Background cloud cleanup deferred/failed:', cleanupErr);
        }

        return { success: true };
    });

    // ── Delete Item PDF / Technical Drawing (Hardened Authorization Gate) ────
    ipcMain.handle('make-delete-item-pdf', async (_e, rawPayload: any) => {
        // 1. Session verification
        const session = requireSession();

        // 2. Authorization verification
        if (!canModifyMakeOrder(session)) {
            throw new Error('Forbidden: Session lacks MAKE order modification permissions');
        }

        // 3. Schema & payload validation
        const parsed = DeleteItemPdfSchema.parse(rawPayload);

        // 4. Strict attachment reference validation
        if (!isAllowedAttachmentReference(parsed.storagePath)) {
            throw new Error('Invalid or unsupported attachment reference');
        }

        // 5. Authoritative item database lookup
        const { data: item, error: itemErr } = await supabase
            .from('make_order_items')
            .select('id, order_id, pdf_urls, technical_drawing_url')
            .eq('id', parsed.itemId)
            .maybeSingle();

        if (itemErr) {
            throw new Error(`Database error looking up item: ${itemErr.message}`);
        }
        if (!item) {
            throw new Error(`Item with ID ${parsed.itemId} not found`);
        }

        // 6. Verify item relationship to parent order
        if (!item.order_id) {
            throw new Error(`Item #${parsed.itemId} has no associated parent order`);
        }
        if (parsed.orderId !== undefined && Number(item.order_id) !== Number(parsed.orderId)) {
            throw new Error(`Item #${parsed.itemId} belongs to order #${item.order_id}, not order #${parsed.orderId}`);
        }

        // 7. Verify parent order exists and caller has permission to modify it
        const { data: parentOrder, error: parentErr } = await supabase
            .from('make_orders')
            .select('id, status')
            .eq('id', item.order_id)
            .maybeSingle();

        if (parentErr) {
            throw new Error(`Database error verifying parent order: ${parentErr.message}`);
        }
        if (!parentOrder) {
            throw new Error(`Parent order #${item.order_id} not found for item #${item.id}`);
        }
        if (!canModifyMakeOrder(session, parentOrder)) {
            throw new Error(`Parent order #${item.order_id} is in "${parentOrder.status}". Only Administrators can modify this order.`);
        }

        // 8. Verify attachment ownership: must belong to this item
        const currentPdfs: string[] = Array.isArray(item.pdf_urls) ? item.pdf_urls : [];
        const pdfMatchIndex = currentPdfs.findIndex(p => isMatchingAttachment(p, parsed.storagePath));
        const techMatch = item.technical_drawing_url && isMatchingAttachment(item.technical_drawing_url, parsed.storagePath);

        if (pdfMatchIndex === -1 && !techMatch) {
            throw new Error(`Attachment "${parsed.storagePath}" does not belong to item #${parsed.itemId}`);
        }

        // 9. Compute updated item values
        const remaining = pdfMatchIndex !== -1
            ? currentPdfs.filter((_, idx) => idx !== pdfMatchIndex)
            : currentPdfs;

        const newTechUrl = techMatch
            ? (remaining.length > 0 ? remaining[0] : null)
            : item.technical_drawing_url;

        // 10. Execute update and assert affected rows > 0 (fail closed)
        const { data: updateRes, error: updateErr, count } = await supabase
            .from('make_order_items')
            .update({
                pdf_urls: remaining,
                technical_drawing_url: newTechUrl
            }, { count: 'exact' })
            .eq('id', parsed.itemId)
            .select('id');

        if (updateErr) {
            throw new Error(`Database error removing item attachment: ${updateErr.message}`);
        }
        const affectedCount = Array.isArray(updateRes) ? updateRes.length : (updateRes ? 1 : (count ?? 0));
        if (affectedCount === 0) {
            throw new Error(`Item attachment deletion failed: 0 rows affected for item #${parsed.itemId}`);
        }

        // 11. Safe post-update cleanup of cloud copy if buffered in Supabase
        try {
            const can = extractCanonicalSupabaseKey(parsed.storagePath);
            if (can) {
                const uploadService = DurableUploadService.getInstance();
                await uploadService.pruneCloudCopy('make-order-files', can.fullKey, 0);
            }
        } catch (cleanupErr) {
            console.warn('[make-delete-item-pdf] Background cloud cleanup deferred/failed:', cleanupErr);
        }

        return { success: true };
    });

    ipcMain.handle('make-download-pdf', async (_e, { url, fileName }: { url: string; fileName: string }) => {
        try {
            const session = requireSession();
            if (!canViewMakeOrders(session)) {
                throw new Error('Forbidden: Session lacks MAKE permissions');
            }
            if (!url || typeof url !== 'string' || !url.trim()) {
                throw new Error('Invalid or malformed attachment reference');
            }
            const auth = await isAuthorizedAttachment(url, session);
            if (!auth.authorized || !auth.canonicalKey) {
                throw new Error('Forbidden: Attachment is unassociated or access is unauthorized.');
            }
            const { app, shell } = await import('electron');
            const tempDir = app.getPath('temp');
            const res = await downloadPdfFromNas(auth.canonicalKey, fileName, tempDir);
            if (res.success && res.path) {
                await shell.openPath(res.path);
            }
            return res;
        } catch (e: any) {
            console.error('[make-download-pdf] Download error:', e);
            return { success: false, error: e?.message || 'Download error' };
        }
    });

    ipcMain.handle('make-resolve-attachment-url', async (_e, rawUrl: string) => {
        const session = requireSession();
        if (!canViewMakeOrders(session)) {
            throw new Error('Forbidden: Session lacks MAKE permissions');
        }
        if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
            throw new Error('Invalid or malformed attachment reference');
        }
        const auth = await isAuthorizedAttachment(rawUrl, session);
        if (!auth.authorized || !auth.canonicalKey) {
            throw new Error('Forbidden: Attachment is unassociated or access is unauthorized.');
        }
        return await resolveAttachmentUrl(auth.canonicalKey);
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
                .select('*, specifications:make_product_specifications(*), sizes:make_product_sizes!make_product_sizes_product_id_fkey(*), colors:make_product_colors(*), images:make_product_images(*)')
                .order('created_at', { ascending: false });

            if (activeOnly) q = q.eq('is_active', true);
            if (search) q = q.or(`product_name.ilike.%${search}%,product_code.ilike.%${search}%`);

            const res = await q;

            // If the images join fails (PGRST200: missing relationship on Cloud), retry without images
            if (res.error?.code === 'PGRST200' && res.error?.message?.includes('make_product_images')) {
                console.warn('[make-get-catalog-products] make_product_images relationship missing (Cloud fallback), retrying without images join.');
                let q2 = client.from('make_products')
                    .select('*, specifications:make_product_specifications(*), sizes:make_product_sizes!make_product_sizes_product_id_fkey(*), colors:make_product_colors(*)')
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

        const products = decryptRows((data as any) || []);

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

        // Map single size and blueprint info
        for (const p of products) {
            if (p.size_id && p.sizes && Array.isArray(p.sizes)) {
                p.size = p.sizes.find((s: any) => s.id === p.size_id) || p.sizes[0] || null;
            } else if (p.sizes && Array.isArray(p.sizes) && p.sizes.length > 0) {
                p.size = p.sizes[0];
                p.size_id = p.size.id;
            }
            if (p.size) {
                p.size_label = p.size.size_label || p.size.label || (p.size.length && p.size.width ? `${p.size.length}x${p.size.width}${p.size.height ? `x${p.size.height}` : ''} ${p.size.unit || 'mm'}` : null);
            }
        }

        // Enforce permissions & redact fields
        const session = SessionManager.getSession();
        const canViewCost = session ? canViewCostPriceSession(session) : false;
        const canViewSale = session ? canViewSalePriceSession(session) : false;
        const canViewMaxDiscount = session ? canViewMaxDiscountSession(session) : false;
        const canViewBlueprint = session ? canViewBlueprintSession(session) : false;

        for (const p of products) {
            if (!canViewCost) {
                delete p.cost_price;
            }
            if (!canViewSale) {
                delete p.sale_price;
                delete p.base_price;
                delete p.price;
            }
            if (!canViewMaxDiscount) {
                delete p.max_discount_type;
                delete p.max_discount_value;
            }
            if (!canViewBlueprint) {
                delete p.blueprint_url;
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

        // Authoritatively validate catalog pricing and discount ranges
        const validPricing = MakePricingService.validateCatalogProductPricing(product);
        if (!validPricing.isValid) {
            throw new Error(validPricing.error);
        }

        const isUpdate = Boolean(product.id);
        const canEditCost = canEditCostPriceSession(session);
        // Cost price permissions enforcement: if unauthorized to edit cost, preserve or zero
        let costPriceToWrite: number | undefined = validPricing.costPrice;
        if (!canEditCost) {
            if (isUpdate) {
                costPriceToWrite = undefined;
            } else {
                costPriceToWrite = 0;
            }
        }

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
                resolvedCategoryId = (catRow as any).id;
                resolvedCategoryName = (catRow as any).name;
                categoryIds.push((catRow as any).id);
            } else {
                resolvedCategoryName = product.category.trim();
            }
        }

        const effectiveSizeId = (product as any).size_id !== undefined
            ? ((product as any).size_id ? Number((product as any).size_id) : null)
            : ((product as any).sizeId !== undefined ? ((product as any).sizeId ? Number((product as any).sizeId) : null) : undefined);
        const effectiveBlueprintUrl = (product as any).blueprint_url !== undefined
            ? (product as any).blueprint_url
            : (product as any).blueprintUrl;

        const writePayload: any = isUpdate ? {
            product_code: product.product_code,
            product_name: product.product_name,
            description: product.description || null,
            category_id: resolvedCategoryId,
            category: resolvedCategoryName,
            main_image: product.main_image || null,
            is_active: product.is_active !== undefined ? product.is_active : true,
            sale_price: validPricing.salePrice,
            max_discount_type: validPricing.maxDiscountType,
            max_discount_value: validPricing.maxDiscountValue,
            updated_at: new Date().toISOString()
        } : {
            product_code: product.product_code,
            product_name: product.product_name,
            description: product.description || null,
            category_id: resolvedCategoryId,
            category: resolvedCategoryName,
            main_image: product.main_image || null,
            is_active: product.is_active !== undefined ? product.is_active : true,
            sale_price: validPricing.salePrice,
            max_discount_type: validPricing.maxDiscountType,
            max_discount_value: validPricing.maxDiscountValue,
            created_by: session.fullName || session.username
        };
        if (costPriceToWrite !== undefined) {
            writePayload.cost_price = costPriceToWrite;
        }
        if (effectiveSizeId !== undefined) {
            writePayload.size_id = effectiveSizeId;
        }
        if (effectiveBlueprintUrl !== undefined) {
            writePayload.blueprint_url = effectiveBlueprintUrl ? MakeOrderService.normalizeAttachmentReference(effectiveBlueprintUrl) : null;
        }

        let writeResult = await failoverEngine.executeWrite(
            async (client) => {
                if (isUpdate) {
                    return await (client.from('make_products') as any).update(writePayload).eq('id', product.id).select().single();
                } else {
                    return await (client.from('make_products') as any).insert(writePayload).select().single();
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

        // Fallback: If DB schema does not yet have pricing columns, retry without them
        if (writeResult.error) {
            const msg = writeResult.error.message || '';
            if (/cost_price|sale_price|max_discount/i.test(msg)) {
                console.warn('[make-save-catalog-product] Fallback: DB schema missing pricing/discount columns, retrying without them.');
                const fallbackPayload = { ...writePayload };
                delete fallbackPayload.cost_price;
                delete fallbackPayload.sale_price;
                delete fallbackPayload.max_discount_type;
                delete fallbackPayload.max_discount_value;
                writeResult = await failoverEngine.executeWrite(
                    async (client) => {
                        if (isUpdate) {
                            return await (client.from('make_products') as any).update(fallbackPayload).eq('id', product.id).select().single();
                        } else {
                            return await (client.from('make_products') as any).insert(fallbackPayload).select().single();
                        }
                    },
                    {
                        table: 'make_products',
                        operation: isUpdate ? 'update' : 'insert',
                        primaryKey: isUpdate ? { name: 'id', value: product.id } : undefined,
                        data: fallbackPayload
                    },
                    isUpdate ? 'update-product-fallback' : 'insert-product-fallback'
                );
            }
        }

        if (writeResult.error) throw writeResult.error;
        const savedData = writeResult.data as any;

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

        const specImageUrl = spec.image_url || null;
        const payload: Record<string, any> = {
            spec_code: spec.spec_code || null,
            spec_name: spec.spec_name,
            spec_details: spec.spec_details || null,
            is_active: spec.is_active !== undefined ? spec.is_active : true
        };

        const isMissingImageColumn = (e: any) =>
            !!e && (e.code === 'PGRST204' || e.code === '42703') && /image_url/i.test(String(e.message || ''));

        const writeSpec = async (body: any) => {
            const q = supabase.from('make_product_specifications');
            return spec.id
                ? await q.update(body).eq('id', spec.id).select().single()
                : await q.insert({ ...body, product_id: spec.product_id }).select().single();
        };

        const result = await writeSpec(specImageUrl ? { ...payload, image_url: specImageUrl } : payload);
        if (result.error) {
            if (specImageUrl && isMissingImageColumn(result.error)) {
                throw new Error('Saving specification with an image requires database migration 066 (image_url column). Please contact your administrator.');
            }
            throw result.error;
        }

        const data = result.data;
        MakeSearchService.invalidateCache();
        if (supabaseAdmin && data) {
            (supabaseAdmin as any).from('make_product_specifications').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud spec sync:', e.message));
        }
        return data;
    });

    ipcMain.handle('make-delete-spec', async (_e, id: number) => {
        const session = requireSession();
        const { data: spec } = await failoverEngine.executeRead(
            async client => client.from('make_product_specifications').select('product_id').eq('id', id).maybeSingle(),
            'check-spec-global'
        );
        const isGlobal = !spec || (spec as any).product_id === null;
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
                (supabaseAdmin as any).from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
            }
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_sizes').insert(payload).select().single();
            if (error) throw error;
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                (supabaseAdmin as any).from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
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
        const isGlobal = !size || (size as any).product_id === null;
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
                (supabaseAdmin as any).from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
            }
            return data;
        } else {
            const { data, error } = await supabase.from('make_product_colors').insert(payload).select().single();
            if (error) throw error;
            MakeSearchService.invalidateCache();
            if (supabaseAdmin && data) {
                (supabaseAdmin as any).from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
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
        const isGlobal = !color || (color as any).product_id === null;
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
        const session = requireSession();
        if (!canViewMakeOrders(session)) {
            throw new Error('Forbidden: Session lacks MAKE permissions');
        }
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
                return await resolveAttachmentUrl(p);
            }));

            return {
                ...item,
                drawings: drawings.filter(d => d.url || d.isPending)
            };
        }));

        const canViewCost = canViewCostPriceSession(session);
        const canViewSale = canViewSalePriceSession(session);
        const canViewMaxDiscount = canViewMaxDiscountSession(session);

        return itemsWithDrawings.map((it: any) => {
            const itemCopy = { ...it };
            if (!canViewCost) {
                delete itemCopy.item_cost_price;
                delete itemCopy.cost_price;
                delete itemCopy.total_cost;
            }
            if (!canViewSale) {
                delete itemCopy.item_sale_price;
                delete itemCopy.unit_sale_price;
                delete itemCopy.total_sale_price;
                delete itemCopy.final_item_price;
                delete itemCopy.total_sale;
            }
            if (!canViewMaxDiscount) {
                delete itemCopy.max_discount_type;
                delete itemCopy.max_discount_value;
                delete itemCopy.discount_type;
                delete itemCopy.discount_value;
                delete itemCopy.discount_amount;
            }
            return itemCopy;
        });
    });

    ipcMain.handle('make-remove-order-item', async (_e, rawPayload: { orderId: number; itemId: number }) => {
        const session = requireSession();
        const result = await MakeOrderService.removeOrderItem({
            orderId: Number(rawPayload?.orderId),
            itemId: Number(rawPayload?.itemId),
            actorSession: session
        });
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    });

    ipcMain.handle('make-update-order-item-quantity', async (_e, rawPayload: { orderId: number; itemId: number; quantity: number }) => {
        const session = requireSession();
        const result = await MakeOrderService.updateDesignerOrderItemQuantity({
            orderId: Number(rawPayload?.orderId),
            itemId: Number(rawPayload?.itemId),
            quantity: Number(rawPayload?.quantity),
            actorSession: session
        });
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
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
                    const { sale_price, custom_price, final_price, total_sale_price, money_received, amount_due, payment_status, ...rest } = o;
                    if (rest.custom_details && typeof rest.custom_details === 'object') {
                        const { subtotal, final_price: cFinal, money_received: cRec, amount_due: cDue, payment_status: cStat, ...safeDetails } = rest.custom_details;
                        rest.custom_details = safeDetails;
                    }
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
                        (supabaseAdmin as any).from('make_product_categories').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud category sync:', e.message));
                    }
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_categories').insert(payload).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        (supabaseAdmin as any).from('make_product_categories').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud category sync:', e.message));
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
                    (supabaseAdmin as any).from('make_product_specifications').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud spec sync:', e.message));
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
                        (supabaseAdmin as any).from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
                    }
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_sizes').insert(payload).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        (supabaseAdmin as any).from('make_product_sizes').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud size sync:', e.message));
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
                        (supabaseAdmin as any).from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
                    }
                    return { success: true, attribute: data };
                } else {
                    const { data, error } = await db.from('make_product_colors').insert(payload).select().single();
                    if (error) throw error;
                    MakeSearchService.invalidateCache();
                    if (supabaseAdmin && data) {
                        (supabaseAdmin as any).from('make_product_colors').upsert(data).catch((e: any) => console.warn('[SYNC] Cloud color sync:', e.message));
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
                subfolder,
                orderId ? { entityType: 'make_orders', entityId: orderId, fieldName: 'invoice_attachment_urls' } : undefined
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { success: false, error: uploadResult.error || 'Failed to upload invoice image' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { success: false, error: 'Failed to establish persistent invoice reference' };
            }

            if (orderId) {
                const { data: order } = await supabase.from('make_orders').select('invoice_attachment_urls').eq('id', orderId).maybeSingle();
                const existing: string[] = Array.isArray(order?.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                const combined = Array.from(new Set([...existing, persistentRef]));
                await supabase.from('make_orders').update({ invoice_attachment_urls: combined }).eq('id', orderId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-pick-and-upload-invoice-attachment error:', err);
            return { success: false, error: err.message };
        }
    });

    // ── 18.5 Native Secure Picker & In-Memory Upload for Product Blueprint ─────
    ipcMain.handle('make-pick-and-upload-blueprint', async (_e, { productId }: { productId?: string | number } = {}) => {
        try {
            requireSession();
            const focusedWin = BrowserWindow.getFocusedWindow();
            const validation = await MakeCadService.pickAndValidateFile('cad', focusedWin);
            if ('canceled' in validation) {
                return { canceled: true, error: validation.error };
            }

            const subfolder = productId ? `make-catalog/blueprints/${productId}` : 'make-catalog/blueprints';
            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                subfolder,
                productId ? { entityType: 'make_products', entityId: productId, fieldName: 'blueprint_url' } : undefined
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { success: false, error: uploadResult.error || 'Failed to upload product blueprint' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { success: false, error: 'Failed to establish persistent blueprint reference' };
            }

            if (productId) {
                await supabase.from('make_products').update({ blueprint_url: persistentRef }).eq('id', productId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status,
                fileName: validation.sanitizedFileName
            };
        } catch (err: any) {
            console.error('[MAKE IPC] make-pick-and-upload-blueprint error:', err);
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
            const meta = itemId
                ? { entityType: 'make_order_items', entityId: itemId, fieldName: 'technical_drawing_url' }
                : (orderId ? { entityType: 'make_orders', entityId: orderId, fieldName: 'invoice_attachment_urls' } : undefined);

            const uploadResult = await MakeCadService.uploadValidatedBuffer(
                validation.fileBuffer,
                validation.sanitizedFileName,
                validation.mimeType,
                subfolder,
                meta
            );

            if (!uploadResult.success && !uploadResult.isPendingUpload) {
                return { success: false, error: uploadResult.error || 'Failed to upload attachment' };
            }

            const persistentRef = uploadResult.durableKey || uploadResult.publicUrl;
            if (!persistentRef) {
                return { success: false, error: 'Failed to establish persistent attachment reference' };
            }

            if (itemId) {
                const { data: item } = await supabase.from('make_order_items').select('pdf_urls, technical_drawing_url').eq('id', itemId).maybeSingle();
                const existing: string[] = Array.isArray(item?.pdf_urls) ? item.pdf_urls : [];
                const combined = Array.from(new Set([...existing, persistentRef]));
                await supabase.from('make_order_items').update({
                    pdf_urls: combined,
                    technical_drawing_url: persistentRef
                }).eq('id', itemId);
            } else if (orderId) {
                const { data: order } = await supabase.from('make_orders').select('invoice_attachment_urls').eq('id', orderId).maybeSingle();
                const existing: string[] = Array.isArray(order?.invoice_attachment_urls) ? order.invoice_attachment_urls : [];
                const combined = Array.from(new Set([...existing, persistentRef]));
                await supabase.from('make_orders').update({ invoice_attachment_urls: combined }).eq('id', orderId);
            }

            return {
                success: true,
                publicUrl: uploadResult.publicUrl || undefined,
                durableKey: persistentRef,
                isPendingUpload: uploadResult.isPendingUpload,
                status: uploadResult.status,
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

            const decrypted = decryptObject(customer);

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

    // ── 22. Production Hold Approval & Order Payment Handlers ─────────────────
    ipcMain.handle('make-request-production-approval', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            const payload = RequestProductionApprovalSchema.parse(rawPayload);
            return await MakeOrderService.requestProductionApproval(
                payload.order_id,
                payload.notes,
                session
            );
        } catch (err: any) {
            console.error('[MAKE IPC] make-request-production-approval error:', err);
            return { success: false, error: err.message || 'Failed to request production approval.' };
        }
    });

    ipcMain.handle('make-decide-production-approval', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            const payload = DecideProductionApprovalSchema.parse(rawPayload);
            return await MakeOrderService.decideProductionApproval(
                payload.order_id,
                payload.decision,
                payload.notes,
                session
            );
        } catch (err: any) {
            console.error('[MAKE IPC] make-decide-production-approval error:', err);
            return { success: false, error: err.message || 'Failed to record approval decision.' };
        }
    });

    ipcMain.handle('make-record-order-payment', async (_e, rawPayload: any) => {
        try {
            const session = requireSession();
            if (!canRecordMakePayment(session)) {
                return { success: false, error: 'Forbidden: You cannot record MAKE order payments.' };
            }
            const payload = RecordOrderPaymentSchema.parse(rawPayload);
            return await MakeOrderService.recordOrderPayment({
                orderId: payload.order_id,
                amount: payload.amount,
                paymentMethod: payload.payment_method,
                reference: payload.reference,
                notes: payload.notes,
                actorSession: session
            });
        } catch (err: any) {
            console.error('[MAKE IPC] make-record-order-payment error:', err);
            return { success: false, error: err.message || 'Failed to record order payment.' };
        }
    });

    ipcMain.handle('make-get-order-payments', async (_e, orderId: number | string) => {
        try {
            const session = requireSession();
            if (!canViewSalePriceSession(session)) {
                return { success: false, error: 'Forbidden: You cannot view order payment ledgers.' };
            }
            const numId = Number(orderId);
            if (!numId || isNaN(numId)) {
                return { success: false, error: 'Invalid order ID.' };
            }
            return await MakeOrderService.getOrderPayments(numId);
        } catch (err: any) {
            console.error('[MAKE IPC] make-get-order-payments error:', err);
            return { success: false, error: err.message || 'Failed to get order payments.' };
        }
    });
}
