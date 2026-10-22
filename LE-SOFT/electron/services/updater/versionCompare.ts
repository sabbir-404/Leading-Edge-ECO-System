// ─────────────────────────────────────────────────────────────────────────────
//  Updater version utilities (pure, no Electron imports — unit-testable)
//
//  Used by the unsigned-macOS manual update fallback in electron/main.ts.
//  Implements SemVer 2.0.0 precedence (https://semver.org/#spec-item-11) so that
//  prerelease versions such as `1.8.13-rc.1` order correctly:
//      1.8.12 < 1.8.13-rc.1 < 1.8.13-rc.2 < 1.8.13
//  The Windows/Linux path uses electron-updater, which is already semver-aware;
//  nothing here changes that behaviour.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: Array<string | number>;
}

export interface GitHubReleaseLike {
    tag_name?: string | null;
    draft?: boolean;
    prerelease?: boolean;
    html_url?: string;
}

// Optional leading "v", MAJOR.MINOR.PATCH, optional -prerelease, optional +build (ignored).
const SEMVER_RE =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Parses a semver string (optionally `v`-prefixed). Returns null if invalid. */
export function parseVersion(input: unknown): ParsedVersion | null {
    if (typeof input !== 'string') return null;
    const m = SEMVER_RE.exec(input.trim());
    if (!m) return null;
    const prerelease = m[4]
        ? m[4].split('.').map(id => (/^\d+$/.test(id) ? Number(id) : id))
        : [];
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease };
}

/** True if the version carries a prerelease tag (e.g. `1.8.13-rc.1`). */
export function isPrereleaseVersion(input: unknown): boolean {
    const p = parseVersion(input);
    return !!p && p.prerelease.length > 0;
}

function compareIdentifiers(a: string | number, b: string | number): number {
    const aNum = typeof a === 'number';
    const bNum = typeof b === 'number';
    if (aNum && bNum) return a === b ? 0 : (a < b ? -1 : 1);
    if (aNum) return -1; // numeric identifiers have lower precedence than alphanumeric
    if (bNum) return 1;
    return a === b ? 0 : (a < b ? -1 : 1); // ASCII lexical order
}

/**
 * SemVer precedence comparison.
 * Returns 1 if a > b, -1 if a < b, 0 if equal, or null if either is invalid.
 */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return null;

    for (const key of ['major', 'minor', 'patch'] as const) {
        if (pa[key] !== pb[key]) return pa[key] > pb[key] ? 1 : -1;
    }

    // A version without prerelease has higher precedence than one with.
    const aPre = pa.prerelease;
    const bPre = pb.prerelease;
    if (aPre.length === 0 && bPre.length === 0) return 0;
    if (aPre.length === 0) return 1;
    if (bPre.length === 0) return -1;

    const len = Math.max(aPre.length, bPre.length);
    for (let i = 0; i < len; i++) {
        if (i >= aPre.length) return -1; // shorter set of identifiers has lower precedence
        if (i >= bPre.length) return 1;
        const c = compareIdentifiers(aPre[i], bPre[i]);
        if (c !== 0) return c as -1 | 1;
    }
    return 0;
}

/** True only if `candidate` is a valid version strictly newer than valid `current`. */
export function isNewerVersion(candidate: unknown, current: unknown): boolean {
    return compareVersions(candidate, current) === 1;
}

/**
 * GitHub API URL used by the macOS manual fallback.
 * `/releases/latest` excludes prereleases, so the list endpoint is used and
 * filtering is done locally by {@link selectManualUpdateRelease}.
 */
export function getManualUpdateFeedUrl(owner: string, repo: string): string {
    return `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`;
}

/**
 * Picks the highest release strictly newer than `currentVersion`.
 *
 * Mirrors electron-updater's default `allowPrerelease` behaviour:
 *   - stable installs  (e.g. 1.8.12)      → only stable releases are considered
 *   - prerelease installs (e.g. 1.8.13-rc.1) → stable AND prerelease releases are considered
 * Drafts and tags that are not valid semver are always ignored.
 * Returns null when no newer eligible release exists or the current version is invalid.
 */
export function selectManualUpdateRelease<T extends GitHubReleaseLike>(
    currentVersion: string,
    releases: readonly T[] | null | undefined,
): T | null {
    if (!parseVersion(currentVersion) || !Array.isArray(releases)) return null;
    const allowPrerelease = isPrereleaseVersion(currentVersion);

    let best: T | null = null;
    for (const rel of releases) {
        if (!rel || rel.draft) continue;
        const tag = rel.tag_name;
        if (!parseVersion(tag)) continue;
        const isPre = rel.prerelease === true || isPrereleaseVersion(tag);
        if (isPre && !allowPrerelease) continue;
        if (!isNewerVersion(tag, currentVersion)) continue;
        if (!best || compareVersions(tag, best.tag_name) === 1) best = rel;
    }
    return best;
}
