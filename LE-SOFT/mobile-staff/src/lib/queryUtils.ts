/**
 * queryUtils.ts
 * Sanitization and safety helpers for database queries.
 * Prevents injection attacks and malformed filter expressions.
 */

/**
 * Escapes single quotes for PostgREST ilike filters.
 * Also strips control characters that could break query parsing.
 */
export function sanitizePostgRESTQuery(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input
    .trim()
    .slice(0, 200) // Limit length to prevent abuse
    .replace(/'/g, "''") // Escape single quotes for SQL/PostgREST
    .replace(/[^\w\s\-.,&@#]/g, ''); // Allow only safe characters

  return sanitized;
}

/**
 * Safely constructs a PostgREST .or() filter for multiple fields.
 * Example: buildIlikeOr('search term', ['name', 'sku', 'description'])
 */
export function buildIlikeOr(query: string, fields: string[]): string {
  const safe = sanitizePostgRESTQuery(query);
  if (!safe) return '';

  const pattern = `%${safe}%`;
  const conditions = fields
    .filter((f) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f)) // Validate field names
    .map((f) => `${f}.ilike.${pattern}`)
    .join(',');

  return conditions;
}

/**
 * Validates and escapes comma-separated numeric IDs.
 * Prevents injection in ID lists used in .in(...) filters.
 */
export function sanitizeIdList(ids: unknown[]): number[] {
  return ids
    .map((id) => Number.parseInt(String(id), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/**
 * Safely constructs a numeric IN filter for PostgREST.
 * Example: buildInFilter([1, 2, 3]) → "id.in.(1,2,3)"
 */
export function buildInFilter(field: string, ids: unknown[]): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) return '';
  const safe = sanitizeIdList(ids);
  if (safe.length === 0) return '';
  return `${field}.in.(${safe.join(',')})`;
}
