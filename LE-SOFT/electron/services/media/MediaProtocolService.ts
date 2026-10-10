/**
 * MediaProtocolService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure Privileged Media Protocol & Image Resolution Service for LE-SOFT.
 *
 * Resolves production image loading failures across Windows & macOS:
 *  - Eliminates "Not allowed to load local resource" Chromium security errors.
 *  - Corrects Windows path encoding, backslashes, drive letters, and spaces.
 *  - Injects Cloudflare Access headers for TrueNAS storage (storage.lenas.me).
 *  - Caches remote and NAS images locally in userData/image-cache for instant
 *    offline availability.
 *  - Retains strict webSecurity and CSP (zero disabled security flags).
 *  - Captures sanitized technical diagnostics on image failure without logging PII.
 */

import { app, net, protocol } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { getCfAccessHeaders, getNasStorageCandidates, getNasStorageUrl } from '../../supabase';

export interface SafeImageDiagnostic {
    sourceType: 'local_file' | 'nas_storage' | 'supabase_storage' | 'remote_http' | 'data_url' | 'unknown';
    normalizedSource: string;
    exists: boolean;
    httpStatus?: number;
    fileSize?: number;
    loadDurationMs: number;
    failureReason?: string;
}

const MIME_MAP: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.dwg': 'application/octet-stream',
    '.dxf': 'application/octet-stream',
    '.step': 'application/octet-stream',
    '.stp': 'application/octet-stream'
};

export class MediaProtocolService {
    private static instance: MediaProtocolService | null = null;
    private cacheDir: string;
    private isInitialized = false;

    private constructor() {
        const userData = app?.getPath ? app.getPath('userData') : path.join(process.env.APPDATA || process.cwd(), 'le-soft');
        this.cacheDir = path.join(userData, 'image-cache');
        try {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        } catch {}
    }

    public static getInstance(): MediaProtocolService {
        if (!MediaProtocolService.instance) {
            MediaProtocolService.instance = new MediaProtocolService();
        }
        return MediaProtocolService.instance;
    }

    /**
     * MUST be called before app.whenReady() to register the scheme with standard privileges.
     */
    public static registerSchemeAsPrivileged(): void {
        try {
            protocol.registerSchemesAsPrivileged([
                {
                    scheme: 'app-media',
                    privileges: {
                        standard: true,
                        secure: true,
                        supportFetchAPI: true,
                        corsEnabled: true,
                        stream: true,
                        bypassCSP: false
                    }
                }
            ]);
        } catch (e: any) {
            console.warn('[MediaProtocol] Failed to register privileged scheme (may already be registered):', e.message);
        }
    }

    /**
     * Initializes the protocol handler once Electron app is ready.
     */
    public initialize(): void {
        if (this.isInitialized) return;
        this.isInitialized = true;

        protocol.handle('app-media', async (request: Request) => {
            const urlStr = request.url;
            try {
                // Parse app-media://local/<path> or app-media://nas/<path> or app-media://remote?url=<encoded>
                const urlObj = new URL(urlStr);
                const host = urlObj.hostname.toLowerCase();

                if (host === 'local') {
                    return await this.handleLocalFile(urlObj.pathname);
                } else if (host === 'nas' || host === 'remote') {
                    return await this.handleRemoteMedia(urlObj);
                }

                return new Response('Invalid media host', { status: 400 });
            } catch (err: any) {
                console.error('[MediaProtocol] Error serving media request:', err.message);
                return new Response(`Media load error: ${err.message}`, { status: 500 });
            }
        });

        console.log('[MediaProtocol] app-media protocol handler successfully registered.');
    }

    /**
     * Serves local filesystem files safely with accurate MIME headers.
     */
    private async handleLocalFile(pathname: string): Promise<Response> {
        let cleanPath = decodeURIComponent(pathname);

        // Windows path normalization: e.g. /C:/path/file.png -> C:\path\file.png
        if (process.platform === 'win32') {
            if (/^\/[a-zA-Z]:/.test(cleanPath)) {
                cleanPath = cleanPath.slice(1);
            }
            cleanPath = path.normalize(cleanPath);
        }

        // Verify file existence
        if (!fs.existsSync(cleanPath)) {
            return new Response('File Not Found', { status: 404 });
        }

        const stat = fs.statSync(cleanPath);
        if (stat.isDirectory()) {
            return new Response('Cannot serve directory', { status: 403 });
        }

        const ext = path.extname(cleanPath).toLowerCase();
        const mimeType = MIME_MAP[ext] || 'application/octet-stream';

        // Use Electron net.fetch on file:/// URL to stream binary data efficiently
        const fileUrl = pathToFileURL(cleanPath).toString();
        const response = await net.fetch(fileUrl);

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Content-Type', mimeType);
        newHeaders.set('Cache-Control', 'max-age=86400');
        newHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    }

