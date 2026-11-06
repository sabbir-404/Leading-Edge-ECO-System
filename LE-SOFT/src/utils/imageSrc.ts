import { decodePathSegments, encodePathSegments } from './mediaPath';

/**
 * imageSrc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-platform image source normalizer and safe diagnostic handler for LE-SOFT.
 *
 * NAS and local file paths are encoded segment-by-segment. This prevents
 * filename characters such as #, ?, %, and spaces from being interpreted as
 * URL fragments, query strings, or malformed escape sequences.
 */

export function resolveImageSrc(imagePath?: string | null): string {
    if (!imagePath) return '';
    const trimmed = imagePath.trim();
    if (!trimmed) return '';

    // Data URLs & Blob URLs can be rendered directly by Chromium.
    if (/^(data:|blob:)/i.test(trimmed)) {
        return trimmed;
    }

    // Normalize existing app-media NAS URLs without double encoding.
    if (/^app-media:\/\//i.test(trimmed)) {
        if (/^app-media:\/\/nas(?:\/|$)/i.test(trimmed)) {
            const url = new URL(trimmed);
            const cleanSub = decodePathSegments(url.pathname).replace(/^\/+/, '');
            return `app-media://nas/${encodePathSegments(cleanSub)}`;
        }
        return trimmed;
    }

    // TrueNAS storage and legacy LAN storage URLs.
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const url = new URL(trimmed);
            const isStorageHost = url.hostname.toLowerCase() === 'storage.lenas.me';
            const isLegacyStoragePort = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) &&
                (url.port === '8080' || url.port === '8081');

            if (isStorageHost || isLegacyStoragePort) {
                const cleanSub = decodePathSegments(url.pathname).replace(/^\/+/, '');
                return `app-media://nas/${encodePathSegments(cleanSub)}`;
            }
        } catch {
            // Leave invalid/unsupported URLs to Chromium; do not crash rendering.
        }

        // Public Supabase and other external HTTP(S) URLs remain direct.
        return trimmed;
    }

    // Relative product-image paths are NAS storage objects.
    if (/^\/?files\/product-images\//i.test(trimmed)) {
        const cleanSub = decodePathSegments(trimmed).replace(/^\/+/, '');
        return `app-media://nas/${encodePathSegments(cleanSub)}`;
    }

    // Local filesystem path (Windows or POSIX).
    let clean = trimmed;
    if (/^file:\/\//i.test(clean)) {
        clean = clean.replace(/^file:\/\/\/?/i, '');
        clean = decodePathSegments(clean);
    }

    clean = clean.replace(/\\/g, '/');
    if (!clean.startsWith('/')) clean = `/${clean}`;

    // Preserve Windows drive designator (e.g. /C:) while encoding other segments.
    const encoded = clean.split('/').map((part, idx) => {
        if (idx === 1 && /^[a-zA-Z]:$/.test(part)) return part;
        return encodeURIComponent(part);
    }).join('/');

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
 * - Gracefully hides the broken image icon.
 * - Queries technical diagnosis and reports safe telemetry metadata.
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
