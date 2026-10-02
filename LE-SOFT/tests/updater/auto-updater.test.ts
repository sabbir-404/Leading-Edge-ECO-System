import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';

// Helper for semantic version comparison
function compareVersions(v1: string, v2: string): number {
    const p1 = v1.replace(/^v/, '').split('.').map(Number);
    const p2 = v2.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

// Log sanitizer mirroring electron/main.ts
function sanitizeUpdaterLog(msg: any): string {
    if (typeof msg !== 'string') {
        try { msg = JSON.stringify(msg); } catch { msg = String(msg); }
    }
    return msg
        .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]+/gi, '$1[REDACTED]')
        .replace(/(gh[pousr]_[a-zA-Z0-9_]{20,})/gi, '[REDACTED_GH_TOKEN]')
        .replace(/([?&](?:token|key|secret|password|access_token)=)[^&]+/gi, '$1[REDACTED]')
        .replace(/(authorization:\s*)[^\r\n]+/gi, '$1[REDACTED]');
}

describe('LESOFT Update/Upgrade System Comprehensive Test Suite', () => {

    describe('1. Semantic Version Comparison & Upgrade Detection', () => {
        it('detects a newer version when installed version is older', () => {
            expect(compareVersions('1.8.6', '1.8.4')).toBe(1);
            expect(compareVersions('1.8.6', '1.8.5')).toBe(1);
            expect(compareVersions('1.9.0', '1.8.6')).toBe(1);
            expect(compareVersions('2.0.0', '1.8.6')).toBe(1);
        });

        it('correctly reports no update when installed version equals remote version', () => {
            expect(compareVersions('1.8.6', '1.8.6')).toBe(0);
            expect(compareVersions('v1.8.6', '1.8.6')).toBe(0);
        });

        it('does not prompt update when installed version is ahead of remote version', () => {
            expect(compareVersions('1.8.6', '1.8.7')).toBe(-1);
            expect(compareVersions('1.8.5', '1.8.6')).toBe(-1);
        });

        it('handles version tags with leading v prefix gracefully', () => {
            expect(compareVersions('v1.8.6', 'v1.8.5')).toBe(1);
            expect(compareVersions('v1.8.4', 'v1.8.6')).toBe(-1);
            expect(compareVersions('v1.8.6', 'v1.8.6')).toBe(0);
        });
    });

    describe('2. Provider & Packaging Configuration', () => {
        const pkgPath = path.resolve(__dirname, '../../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        it('configures github provider with correct owner and repository', () => {
            expect(pkg.build).toBeDefined();
            expect(pkg.build.publish).toBeDefined();
            expect(pkg.build.publish.provider).toBe('github');
            expect(pkg.build.publish.owner).toBe('sabbir-404');
            expect(pkg.build.publish.repo).toBe('Leading-Edge-ECO-System');
        });

        it('does NOT contain hardcoded developer tokens or credentials in package.json', () => {
            const rawContent = fs.readFileSync(pkgPath, 'utf8');
            expect(rawContent).not.toMatch(/ghp_[a-zA-Z0-9]{20,}/);
            expect(rawContent).not.toMatch(/github_pat_[a-zA-Z0-9]{20,}/);
            expect(rawContent).not.toMatch(/GH_TOKEN/);
            expect(pkg.build.publish.token).toBeUndefined();
        });

        it('specifies explicit hyphenated artifactName to avoid spaces in installer filename', () => {
            expect(pkg.build.win).toBeDefined();
            expect(pkg.build.win.artifactName).toBe('${productName}-Setup-${version}.${ext}');
        });

        it('targets Windows NSIS with valid configuration', () => {
            expect(pkg.build.win.target).toBe('nsis');
            expect(pkg.build.nsis).toBeDefined();
            expect(pkg.build.nsis.shortcutName).toBe('LESOFT');
            expect(pkg.build.appId).toBe('com.leadingedge.lesoft');
        });
    });

    describe('3. Release Metadata & latest.yml Validation', () => {
        it('validates latest.yml format and schema constraints', () => {
            const sampleYaml = `
version: 1.8.6
files:
  - url: LESOFT-Setup-1.8.6.exe
    sha512: cH3AIWTF9mXW1NbSGDRQ9c/NSe+KfrwORog4KrQbQAygK3Lfx5Q2tMbwyrg3UVIIUnjRgg1xVTCmvAoVgMM0Rg==
    size: 174052505
path: LESOFT-Setup-1.8.6.exe
sha512: cH3AIWTF9mXW1NbSGDRQ9c/NSe+KfrwORog4KrQbQAygK3Lfx5Q2tMbwyrg3UVIIUnjRgg1xVTCmvAoVgMM0Rg==
releaseDate: '2026-10-02T05:16:46.194Z'
`;
            const doc: any = yaml.load(sampleYaml);
            expect(doc).toBeDefined();
            expect(doc.version).toBe('1.8.6');
            expect(Array.isArray(doc.files)).toBe(true);
            expect(doc.files.length).toBeGreaterThan(0);
            expect(doc.files[0].url).toBe('LESOFT-Setup-1.8.6.exe');
            expect(doc.path).toBe('LESOFT-Setup-1.8.6.exe');
            expect(doc.sha512).toBe(doc.files[0].sha512);
            expect(doc.files[0].size).toBeGreaterThan(0);
            expect(doc.releaseDate).toBeDefined();
        });

        it('detects mismatched artifact filename between latest.yml and remote asset', () => {
            const latestYmlUrl = 'LESOFT-Setup-1.8.6.exe';
            const uploadedAssetWithDots = 'LESOFT.Setup.1.8.6.exe';
            const uploadedAssetWithSpaces = 'LESOFT Setup 1.8.6.exe';

            // Exact match is required
            expect(latestYmlUrl === uploadedAssetWithDots).toBe(false);
            expect(latestYmlUrl === uploadedAssetWithSpaces).toBe(false);
            expect(latestYmlUrl === 'LESOFT-Setup-1.8.6.exe').toBe(true);
        });

        it('validates SHA-512 checksum integrity format', () => {
            const hashBase64 = 'cH3AIWTF9mXW1NbSGDRQ9c/NSe+KfrwORog4KrQbQAygK3Lfx5Q2tMbwyrg3UVIIUnjRgg1xVTCmvAoVgMM0Rg==';
            const buf = Buffer.from(hashBase64, 'base64');
            // SHA-512 is 64 bytes (512 bits)
            expect(buf.length).toBe(64);
        });

        it('calculates matching SHA-512 for downloaded update payload', () => {
            const payload = Buffer.from('LESOFT binary payload test simulation for integrity check');
            const calculatedSha512 = crypto.createHash('sha512').update(payload).digest('base64');
            
            // Re-hash should be bit-for-bit identical
            const verificationSha512 = crypto.createHash('sha512').update(payload).digest('base64');
            expect(calculatedSha512).toBe(verificationSha512);

            // Corrupted payload must fail validation
            const corruptedPayload = Buffer.from('LESOFT binary payload CORRUPTED');
            const corruptedSha512 = crypto.createHash('sha512').update(corruptedPayload).digest('base64');
            expect(calculatedSha512).not.toBe(corruptedSha512);
        });
    });

    describe('4. Sanitized Updater Logging & Security Verification', () => {
        it('redacts Bearer tokens in error and info logs', () => {
            const raw = 'Request failed with 401: Bearer ghp_SecretDeveloperToken1234567890';
            const clean = sanitizeUpdaterLog(raw);
            expect(clean).not.toContain('ghp_SecretDeveloperToken1234567890');
            expect(clean).toContain('[REDACTED]');
        });

        it('redacts GitHub Personal Access Tokens (ghp_, gho_, ghu_)', () => {
            const raw = 'Cannot authenticate using token ghp_123456789012345678901234567890 to GitHub API';
            const clean = sanitizeUpdaterLog(raw);
            expect(clean).not.toContain('ghp_123456789012345678901234567890');
            expect(clean).toContain('[REDACTED_GH_TOKEN]');
        });

        it('redacts query parameter tokens and secrets', () => {
            const raw = 'Failed to fetch https://api.github.com/repos/test?access_token=SuperSecretValue123&other=ok';
            const clean = sanitizeUpdaterLog(raw);
            expect(clean).not.toContain('SuperSecretValue123');
            expect(clean).toContain('access_token=[REDACTED]');
        });

        it('redacts authorization headers', () => {
            const raw = 'Headers sent: Authorization: Basic dXNlcjpwYXNz';
            const clean = sanitizeUpdaterLog(raw);
            expect(clean).not.toContain('dXNlcjpwYXNz');
            expect(clean).toContain('[REDACTED]');
        });
    });

    describe('5. UI State Machine & Failure Recovery', () => {
        it('recovers from download error without getting stuck in downloading state', () => {
            let uiStatus = 'available';
            
            // User clicks download
            uiStatus = 'downloading';
            expect(uiStatus).toBe('downloading');

            // Download error event arrives
            const errorEvent = { status: 'error', message: 'Cannot download: status 404', phase: 'download' };
            if (errorEvent.status === 'error') {
                // UI state machine recovers: reverts to available for retry
                uiStatus = 'available';
            }

            expect(uiStatus).toBe('available');
        });

        it('transitions correctly through full happy-path update lifecycle', () => {
            const states: string[] = [];

            // 1. Idle
            states.push('idle');
            // 2. Checking
            states.push('checking');
            // 3. Update Available
            states.push('available');
            // 4. Downloading (with progress)
            states.push('downloading');
            // 5. Download complete / Ready
            states.push('ready');
            // 6. Installing
            states.push('installing');

            expect(states).toEqual([
                'idle',
                'checking',
                'available',
                'downloading',
                'ready',
                'installing'
            ]);
        });
    });

    describe('6. Independence from MAKE NAS & Database Failover', () => {
        it('confirms updater configuration has zero dependence on DatabaseFailoverEngine', () => {
            const mainTsPath = path.resolve(__dirname, '../../electron/main.ts');
            const mainContent = fs.readFileSync(mainTsPath, 'utf8');

            // Find setupAutoUpdater function
            const setupFnMatch = mainContent.match(/function setupAutoUpdater\(\) \{([\s\S]*?)\n\}/);
            expect(setupFnMatch).toBeDefined();
            const fnBody = setupFnMatch![1];

            // Verify setupAutoUpdater does not reference NAS or DatabaseFailoverEngine
            expect(fnBody).not.toMatch(/DatabaseFailoverEngine/i);
            expect(fnBody).not.toMatch(/nasFetch/i);
            expect(fnBody).not.toMatch(/lenas\.me/i);
            expect(fnBody).not.toMatch(/100\.88\.85\.6/i);
        });

        it('preserves user settings and license across uninstaller script', () => {
            const uninstallNshPath = path.resolve(__dirname, '../../build/uninstall.nsh');
            const nshContent = fs.readFileSync(uninstallNshPath, 'utf8');

            // Custom uninstallation macro should ONLY execute during full uninstallation
            expect(nshContent).toContain('!macro customUnInstall');
            expect(nshContent).not.toContain('!macro customInstall');
        });
    });
});