    /**
     * Serves remote/NAS files with multi-endpoint fallback, Cloudflare Access headers, and disk caching.
     */
    private async handleRemoteMedia(urlObj: URL): Promise<Response> {
        let isNas = urlObj.hostname === 'nas';
        let rawPath = '';
        let targetUrl = '';

        if (isNas) {
            rawPath = urlObj.pathname.replace(/^\//, '');
        } else {
            targetUrl = decodeURIComponent(urlObj.searchParams.get('url') || '');
            if (targetUrl.includes('storage.lenas.me') || /:[0-9]+\/files\//i.test(targetUrl)) {
                isNas = true;
                try {
                    const parsed = new URL(targetUrl);
                    rawPath = parsed.pathname.replace(/^\//, '');
                } catch {
                    rawPath = targetUrl.replace(/^https?:\/\/[^\/]+\/?/, '');
                }
            }
        }

        if (!isNas && (!targetUrl || !/^https?:\/\//i.test(targetUrl))) {
            return new Response('Invalid remote URL', { status: 400 });
        }

        // Clean and normalize the subpath (decoding spaces / percent-encoded characters)
        const cleanSubPath = isNas ? decodeURIComponent(rawPath).replace(/^\//, '') : '';
        const ext = path.extname(isNas ? cleanSubPath : new URL(targetUrl).pathname).toLowerCase() || '.webp';

        // 1. Check local disk cache (keyed by clean subpath for NAS, or targetUrl for other remote URLs)
        const cacheKey = isNas ? `nas:${cleanSubPath}` : targetUrl;
        const cacheHash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32);
        const cacheFile = path.join(this.cacheDir, `${cacheHash}${ext}`);

        if (fs.existsSync(cacheFile)) {
            try {
                const stat = fs.statSync(cacheFile);
                if (stat.size > 0) {
                    const mimeType = MIME_MAP[ext] || 'image/webp';
                    const fileUrl = pathToFileURL(cacheFile).toString();
                    const cachedResponse = await net.fetch(fileUrl);
                    const headers = new Headers(cachedResponse.headers);
                    headers.set('Content-Type', mimeType);
                    headers.set('X-Cache-Status', 'HIT');
                    headers.set('Access-Control-Allow-Origin', '*');
                    console.log(`[MediaProtocol] ${urlObj.href} → resolved: ${isNas ? 'nas_storage' : 'remote_http'} (cache) → response: 200 → MIME: ${mimeType} → cache: HIT`);
                    return new Response(cachedResponse.body, { headers });
                }
            } catch {}
        }

        // 2. Fetch from network
        if (isNas) {
            const candidates = typeof getNasStorageCandidates === 'function' ? getNasStorageCandidates() : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];
            const encodedSubPath = encodeURI(cleanSubPath);
            const cfHeaders = typeof getCfAccessHeaders === 'function' ? getCfAccessHeaders() : {};

            let lastStatus = 502;
            let lastErrorMsg = 'NAS storage unreachable';

            for (const base of candidates) {
                const candidateUrl = `${base.replace(/\/$/, '')}/${encodedSubPath}`;
                const isTunnel = candidateUrl.includes('storage.lenas.me');
                const fetchHeaders: Record<string, string> = isTunnel ? { ...cfHeaders } : {};

                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2500);

                    let res: any;
                    try {
                        res = await net.fetch(candidateUrl, {
                            headers: fetchHeaders,
                            signal: controller.signal
                        });
                    } catch (netErr: any) {
                        if (typeof fetch === 'function') {
                            res = await fetch(candidateUrl, {
                                headers: fetchHeaders,
                                signal: controller.signal
                            });
                        } else {
                            throw netErr;
                        }
                    }
                    clearTimeout(timeoutId);

                    if (res.ok && res.status === 200) {
                        const buffer = Buffer.from(await res.arrayBuffer());

                        // Write to cache asynchronously
                        fs.promises.writeFile(cacheFile, buffer).catch(err => {
                            console.warn('[MediaProtocol] Failed to cache image:', err.message);
                        });

                        const mimeType = res.headers.get('content-type') || MIME_MAP[ext] || 'image/webp';
                        const headers = new Headers();
                        headers.set('Content-Type', mimeType);
                        headers.set('Content-Length', String(buffer.length));
                        headers.set('X-Cache-Status', 'MISS');
                        headers.set('Access-Control-Allow-Origin', '*');

                        console.log(`[MediaProtocol] ${urlObj.href} → resolved: nas_storage (${base}) → response: 200 → MIME: ${mimeType} → cache: MISS (${buffer.length} bytes)`);
                        return new Response(buffer, { headers });
                    }

                    lastStatus = res.status;
                    lastErrorMsg = `HTTP ${res.status}`;
                } catch (err: any) {
                    lastErrorMsg = err.message || 'fetch_failed';
                }
            }

            console.warn(`[MediaProtocol] ${urlObj.href} → resolved: nas_storage → response: ${lastStatus} (${lastErrorMsg}) → cache: MISS`);
            return new Response(`NAS storage error: ${lastErrorMsg}`, { status: lastStatus });
        } else {
            // General remote HTTP/HTTPS image
            try {
                const res = await net.fetch(targetUrl);
                if (!res.ok) {
                    console.warn(`[MediaProtocol] ${urlObj.href} → resolved: remote_http → response: ${res.status} → cache: MISS`);
                    return new Response(`Remote error: HTTP ${res.status}`, { status: res.status });
                }
                const buffer = Buffer.from(await res.arrayBuffer());
                fs.promises.writeFile(cacheFile, buffer).catch(() => {});
                const mimeType = res.headers.get('content-type') || MIME_MAP[ext] || 'image/webp';
                const headers = new Headers();
                headers.set('Content-Type', mimeType);
                headers.set('Content-Length', String(buffer.length));
                headers.set('X-Cache-Status', 'MISS');
                console.log(`[MediaProtocol] ${urlObj.href} → resolved: remote_http → response: 200 → MIME: ${mimeType} → cache: MISS (${buffer.length} bytes)`);
                return new Response(buffer, { headers });
            } catch (fetchErr: any) {
                console.warn(`[MediaProtocol] ${urlObj.href} → resolved: remote_http → error: ${fetchErr.message} → cache: MISS`);
                return new Response(`Network fetch failed: ${fetchErr.message}`, { status: 502 });
            }
        }
    }

