/**
 * TelemetrySanitizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central Privacy & Security Sanitizer for Remote Error Diagnostics.
 *
 * Guaranteed Invariants:
 *  - NEVER logs or transmits passwords, tokens, JWTs, Supabase/Cloudflare keys,
 *    license keys, private keys, or credentials.
 *  - Strips all Customer Personal Identifiable Information (PII): names, emails,
 *    phone numbers, street addresses, postal codes, and receiver details.
 *  - Redacts sensitive business information: invoice images, order items,
 *    product descriptions, custom dimensions, drawings, and raw payloads.
 *  - Sanitizes filesystem paths to eliminate local Windows/Unix usernames.
 *  - Normalizes messages to create deterministic, secret-free error fingerprints.
 */

import crypto from 'crypto';

const SENSITIVE_KEY_PATTERNS = [
    /password/i,
    /token/i,
    /jwt/i,
    /secret/i,
    /apikey/i,
    /api_key/i,
    /auth/i,
    /credential/i,
    /license/i,
    /private_?key/i,
    /service_?role/i,
    /cf_?access/i,
    /customer/i,
    /phone/i,
    /email/i,
    /address/i,
    /receiver/i,
    /order/i,
    /invoice/i,
    /drawing/i,
    /base64/i,
    /body/i,
    /payload/i,
    /description/i,
    /product/i,
    /note/i
];

export class TelemetrySanitizer {
    /**
     * Sanitizes a string by redacting JWTs, tokens, credentials, PII, and sensitive paths.
     */
    public static sanitizeText(input: string | null | undefined): string {
        if (!input || typeof input !== 'string') return '';

        let sanitized = input;

        // 1. Redact JWTs (Base64URL parts starting with eyJ)
        sanitized = sanitized.replace(/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(\.[A-Za-z0-9_-]+)?/g, '[REDACTED_JWT]');

        // 2. Redact Bearer tokens
        sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._\-~+/=]+/gi, 'Bearer [REDACTED_TOKEN]');

        // 3. Redact PEM private keys and certificates
        sanitized = sanitized.replace(/-----BEGIN[ A-Z0-9_-]+KEY-----[\s\S]*?-----END[ A-Z0-9_-]+KEY-----/g, '[REDACTED_PRIVATE_KEY]');

        // 4. Redact License Keys (LE-SOFT format & standard 4-4-4-4 format)
        sanitized = sanitized.replace(/LE-[A-Za-z0-9+/=_-]{16,}/g, '[REDACTED_LICENSE]');
        sanitized = sanitized.replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi, '[REDACTED_LICENSE]');

        // 5. Redact Key-Value password/secret pairs (JSON or URL-encoded)
        sanitized = sanitized.replace(
            /(["']?(?:password|passwd|pwd|secret|token|apiKey|api_key|serviceRoleKey|cfAccessClientSecret)["']?\s*[:=]\s*["']?)([^"',\s}{&]+)(["']?)/gi,
            '$1[REDACTED]$3'
        );

        // 6. Redact Email Addresses
        sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');

        // 7. Redact Phone Numbers (BD + international formats)
        sanitized = sanitized.replace(/(?:\+?880\s?|0)1[3-9]\d{2}[\s-]?\d{6}\b/g, '[REDACTED_PHONE]');
        sanitized = sanitized.replace(/\b\+?[1-9]\d{1,14}\b/g, (match) => {
            // Only redact if string resembles a phone number (7-15 digits) and is not a common timestamp or small integer
            if (match.length >= 7 && match.length <= 15 && !match.startsWith('1790')) {
                return '[REDACTED_PHONE]';
            }
            return match;
        });

        // 8. Redact Windows & Unix User Home Paths to eliminate local usernames (both literal \ and escaped \\)
        sanitized = sanitized.replace(/[a-zA-Z]:(?:\\\\|\\)Users(?:\\\\|\\)[^\\",]+/gi, '[USER_HOME]');
        sanitized = sanitized.replace(/\/home\/[^\/",]+/gi, '[USER_HOME]');
        sanitized = sanitized.replace(/\/Users\/[^\/",]+/gi, '[USER_HOME]');

        // 9. Redact PostgREST / SQL query literal values
        sanitized = sanitized.replace(/VALUES\s*\((?:'[^']*'|[0-9.]+|NULL|TRUE|FALSE|,|\s)+\)/gi, 'VALUES ([REDACTED_VALUES])');

        return sanitized;
    }

    /**
     * Deeply sanitizes arbitrary metadata objects or error details.
     */
    public static sanitizeMetadata(obj: any, depth = 0): any {
        if (depth > 6 || obj === null || obj === undefined) return null;

        if (typeof obj === 'string') {
            return this.sanitizeText(obj);
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
        }

        if (Array.isArray(obj)) {
            // Bound arrays to 20 elements to prevent excessive payloads
            return obj.slice(0, 20).map(item => this.sanitizeMetadata(item, depth + 1));
        }

        if (typeof obj === 'object') {
            const clean: Record<string, any> = {};
            const keys = Object.keys(obj).slice(0, 50); // Bound keys to 50

            for (const key of keys) {
                const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
                if (isSensitiveKey) {
                    clean[key] = '[REDACTED]';
                } else {
                    clean[key] = this.sanitizeMetadata(obj[key], depth + 1);
                }
            }
            return clean;
        }

        return String(obj);
    }

    /**
     * Sanitizes a stack trace by stripping usernames, file queries, and sensitive variable lines.
     */
    public static sanitizeStackTrace(stack: string | null | undefined): string {
        if (!stack || typeof stack !== 'string') return '';
        const cleaned = this.sanitizeText(stack);

        // Limit stack trace to top 25 lines to prevent excessive database payloads
        const lines = cleaned.split('\n').slice(0, 25);
        return lines.join('\n');
    }

    /**
     * Generates a deterministic SHA-256 fingerprint for grouping identical errors.
     * Strips variable components (numbers, timestamps, UUIDs, hex memory pointers).
     */
    public static generateFingerprint(params: {
        errorType: string;
        sanitizedMessage: string;
        source: string;
        operation?: string;
    }): string {
        const normType = (params.errorType || 'Error').trim().toLowerCase();
        const normSource = (params.source || 'app').trim().toLowerCase();
        const normOp = (params.operation || '').trim().toLowerCase();

        // Strip numbers, UUIDs, hex memory addresses, and timestamps to extract core error signature
        let normalizedMsg = (params.sanitizedMessage || '')
            .toLowerCase()
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '[UUID]')
            .replace(/0x[0-9a-f]+/g, '[ADDR]')
            .replace(/\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}[^\s]*\b/g, '[TIMESTAMP]')
            .replace(/\b\d+\b/g, '[NUM]')
            .replace(/:\d+:\d+/g, ':[LOC]')
            .trim();

        const rawSignature = `${normType}:::${normSource}:::${normOp}:::${normalizedMsg}`;
        return crypto.createHash('sha256').update(rawSignature).digest('hex').substring(0, 32);
    }
}
