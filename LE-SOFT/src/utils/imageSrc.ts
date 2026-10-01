/**
 * imageSrc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-platform image source normalizer and safe diagnostic handler for LE-SOFT.
 *
 * Ensures all image paths (local files, URLs, data URLs, TrueNAS paths):
 *  - Route safely through the privileged app-media:// protocol in Electron,
 *    eliminating Chromium "Not allowed to load local resource" security blocks.
 *  - Route TrueNAS storage through app-media://nas/... for automatic Cloudflare
 *    Access authentication and persistent disk caching (userData/image-cache).
 *  - Normalize Windows backslashes, drive letters, and spaces properly.
 *  - Retain full compatibility with standard web & test environments.
 *  - Produce safe technical diagnostics on load failures without logging PII.
 */

export function resolveImageSrc(imagePath?: string | null): string {
    if (!imagePath) return '';
    const trimmed = imagePath.trim();
    if (!trimmed) return '';

    // 1. Data URLs & Blob URLs can be rendered directly by Chromium
    if (/^(data:|blob:)/i.test(trimmed)) {
        return trimmed;
    }

    // 2. Already using app-media protocol
    if (/^app-media:\/\//i.test(trimmed)) {
        if (/^app-media:\/\/nas\//i.test(trimmed)) {
            const sub = trimmed.replace(/^app-media:\/\/nas\/?/i, '');
            const cleanSub = decodeURIComponent(sub).replace(/^\//, '');
            return `app-media://nas/${encodeURI(cleanSub)}`;
        }
        return trimmed;
    }

    // 3. TrueNAS Cloudflare Tunnel Storage URL or Port 8081 Storage URL -> route through app-media://nas/
    if (/^https?:\/\/(storage\.lenas\.me|[0-9\.]+:8081)\//i.test(trimmed)) {
        const subPath = trimmed.replace(/^https?:\/\/(storage\.lenas\.me|[0-9\.]+:8081)\/?/i, '');
        const cleanSub = decodeURIComponent(subPath).replace(/^\//, '');
        return `app-media://nas/${encodeURI(cleanSub)}`;
    }

    // 4. Relative or absolute /files/product-images/ path
    if (/^\/?files\/product-images\//i.test(trimmed)) {
        const cleanSub = decodeURIComponent(trimmed).replace(/^\//, '');
        return `app-media://nas/${encodeURI(cleanSub)}`;
    }

    // 5. Remote HTTP / HTTPS URLs (e.g. Supabase storage or web links)
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    // 5. Local Filesystem Path (Windows or POSIX)
    let clean = trimmed;
    if (/^file:\/\//i.test(clean)) {
        // Strip file:/// or file://
        clean = decodeURIComponent(clean.replace(/^file:\/\/\/?/i, ''));
    }

    // Normalize Windows backslashes to forward slashes for URL pathing
    clean = clean.replace(/\\/g, '/');

    // Ensure leading slash
    if (!clean.startsWith('/')) {
        clean = '/' + clean;
    }

    // Encode path segments safely for standard URL representation while preserving Windows drive letter (e.g. /C:)
    const encoded = clean.split('/').map((part, idx) => {
        if (idx === 1 && /^[a-zA-Z]:$/.test(part)) return part;
        return encodeURIComponent(part);
    }).join('/');

    // In Electron, route local filesystem access through the secure privileged protocol
    return `app-media://local${encoded}`;
}

/**
 * Diagnostic helper to safely query the backend for why an image failed to load.
 */
export async function diagnoseImageSrc(src: string): Promise<any> {
    try {
        if (typeof window !== 'undefined' && (window as any).electron?.diagnoseImage) {
            return await (window as any).electron.diagnoseImage(src);
        }
    } catch (e) {
        console.warn('[imageSrc] Diagnostic query failed:', e);
    }
    return null;
}

/**
 * Standardized error handler for <img> elements:
 *  - Gracefully hides the broken image icon.
 *  - Queries technical diagnosis and reports safely to telemetry (no PII).
 */
export function handleImageLoadError(e: React.SyntheticEvent<HTMLImageElement, Event>, originalSrc?: string | null): void {
    const target = e.currentTarget;
    target.style.display = 'none';

    if (originalSrc) {
        diagnoseImageSrc(originalSrc).then(diag => {
            if (diag && !diag.exists) {
                if (typeof window !== 'undefined' && (window as any).electron?.reportClientError) {
                    (window as any).electron.reportClientError({
                        source: 'renderer',
                        severity: 'warning',
                        operation: 'IMAGE_LOAD_FAILURE',
                        error: `Image load failed: ${diag.failureReason || 'resource_unreachable'}`,
                        metadata: {
                            sourceType: diag.sourceType,
                            normalizedSource: diag.normalizedSource,
                            loadDurationMs: diag.loadDurationMs,
                            httpStatus: diag.httpStatus,
                            fileSize: diag.fileSize
                        }
                    });
                }
            }
        }).catch(() => {});
    }
}