    /**
     * Diagnoses an image source and produces safe technical metrics.
     */
    public async diagnoseImage(rawSrc?: string | null): Promise<SafeImageDiagnostic> {
        const t0 = Date.now();
        if (!rawSrc || !rawSrc.trim()) {
            return {
                sourceType: 'unknown',
                normalizedSource: '',
                exists: false,
                loadDurationMs: 0,
                failureReason: 'empty_source'
            };
        }

        const trimmed = rawSrc.trim();

        // 1. Data URL
        if (/^data:image\//i.test(trimmed)) {
            return {
                sourceType: 'data_url',
                normalizedSource: trimmed.slice(0, 30) + '...',
                exists: true,
                fileSize: trimmed.length,
                loadDurationMs: Date.now() - t0
            };
        }

        // 2. app-media:// protocol URL
        if (/^app-media:\/\//i.test(trimmed)) {
            try {
                const u = new URL(trimmed);
                if (u.hostname === 'local') {
                    return this.diagnoseImage(u.pathname);
                } else if (u.hostname === 'nas') {
                    const cleanSub = decodeURIComponent(u.pathname).replace(/^\//, '');
                    const cacheKey = `nas:${cleanSub}`;
                    const ext = path.extname(cleanSub).toLowerCase() || '.webp';
                    const cacheHash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32);
                    const cacheFile = path.join(this.cacheDir, `${cacheHash}${ext}`);

                    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) {
                        return {
                            sourceType: 'nas_storage',
                            normalizedSource: `https://storage.lenas.me/${cleanSub}`,
                            exists: true,
                            httpStatus: 200,
                            fileSize: fs.statSync(cacheFile).size,
                            loadDurationMs: Date.now() - t0
                        };
                    }

                    // Test network candidates
                    const candidates = typeof getNasStorageCandidates === 'function' ? getNasStorageCandidates() : ['http://100.88.85.6:8081', 'https://storage.lenas.me'];
                    const encodedSub = encodeURI(cleanSub);
                    const cfHeaders = typeof getCfAccessHeaders === 'function' ? getCfAccessHeaders() : {};

                    for (const base of candidates) {
                        const candidateUrl = `${base.replace(/\/$/, '')}/${encodedSub}`;
                        try {
                            const isTunnel = candidateUrl.includes('storage.lenas.me');
                            const res = await net.fetch(candidateUrl, {
                                method: 'HEAD',
                                headers: isTunnel ? { ...cfHeaders } : {}
                            });
                            if (res.ok && res.status === 200) {
                                return {
                                    sourceType: 'nas_storage',
                                    normalizedSource: `https://storage.lenas.me/${cleanSub}`,
                                    exists: true,
                                    httpStatus: 200,
                                    loadDurationMs: Date.now() - t0
                                };
                            }
                        } catch {}
                    }

                    return {
                        sourceType: 'nas_storage',
                        normalizedSource: `https://storage.lenas.me/${cleanSub}`,
                        exists: false,
                        loadDurationMs: Date.now() - t0,
                        failureReason: 'nas_storage_unreachable'
                    };
                }
            } catch {}
        }

