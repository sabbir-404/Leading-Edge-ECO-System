import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  isApprovedNasHost,
  isApprovedNasPort,
  validateAndNormalizeDownloadUrl,
  sanitizeDownloadDestination,
  validateAndNormalizeRedirect,
  readResponseBodyWithSignal,
  hasPathTraversal,
  isApprovedCloudflareTunnelUrl,
  downloadPdfFromNas
} from '../../electron/ipc/handlers/make';

describe('PDF Download Security & Candidate Resolution — Issue 1 Fixes', () => {
  let tempTestDir: string;

  beforeEach(() => {
    vi.stubEnv('LE_SOFT_ENVIRONMENT', 'testing');
    vi.stubEnv('NAS_STORAGE_URL', 'http://127.0.0.1:8081');
    vi.stubEnv('NAS_LOCAL_STORAGE_URL', 'http://localhost:8081');
    vi.stubEnv('NAS_TUNNEL_STORAGE_URL', '');
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-sec-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {}
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── 1. FILENAME TRAVERSAL & PATH SANITIZATION ────────────────────────────
  describe('1. Filename Traversal & Temp Path Isolation', () => {
    it('prevents POSIX directory traversal (../../) and stays strictly in temp directory', () => {
      const { targetPath, fileName } = sanitizeDownloadDestination('../../../../etc/passwd', tempTestDir);
      expect(targetPath.startsWith(path.resolve(tempTestDir) + path.sep)).toBe(true);
      expect(fileName).not.toContain('..');
      expect(fileName).toContain('passwd');
      expect(path.dirname(targetPath)).toBe(path.resolve(tempTestDir));
    });

    it('prevents Windows directory traversal (..\\..) and stays strictly in temp directory', () => {
      const { targetPath, fileName } = sanitizeDownloadDestination('..\\..\\..\\Windows\\System32\\cmd.exe', tempTestDir);
      expect(targetPath.startsWith(path.resolve(tempTestDir) + path.sep)).toBe(true);
      expect(fileName).not.toContain('..');
      expect(fileName).toContain('cmd.exe');
      expect(path.dirname(targetPath)).toBe(path.resolve(tempTestDir));
    });

    it('sanitizes illegal filesystem and control characters in filename', () => {
      const { targetPath, fileName } = sanitizeDownloadDestination('invoice*receipt:2026?|<>.pdf', tempTestDir);
      expect(targetPath.startsWith(path.resolve(tempTestDir) + path.sep)).toBe(true);
      expect(fileName).not.toMatch(/[*?:|<>]/);
      expect(fileName).toContain('.pdf');
    });

    it('strips leading dots that could create hidden files or dot-dot traversal', () => {
      const { targetPath, fileName } = sanitizeDownloadDestination('...hidden-file.pdf', tempTestDir);
      expect(targetPath.startsWith(path.resolve(tempTestDir) + path.sep)).toBe(true);
      expect(fileName).not.toMatch(/_\.\.\./);
    });

    it('gracefully handles empty or null filename with fallback to document.pdf', () => {
      const { targetPath, fileName } = sanitizeDownloadDestination('', tempTestDir);
      expect(targetPath.startsWith(path.resolve(tempTestDir) + path.sep)).toBe(true);
      expect(fileName).toContain('document.pdf');
    });
  });

  // ── 2. URL VALIDATION & HOST ENFORCEMENT ─────────────────────────────────
  describe('2. URL Validation & Approved Host Policy', () => {
    it('blocks production NAS hosts in isolated test mode', () => {
      expect(isApprovedNasHost('100.88.85.6', '8081')).toBe(false);
      expect(isApprovedNasHost('192.168.1.14', '8081')).toBe(false);
      expect(isApprovedNasHost('storage.lenas.me', '443')).toBe(false);
      expect(isApprovedNasHost('storage.lenas.me', '')).toBe(false);
    });

    it('rejects storage.lenas.me over unencrypted HTTP', () => {
      const res = validateAndNormalizeDownloadUrl('http://storage.lenas.me/files/invoice.pdf');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('not an approved NAS storage endpoint');
    });

    it('rejects lookalike hostnames such as storage.lenas.me.attacker.invalid', () => {
      expect(isApprovedNasHost('storage.lenas.me.attacker.invalid')).toBe(false);
      expect(isApprovedNasHost('storage.lenas.me.evil.com')).toBe(false);
      expect(isApprovedNasHost('attacker-storage.lenas.me')).toBe(false);

      const res = validateAndNormalizeDownloadUrl('https://storage.lenas.me.attacker.invalid/files/invoice.pdf');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('not an approved NAS storage endpoint');
    });

    it('rejects arbitrary ports on configured candidate hosts and approved endpoints', () => {
      expect(isApprovedNasPort('100.88.85.6', '9999')).toBe(false);
      expect(isApprovedNasPort('storage.lenas.me', '9999')).toBe(false);
      expect(isApprovedNasPort('storage.lenas.me', '80')).toBe(false);
      expect(isApprovedNasHost('100.88.85.6', '9999')).toBe(false);
      expect(isApprovedNasHost('storage.lenas.me', '80')).toBe(false);

      const res = validateAndNormalizeDownloadUrl('http://127.0.0.1:9999/files/invoice.pdf');
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/Unapproved (port|endpoint)/i);
    });

    it('rejects unapproved arbitrary external domains', () => {
      expect(isApprovedNasHost('evil.com')).toBe(false);
      expect(isApprovedNasHost('attacker.net', '8081')).toBe(false);
      expect(isApprovedNasHost('google.com')).toBe(false);

      const res = validateAndNormalizeDownloadUrl('https://evil.com/files/malware.exe');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('not an approved NAS storage endpoint');
    });

    it('rejects unapproved private and localhost endpoints', () => {
      expect(isApprovedNasHost('127.0.0.1')).toBe(true);
      expect(isApprovedNasHost('localhost')).toBe(true);
      expect(isApprovedNasHost('169.254.169.254')).toBe(false); // Cloud metadata
      expect(isApprovedNasHost('10.0.0.1')).toBe(false);

      const res1 = validateAndNormalizeDownloadUrl('http://127.0.0.1:8081/invoice.pdf');
      expect(res1.isValid).toBe(true);
      expect(res1.candidates.length).toBeGreaterThan(0);

      const res2 = validateAndNormalizeDownloadUrl('http://10.0.0.1:8081/invoice.pdf');
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('not an approved NAS storage endpoint');
    });

    it('rejects unapproved ports on approved NAS hosts', () => {
      expect(isApprovedNasHost('100.88.85.6', '22')).toBe(false);
      expect(isApprovedNasHost('100.88.85.6', '3389')).toBe(false);
      expect(isApprovedNasHost('storage.lenas.me', '8080')).toBe(false);

      const res = validateAndNormalizeDownloadUrl('http://127.0.0.1:22/files/invoice.pdf');
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/Unapproved port: 22/i);
    });

    it('rejects unsupported protocols (file, ftp, data, javascript)', () => {
      expect(validateAndNormalizeDownloadUrl('file:///etc/passwd').isValid).toBe(false);
      expect(validateAndNormalizeDownloadUrl('ftp://100.88.85.6/invoice.pdf').isValid).toBe(false);
      expect(validateAndNormalizeDownloadUrl('data:application/pdf;base64,AAAA').isValid).toBe(false);
      expect(validateAndNormalizeDownloadUrl('javascript:alert(1)').isValid).toBe(false);
    });

    it('rejects path traversal attempts inside the URL pathname', () => {
      const res = validateAndNormalizeDownloadUrl('http://127.0.0.1:8081/files/../../secret.pdf');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Path traversal is not permitted');
    });

    it('detects directory traversal across plain and percent-encoded forms using hasPathTraversal', () => {
      expect(hasPathTraversal('../')).toBe(true);
      expect(hasPathTraversal('..\\')).toBe(true);
      expect(hasPathTraversal('/..')).toBe(true);
      expect(hasPathTraversal('\\..')).toBe(true);
      expect(hasPathTraversal('..')).toBe(true);
      expect(hasPathTraversal('%2e%2e/')).toBe(true);
      expect(hasPathTraversal('%2e%2e%2f')).toBe(true);
      expect(hasPathTraversal('..%2f')).toBe(true);
      expect(hasPathTraversal('..%5c')).toBe(true);
      expect(hasPathTraversal('/files/%2e%2e/secret.pdf')).toBe(true);
      expect(hasPathTraversal('/files/%252e%252e%252fsecret.pdf')).toBe(true); // double-encoded
      expect(hasPathTraversal('http://127.0.0.1:8081/files/invoice.pdf')).toBe(false);
      expect(hasPathTraversal('invoice.v1.2.pdf')).toBe(false);
    });
  });

  // ── 3. ALLOWED LEGACY URL NORMALIZATION ─────────────────────────────────
  describe('3. Legacy :8080 URL Normalization', () => {
    it('normalizes legacy :8080 URLs into candidate endpoints without including port 8080', () => {
      const legacyUrl = 'http://127.0.0.1:8080/files/make-order-files/invoices/inv_123.pdf';
      const result = validateAndNormalizeDownloadUrl(legacyUrl);

      expect(result.isValid).toBe(true);
      expect(result.subPath).toBe('files/make-order-files/invoices/inv_123.pdf');
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);

      // Verify that candidate endpoints NEVER contain port 8080
      for (const candidate of result.candidates) {
        expect(candidate).not.toContain(':8080');
      }
      expect(result.candidates.some(c => c.includes(':8081'))).toBe(true);
    });

    it('normalizes app-media://nas/ URLs into candidate endpoints', () => {
      const appMediaUrl = 'app-media://nas/files/make-order-files/invoices/inv_456.pdf';
      const result = validateAndNormalizeDownloadUrl(appMediaUrl);

      expect(result.isValid).toBe(true);
      expect(result.subPath).toBe('files/make-order-files/invoices/inv_456.pdf');
      expect(result.candidates.every(c => /^https?:\/\/(127\.0\.0\.1|localhost)(?::8081)?\//.test(c))).toBe(true);
    });
  });

  // ── 4. CANDIDATE FALLBACK ON FAILURE ─────────────────────────────────────
  describe('4. Candidate Fallback on Network or HTTP Error', () => {
    it('falls back to secondary candidate when primary candidate fails with ECONNREFUSED', async () => {
      const fakePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const attemptedUrls: string[] = [];

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        attemptedUrls.push(url);
        if (url.includes('127.0.0.1:8081')) {
          // Primary candidate fails with connection error
          return Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:8081'));
        }
        if (url.includes('localhost:8081')) {
          // Secondary candidate succeeds
          return Promise.resolve(new Response(fakePdfBuffer, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8080/files/make-order-files/invoices/inv_fallback.pdf',
        'inv_fallback.pdf',
        tempTestDir
      );

      expect(res.success).toBe(true);
      expect(res.path).toBeDefined();
      expect(fs.existsSync(res.path!)).toBe(true);
      expect(fs.readFileSync(res.path!).toString()).toContain('%PDF-1.4');

      // Verify fallback was attempted
      expect(attemptedUrls.some(u => u.includes(':8081'))).toBe(true);
      expect(attemptedUrls.some(u => u.includes('localhost:8081'))).toBe(true);
    });

    it('falls back to next candidate when candidate returns HTTP 502 Bad Gateway', async () => {
      const fakePdfBuffer = Buffer.from('%PDF-1.4 sample');
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('127.0.0.1:8081')) {
          return Promise.resolve(new Response(null, { status: 502, statusText: 'Bad Gateway' }));
        }
        if (url.includes('localhost:8081')) return Promise.resolve(new Response(fakePdfBuffer, { status: 200 }));
        return Promise.resolve(new Response(null, { status: 404 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'app-media://nas/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(true);
      expect(fs.existsSync(res.path!)).toBe(true);
    });
  });

  // ── 5. CLOUDFLARE ACCESS HEADERS ─────────────────────────────────────────
  describe('5. Cloudflare Tunnel Path & CF-Access Headers', () => {
    it('strictly identifies the approved Cloudflare tunnel URL via isApprovedCloudflareTunnelUrl', () => {
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me/files/doc.pdf')).toBe(true);
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me:443/files/doc.pdf')).toBe(true);

      // Rejects lookalike hostnames
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me.attacker.invalid/doc.pdf')).toBe(false);
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me.evil.com/doc.pdf')).toBe(false);
      expect(isApprovedCloudflareTunnelUrl('https://attacker-storage.lenas.me/doc.pdf')).toBe(false);

      // Rejects unapproved ports
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me:8443/doc.pdf')).toBe(false);
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me:8080/doc.pdf')).toBe(false);
      expect(isApprovedCloudflareTunnelUrl('https://storage.lenas.me:9999/doc.pdf')).toBe(false);

      // Rejects HTTP URLs
      expect(isApprovedCloudflareTunnelUrl('http://storage.lenas.me/doc.pdf')).toBe(false);
      expect(isApprovedCloudflareTunnelUrl('http://storage.lenas.me:80/doc.pdf')).toBe(false);
    });

    it('blocks production Cloudflare tunnel downloads in the isolated test environment', async () => {
      const mockFetch = vi.fn();
      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'https://storage.lenas.me/files/make-order-files/invoices/test.pdf',
        'test.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('not an approved NAS storage endpoint');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('never sends Cloudflare Access headers over unencrypted HTTP even if candidate is fetched', async () => {
      let capturedHttpHeaders: Record<string, string> = {};
      const fakePdfBuffer = Buffer.from('%PDF-1.4 test');

      const mockFetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.startsWith('http://')) {
          capturedHttpHeaders = opts?.headers || {};
          return Promise.resolve(new Response(fakePdfBuffer, { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 500 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(true);
      // Strictly verify no CF Access credentials are attached over unencrypted HTTP
      expect(capturedHttpHeaders['CF-Access-Client-Id']).toBeUndefined();
      expect(capturedHttpHeaders['CF-Access-Client-Secret']).toBeUndefined();
      expect(capturedHttpHeaders['cf-access-client-id']).toBeUndefined();
      expect(capturedHttpHeaders['cf-access-client-secret']).toBeUndefined();
    });

    it('blocks configured production tunnel downloads rather than contacting production from tests', async () => {
      const mockFetch = vi.fn();
      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'https://storage.lenas.me/files/make-order-files/invoices/test_legit.pdf',
        'test_legit.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('not an approved NAS storage endpoint');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── 6. REDIRECT POLICY & SECURITY ENFORCEMENT ────────────────────────────
  describe('6. Redirect Protection & Hardened Policies', () => {
    it('blocks redirect to unapproved external domains and fails safely', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('127.0.0.1:8081') || url.includes('localhost:8081')) {
          // Attempt malicious redirect to unapproved server
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'http://evil-attacker.com/malicious.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8080/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('non-isolated endpoint was blocked');

      // Confirm malicious domain was never fetched
      expect(mockFetch).not.toHaveBeenCalledWith('http://evil-attacker.com/malicious.pdf', expect.anything());
    });

    it('rejects redirect to lookalike hostname storage.lenas.me.attacker.invalid and fails safely', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(':8081')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'https://storage.lenas.me.attacker.invalid/files/malware.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('non-isolated endpoint was blocked');
      expect(mockFetch).not.toHaveBeenCalledWith('https://storage.lenas.me.attacker.invalid/files/malware.pdf', expect.anything());
    });

    it('rejects an HTTP redirect to storage.lenas.me and fails safely', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(':8081')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'http://storage.lenas.me/files/invoice.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/non-isolated endpoint was blocked/i);
      expect(mockFetch).not.toHaveBeenCalledWith('http://storage.lenas.me/files/invoice.pdf', expect.anything());
    });

    it('rejects HTTPS-to-HTTP downgrade redirects and fails safely', async () => {
      vi.stubEnv('NAS_TUNNEL_STORAGE_URL', 'https://localhost:8081');
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('https://localhost:8081/')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'http://localhost:8081/files/downgraded_target.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'https://localhost:8081/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('HTTPS-to-HTTP downgrade redirect is forbidden');
      expect(mockFetch).not.toHaveBeenCalledWith('http://localhost:8081/files/downgraded_target.pdf', expect.anything());

      // Direct validation function check
      expect(() => {
        validateAndNormalizeRedirect('http://localhost:8081/files/doc.pdf', 'https://localhost:8081/files/doc.pdf');
      }).toThrow(/HTTPS-to-HTTP downgrade redirect is forbidden/);
    });

    it('safely normalizes redirect to legacy port 8080 without requesting port 8080 directly', async () => {
      const fakePdfBuffer = Buffer.from('%PDF-1.4 normalized');
      const requestedUrls: string[] = [];

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        if (url === 'http://127.0.0.1:8081/files/legacy_redirect.pdf') {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1:8080/files/new_location.pdf' }
          }));
        }
        if (url === 'http://127.0.0.1:8081/files/new_location.pdf') {
          return Promise.resolve(new Response(fakePdfBuffer, { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/legacy_redirect.pdf',
        'legacy_redirect.pdf',
        tempTestDir
      );

      expect(res.success).toBe(true);
      expect(fs.existsSync(res.path!)).toBe(true);

      // Verify port 8080 was NEVER queried directly
      for (const reqUrl of requestedUrls) {
        expect(reqUrl).not.toContain(':8080');
      }
      expect(requestedUrls).toContain('http://127.0.0.1:8081/files/new_location.pdf');
    });

    it('rejects redirects to arbitrary ports on candidate hosts and fails safely', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes(':8081')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1:9999/files/malicious.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/doc.pdf',
        'doc.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Unapproved endpoint/i);
      expect(mockFetch).not.toHaveBeenCalledWith('http://127.0.0.1:9999/files/malicious.pdf', expect.anything());
    });

    it('prevents raw relative path traversal in Location header without requesting normalized target', async () => {
      const requestedUrls: string[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        if (url.includes(':8081')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: '../../secret.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/sub/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Path traversal is not permitted in redirect URL');
      // Ensure the normalized traversal target was NEVER fetched
      for (const req of requestedUrls) {
        expect(req).not.toContain('secret.pdf');
      }
    });

    it('prevents percent-encoded path traversal in Location header (%2e%2e%2f) without requesting normalized target', async () => {
      const requestedUrls: string[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        if (url.includes(':8081')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: '%2e%2e%2f%2e%2e%2fsecret.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/sub/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Path traversal is not permitted in redirect URL');
      for (const req of requestedUrls) {
        expect(req).not.toContain('secret.pdf');
      }
    });

    it('prevents encoded path traversal (/files/%2e%2e/) in Location header', async () => {
      const requestedUrls: string[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        requestedUrls.push(url);
        if (url.includes(':8081')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: '/files/%2e%2e/secret.pdf' }
          }));
        }
        return Promise.resolve(new Response(null, { status: 502 }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/invoice.pdf',
        'invoice.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Path traversal is not permitted in redirect URL');
      for (const req of requestedUrls) {
        expect(req).not.toContain('secret.pdf');
      }
    });

    it('rejects path traversal inside redirect URLs directly in validateAndNormalizeRedirect', () => {
      expect(() => {
        validateAndNormalizeRedirect('http://127.0.0.1:8081/files/../../secret.pdf', 'http://127.0.0.1:8081/files/doc.pdf');
      }).toThrow(/Path traversal is not permitted/);

      expect(() => {
        validateAndNormalizeRedirect('http://127.0.0.1:8081/files/%2e%2e%2fsecret.pdf', 'http://127.0.0.1:8081/files/doc.pdf');
      }).toThrow(/Path traversal is not permitted/);
    });
  });

  // ── 7. DOWNLOAD TIMEOUT DURING BODY STREAMING ─────────────────────────────
  describe('7. Active Download Timeout During Body Streaming', () => {
    it('aborts download and cleans up if response body stream stalls beyond timeout', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        // Return a response whose body stream stalls indefinitely
        const stalledResponse = {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/pdf' }),
          arrayBuffer: () => new Promise<ArrayBuffer>(() => {
            // Never resolves
          })
        } as unknown as Response;
        return Promise.resolve(stalledResponse);
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/stalled.pdf',
        'stalled.pdf',
        tempTestDir,
        150 // 150ms timeout for fast unit testing
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/timed out after 150ms/i);

      // Verify temp directory has no leftover or partial files
      const leftoverFiles = fs.readdirSync(tempTestDir);
      expect(leftoverFiles).toHaveLength(0);
    });

    it('readResponseBodyWithSignal rejects immediately if signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockResponse = {
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10))
      } as unknown as Response;

      await expect(
        readResponseBodyWithSignal(mockResponse, controller.signal, 100)
      ).rejects.toThrow(/timed out after 100ms/);
    });
  });

  // ── 8. ERROR CLEANUP & INCOMPLETE FILE REMOVAL ───────────────────────────
  describe('8. Partial File Cleanup on Failure', () => {
    it('cleans up temporary file if all candidates fail, leaving no residual files', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
      });

      const electron = await import('electron');
      (electron as any).net = { fetch: mockFetch };

      const res = await downloadPdfFromNas(
        'http://127.0.0.1:8081/files/nonexistent.pdf',
        'nonexistent.pdf',
        tempTestDir
      );

      expect(res.success).toBe(false);
      // Ensure temp directory has no leftover files
      const leftoverFiles = fs.readdirSync(tempTestDir);
      expect(leftoverFiles).toHaveLength(0);
    });
  });
});
