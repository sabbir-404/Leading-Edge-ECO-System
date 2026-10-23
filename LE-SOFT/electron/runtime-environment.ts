export const RUNTIME_ENVIRONMENTS = ['development', 'testing', 'staging', 'production'] as const;
export type RuntimeEnvironment = typeof RUNTIME_ENVIRONMENTS[number];

const PRODUCTION_HOSTS = new Set([
    'ildkkgjrolcjijwfokek.supabase.co',
    '100.88.85.6',
    '192.168.1.14',
    'db.lenas.me',
    'storage.lenas.me',
]);

/** Resolve an explicit app environment, defaulting test runners to an isolated mode. */
export function getRuntimeEnvironment(): RuntimeEnvironment {
    const configured = process.env.LE_SOFT_ENVIRONMENT?.trim().toLowerCase();
    if (configured && RUNTIME_ENVIRONMENTS.includes(configured as RuntimeEnvironment)) {
        return configured as RuntimeEnvironment;
    }
    if (process.env.NODE_ENV === 'test') return 'testing';
    if (process.env.NODE_ENV === 'development') return 'development';
    return 'production';
}

export function isNonProductionEnvironment(): boolean {
    return getRuntimeEnvironment() !== 'production';
}

export function isKnownProductionEndpoint(value?: string | null): boolean {
    if (!value?.trim()) return false;
    try {
        return PRODUCTION_HOSTS.has(new URL(value).hostname.toLowerCase());
    } catch {
        // A configured endpoint that cannot be parsed is invalid and must not be used.
        return true;
    }
}

export function isLoopbackEndpoint(value?: string | null): boolean {
    if (!value?.trim()) return false;
    try {
        return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname.toLowerCase());
    } catch {
        return false;
    }
}

export function isAllowedNonProductionEndpoint(value?: string | null): boolean {
    if (!value?.trim() || isKnownProductionEndpoint(value)) return false;
    const environment = getRuntimeEnvironment();
    return environment === 'staging' || isLoopbackEndpoint(value);
}

export function assertNonProductionEndpoints(config: Record<string, unknown>): void {
    if (!isNonProductionEnvironment()) return;
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && value.trim() && !isAllowedNonProductionEndpoint(value)) {
            throw new Error(`Refusing non-isolated endpoint in ${getRuntimeEnvironment()} environment (${key}). Configure loopback services or a separate staging project.`);
        }
    }
}

/** Test integration databases must be local and named lesoft_test. */
export function assertIsolatedTestPostgresUrl(connectionString: string): void {
    let parsed: URL;
    try {
        parsed = new URL(connectionString);
    } catch {
        throw new Error('Test database URL is invalid.');
    }
    const host = parsed.hostname.toLowerCase();
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        throw new Error('Test database must use PostgreSQL.');
    }
    if (!['localhost', '127.0.0.1', '::1'].includes(host) || database !== 'lesoft_test') {
        throw new Error('Database tests only run against a local PostgreSQL database named lesoft_test.');
    }
}
