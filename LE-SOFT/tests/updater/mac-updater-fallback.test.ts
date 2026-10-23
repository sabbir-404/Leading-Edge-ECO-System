import { describe, it, expect } from 'vitest';
import {
    parseVersion,
    isPrereleaseVersion,
    compareVersions,
    isNewerVersion,
    selectManualUpdateRelease,
    getManualUpdateFeedUrl,
    type GitHubReleaseLike
} from '../../electron/services/updater/versionCompare';

describe('macOS Manual Updater Fallback & SemVer Regression Suite', () => {

    describe('1. SemVer Parsing & Validation', () => {
        it('parses standard 3-part version with and without "v" prefix', () => {
            expect(parseVersion('1.8.12')).toEqual({
                major: 1,
                minor: 8,
                patch: 12,
                prerelease: []
            });
            expect(parseVersion('v1.8.12')).toEqual({
                major: 1,
                minor: 8,
                patch: 12,
                prerelease: []
            });
        });

        it('parses prerelease tags correctly', () => {
            expect(parseVersion('1.8.13-rc.1')).toEqual({
                major: 1,
                minor: 8,
                patch: 13,
                prerelease: ['rc', 1]
            });
            expect(parseVersion('v1.8.13-rc.2')).toEqual({
                major: 1,
                minor: 8,
                patch: 13,
                prerelease: ['rc', 2]
            });
            expect(parseVersion('2.0.0-alpha.beta.1')).toEqual({
                major: 2,
                minor: 0,
                patch: 0,
                prerelease: ['alpha', 'beta', 1]
            });
        });

        it('identifies prerelease status correctly', () => {
            expect(isPrereleaseVersion('1.8.12')).toBe(false);
            expect(isPrereleaseVersion('v1.8.13')).toBe(false);
            expect(isPrereleaseVersion('1.8.13-rc.1')).toBe(true);
            expect(isPrereleaseVersion('v1.8.13-beta.0')).toBe(true);
            expect(isPrereleaseVersion('invalid')).toBe(false);
        });

        it('returns null on invalid versions', () => {
            expect(parseVersion('')).toBeNull();
            expect(parseVersion(null)).toBeNull();
            expect(parseVersion(undefined)).toBeNull();
            expect(parseVersion('not-a-version')).toBeNull();
            expect(parseVersion('1.2')).toBeNull();
            expect(parseVersion('1.2.3.4')).toBeNull();
        });
    });

    describe('2. SemVer Precedence & Comparison (compareVersions)', () => {
        it('compares standard versions correctly', () => {
            expect(compareVersions('1.8.13', '1.8.12')).toBe(1);
            expect(compareVersions('1.8.12', '1.8.13')).toBe(-1);
            expect(compareVersions('1.8.12', '1.8.12')).toBe(0);
            expect(compareVersions('v1.8.12', '1.8.12')).toBe(0);
        });

        it('CRITICAL BUG REPRODUCTION: 1.8.13-rc.1 vs 1.8.12', () => {
            // The old split('.').map(Number) bug evaluated 1.8.13-rc.1 as [1, 8, NaN, 1]
            // which caused published v1.8.12 to be evaluated as NEWER than 1.8.13-rc.1.
            // With SemVer 2.0: 1.8.13-rc.1 > 1.8.12 (patch 13 > patch 12).
            expect(compareVersions('1.8.13-rc.1', '1.8.12')).toBe(1);
            expect(compareVersions('1.8.12', '1.8.13-rc.1')).toBe(-1);
            expect(isNewerVersion('1.8.12', '1.8.13-rc.1')).toBe(false);
            expect(isNewerVersion('1.8.13-rc.1', '1.8.12')).toBe(true);
        });

        it('orders RC-to-RC sequentially', () => {
            expect(compareVersions('1.8.13-rc.2', '1.8.13-rc.1')).toBe(1);
            expect(compareVersions('1.8.13-rc.1', '1.8.13-rc.2')).toBe(-1);
            expect(compareVersions('1.8.13-rc.10', '1.8.13-rc.2')).toBe(1); // numeric ordering, not lexical
            expect(isNewerVersion('1.8.13-rc.2', '1.8.13-rc.1')).toBe(true);
        });

        it('orders RC-to-final-stable correctly: final stable > RC', () => {
            // SemVer 2.0 item 11: A normal version has greater precedence than a prerelease version
            // when major, minor, and patch are equal.
            expect(compareVersions('1.8.13', '1.8.13-rc.1')).toBe(1);
            expect(compareVersions('1.8.13-rc.1', '1.8.13')).toBe(-1);
            expect(isNewerVersion('1.8.13', '1.8.13-rc.1')).toBe(true);
            expect(isNewerVersion('1.8.13-rc.1', '1.8.13')).toBe(false);
        });

        it('handles complex prerelease identifier precedence', () => {
            // 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
            const chain = [
                '1.0.0-alpha',
                '1.0.0-alpha.1',
                '1.0.0-alpha.beta',
                '1.0.0-beta',
                '1.0.0-beta.2',
                '1.0.0-beta.11',
                '1.0.0-rc.1',
                '1.0.0'
            ];
            for (let i = 0; i < chain.length - 1; i++) {
                expect(compareVersions(chain[i + 1], chain[i])).toBe(1);
                expect(compareVersions(chain[i], chain[i + 1])).toBe(-1);
            }
        });

        it('returns null when any version is invalid', () => {
            expect(compareVersions('invalid', '1.8.12')).toBeNull();
            expect(compareVersions('1.8.12', null)).toBeNull();
        });
    });

    describe('3. GitHub Release Selection (selectManualUpdateRelease)', () => {
        const mockReleases: GitHubReleaseLike[] = [
            { tag_name: 'v1.8.14', prerelease: false, draft: false, html_url: 'https://github.com/rel/1.8.14' },
            { tag_name: 'v1.8.13', prerelease: false, draft: false, html_url: 'https://github.com/rel/1.8.13' },
            { tag_name: 'v1.8.13-rc.2', prerelease: true, draft: false, html_url: 'https://github.com/rel/1.8.13-rc.2' },
            { tag_name: 'v1.8.13-rc.1', prerelease: true, draft: false, html_url: 'https://github.com/rel/1.8.13-rc.1' },
            { tag_name: 'v1.8.12', prerelease: false, draft: false, html_url: 'https://github.com/rel/1.8.12' },
            { tag_name: 'v1.8.11', prerelease: false, draft: false, html_url: 'https://github.com/rel/1.8.11' }
        ];

        it('for STABLE installed version (1.8.12): ignores prereleases, selects newest STABLE', () => {
            // Only stable releases considered
            const releasesOnlyRc: GitHubReleaseLike[] = [
                { tag_name: 'v1.8.13-rc.1', prerelease: true, draft: false },
                { tag_name: 'v1.8.12', prerelease: false, draft: false }
            ];
            // Stable 1.8.12 should NOT be prompted to install 1.8.13-rc.1
            expect(selectManualUpdateRelease('1.8.12', releasesOnlyRc)).toBeNull();

            // When stable 1.8.13 is available, stable 1.8.12 selects 1.8.13
            const selected = selectManualUpdateRelease('1.8.12', mockReleases);
            expect(selected?.tag_name).toBe('v1.8.14');
        });

        it('for RC installed version (1.8.13-rc.1): correctly discovers newer RC (RC-to-RC)', () => {
            const rcFeed: GitHubReleaseLike[] = [
                { tag_name: 'v1.8.13-rc.2', prerelease: true, draft: false },
                { tag_name: 'v1.8.13-rc.1', prerelease: true, draft: false },
                { tag_name: 'v1.8.12', prerelease: false, draft: false }
            ];

            const selected = selectManualUpdateRelease('1.8.13-rc.1', rcFeed);
            expect(selected).not.toBeNull();
            expect(selected?.tag_name).toBe('v1.8.13-rc.2');
        });

        it('for RC installed version (1.8.13-rc.1): does NOT downgrade to published 1.8.12 (RC-to-older-stable)', () => {
            const feedWithOnlyOlderStable: GitHubReleaseLike[] = [
                { tag_name: 'v1.8.12', prerelease: false, draft: false },
                { tag_name: 'v1.8.11', prerelease: false, draft: false }
            ];

            const selected = selectManualUpdateRelease('1.8.13-rc.1', feedWithOnlyOlderStable);
            expect(selected).toBeNull();
        });

        it('for RC installed version (1.8.13-rc.1): upgrades to final stable release (RC-to-stable)', () => {
            const feedWithFinalStable: GitHubReleaseLike[] = [
                { tag_name: 'v1.8.13', prerelease: false, draft: false },
                { tag_name: 'v1.8.13-rc.2', prerelease: true, draft: false },
                { tag_name: 'v1.8.13-rc.1', prerelease: true, draft: false }
            ];

            const selected = selectManualUpdateRelease('1.8.13-rc.1', feedWithFinalStable);
            expect(selected).not.toBeNull();
            expect(selected?.tag_name).toBe('v1.8.13'); // Final stable preferred over rc.2
        });

        it('ignores draft releases even if version is higher', () => {
            const feedWithDraft: GitHubReleaseLike[] = [
                { tag_name: 'v1.8.14', prerelease: false, draft: true },
                { tag_name: 'v1.8.13', prerelease: false, draft: false }
            ];

            const selected = selectManualUpdateRelease('1.8.12', feedWithDraft);
            expect(selected?.tag_name).toBe('v1.8.13');
        });

        it('ignores malformed tags and non-semver releases', () => {
            const feedWithMalformed: GitHubReleaseLike[] = [
                { tag_name: 'nightly-build-2026', prerelease: false, draft: false },
                { tag_name: 'v1.8.x', prerelease: false, draft: false },
                { tag_name: null, prerelease: false, draft: false },
                { tag_name: 'v1.8.13', prerelease: false, draft: false }
            ];

            const selected = selectManualUpdateRelease('1.8.12', feedWithMalformed);
            expect(selected?.tag_name).toBe('v1.8.13');
        });

        it('handles out-of-order API results and selects true highest version', () => {
            // GitHub releases array might not be strictly semver-ordered (e.g. out of sequence tags)
            const unorderedFeed: GitHubReleaseLike[] = [
                { tag_name: 'v1.8.10', prerelease: false, draft: false },
                { tag_name: 'v1.8.13', prerelease: false, draft: false },
                { tag_name: 'v1.8.11', prerelease: false, draft: false },
                { tag_name: 'v1.8.12', prerelease: false, draft: false }
            ];

            const selected = selectManualUpdateRelease('1.8.11', unorderedFeed);
            expect(selected?.tag_name).toBe('v1.8.13');
        });
    });

    describe('4. Feed URL Generation', () => {
        it('constructs correct GitHub releases API URL', () => {
            const url = getManualUpdateFeedUrl('sabbir-404', 'Leading-Edge-ECO-System');
            expect(url).toBe('https://api.github.com/repos/sabbir-404/Leading-Edge-ECO-System/releases?per_page=30');
        });
    });
});
