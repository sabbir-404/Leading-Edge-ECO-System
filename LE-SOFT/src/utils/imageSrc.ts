export function resolveImageSrc(imagePath?: string | null): string {
    if (!imagePath) return '';
    if (/^(data:|blob:|https?:|file:)/i.test(imagePath)) return imagePath;
    return `file://${encodeURI(imagePath)}`;
}