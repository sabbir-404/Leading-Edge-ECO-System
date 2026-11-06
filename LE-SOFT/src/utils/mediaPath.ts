/**
 * URL path helpers shared by the renderer and Electron main process.
 *
 * Encode each path segment independently so reserved characters in file names
 * (for example #, ?, %, and spaces) cannot become URL fragments or queries.
 */

export function decodePathSegments(value: string): string {
    return value.split('/').map((segment) => {
        try {
            return decodeURIComponent(segment);
        } catch {
            // Treat malformed percent sequences as literal filename characters.
            return segment;
        }
    }).join('/');
}

export function encodePathSegments(value: string): string {
    return value.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
