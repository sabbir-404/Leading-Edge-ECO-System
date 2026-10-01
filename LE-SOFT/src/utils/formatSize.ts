/**
 * formatSize.ts — Shared size label & dimensions formatter
 * 
 * Standard format: "Size Name — Dimension"
 * Examples:
 *   "Small — 1200 × 600 × 750 mm"
 *   "Medium — 1500 × 750 × 750 mm"
 *   "Round Table — Ø900 mm"
 */

export interface SizeDimensionsInput {
  size_label?: string | null;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  diameter?: number | string | null;
  unit?: string | null;
}

export function formatSizeDimensions(sz?: SizeDimensionsInput | null): string {
  if (!sz) return '';
  const parts: string[] = [];
  if (sz.length !== undefined && sz.length !== null && sz.length !== '') parts.push(String(sz.length));
  if (sz.width !== undefined && sz.width !== null && sz.width !== '') parts.push(String(sz.width));
  if (sz.height !== undefined && sz.height !== null && sz.height !== '') parts.push(String(sz.height));
  if (sz.diameter !== undefined && sz.diameter !== null && sz.diameter !== '') parts.push(`Ø${sz.diameter}`);
  
  const unit = (sz.unit || 'mm').trim();
  if (parts.length === 0) return '';
  return `${parts.join(' × ')} ${unit}`;
}

export function formatSizeDisplay(sz?: SizeDimensionsInput | null): string {
  if (!sz) return '';
  const dims = formatSizeDimensions(sz);
  const label = (sz.size_label || '').trim();

  if (label && dims) {
    return `${label} — ${dims}`;
  }
  return label || dims || 'Standard Size';
}