        // 3. Remote URL (http / https)
        if (/^https?:\/\//i.test(trimmed)) {
            if (trimmed.includes(':8080')) {
                const subPath = trimmed.replace(/^https?:\/\/[^\/]+:(?:8080|8081)\/?/i, '');
                const cleanSub = decodeURIComponent(subPath).replace(/^\//, '');
                return this.diagnoseImage(`app-media://nas/${encodeURI(cleanSub)}`);
            }
            const isNas = trimmed.includes('storage.lenas.me') || trimmed.includes(':8081');
            const isSupabase = trimmed.includes('.supabase.co/storage');
            const sourceType = isNas ? 'nas_storage' : (isSupabase ? 'supabase_storage' : 'remote_http');

            // Sanitize URL for safe logging (removes tokens/queries)
            let safeUrl = trimmed;
            try {
                const u = new URL(trimmed);
                safeUrl = `${u.origin}${u.pathname}`;
            } catch {}

            try {
                const cfHeaders = isNas && typeof getCfAccessHeaders === 'function' ? getCfAccessHeaders() : {};
                const res = await net.fetch(trimmed, { method: 'HEAD', headers: cfHeaders });
                const duration = Date.now() - t0;
                return {
                    sourceType,
                    normalizedSource: safeUrl,
                    exists: res.ok,
                    httpStatus: res.status,
                    loadDurationMs: duration,
                    failureReason: res.ok ? undefined : `HTTP_${res.status}`
                };
            } catch (err: any) {
                return {
                    sourceType,
                    normalizedSource: safeUrl,
                    exists: false,
                    loadDurationMs: Date.now() - t0,
                    failureReason: err.message || 'fetch_failed'
                };
            }
        }

        // 4. Local File Path
        let localPath = trimmed;
        if (localPath.startsWith('file://')) {
            localPath = decodeURIComponent(localPath.replace(/^file:\/\/\/?/i, ''));
        }
        if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(localPath)) {
            localPath = localPath.slice(1);
        }
        localPath = path.normalize(localPath);

        // Sanitize path for safe diagnostic (replace username with [USER])
        const sanitizedPath = localPath.replace(/Users\\[^\\]+/i, 'Users\\[USER]');

        const exists = fs.existsSync(localPath);
        let fileSize: number | undefined;
        let failureReason: string | undefined;

        if (exists) {
            try {
                fileSize = fs.statSync(localPath).size;
            } catch (e: any) {
                failureReason = 'stat_failed: ' + e.message;
            }
        } else {
            failureReason = 'file_not_found';
        }

        return {
            sourceType: 'local_file',
            normalizedSource: sanitizedPath,
            exists,
            fileSize,
            loadDurationMs: Date.now() - t0,
            failureReason
        };
    }
}

