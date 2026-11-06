/**
 * URL path helpers shared by the renderer and Electron main process.
 *
 * Encode each path segment independently so reserved characters in file names
 * (for example #, ?, %, and spaces) cannot become URL fragments or queries.
 */

export function decodePathSegments(value: string): string {
    return value.split('/').map((segment) => {
        // Escape only stray '%' characters first. Valid %HH sequences can then
        // be decoded without letting one malformed escape poison the whole segment.
        const sanitized = segment.replace(/%(?![0-9a-fA-F]{2})/g, '%25');
        try {
            return decodeURIComponent(sanitized);
        } catch {
            // Invalid UTF-8 or other malformed escapes remain literal.
            return segment;
        }
    }).join('/');
}

export function encodePathSegments(value: string): string {
    return value.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
