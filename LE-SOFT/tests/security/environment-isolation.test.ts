import { afterEach, describe, expect, it } from 'vitest';
import {
    assertIsolatedTestPostgresUrl,
    getRuntimeEnvironment,
    isAllowedNonProductionEndpoint,
    isKnownProductionEndpoint,
} from '../../electron/runtime-environment';

const originalEnvironment = process.env.LE_SOFT_ENVIRONMENT;
const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.LE_SOFT_ENVIRONMENT;
    else process.env.LE_SOFT_ENVIRONMENT = originalEnvironment;
    if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnvironment;
});

describe('runtime environment isolation', () => {
    it('uses testing mode for test runners unless explicitly overridden', () => {
        delete process.env.LE_SOFT_ENVIRONMENT;
        process.env.NODE_ENV = 'test';
        expect(getRuntimeEnvironment()).toBe('testing');
    });

    it('allows only loopback services in development', () => {
        process.env.LE_SOFT_ENVIRONMENT = 'development';
        expect(isAllowedNonProductionEndpoint('http://127.0.0.1:54321')).toBe(true);
        expect(isAllowedNonProductionEndpoint('https://staging.example.test')).toBe(false);
        expect(isAllowedNonProductionEndpoint('https://ildkkgjrolcjijwfokek.supabase.co')).toBe(false);
    });

    it('allows a separate staging endpoint but blocks known production endpoints', () => {
        process.env.LE_SOFT_ENVIRONMENT = 'staging';
        expect(isAllowedNonProductionEndpoint('https://staging.example.test')).toBe(true);
        expect(isAllowedNonProductionEndpoint('https://ildkkgjrolcjijwfokek.supabase.co')).toBe(false);
        expect(isKnownProductionEndpoint('http://100.88.85.6:3001')).toBe(true);
    });

    it('accepts only local PostgreSQL test URLs for lesoft_test', () => {
        expect(() => assertIsolatedTestPostgresUrl(
            'postgresql://lesoft_test:test-only-password@127.0.0.1:5432/lesoft_test',
        )).not.toThrow();
        expect(() => assertIsolatedTestPostgresUrl(
            'postgresql://user:secret@db.example.test:5432/production',
        )).toThrow(/local PostgreSQL database named lesoft_test/);
        expect(() => assertIsolatedTestPostgresUrl(
            'postgresql://user:secret@127.0.0.1:5432/other',
        )).toThrow(/local PostgreSQL database named lesoft_test/);
    });
});
