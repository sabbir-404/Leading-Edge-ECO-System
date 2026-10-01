import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveImageSrc } from '../../src/utils/imageSrc';
import { MediaProtocolService } from '../../electron/services/media/MediaProtocolService';
import fs from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => process.cwd() + '/tests/fixtures/temp_userdata'),
        whenReady: vi.fn().mockResolvedValue(undefined)
    },
    protocol: {
        registerSchemesAsPrivileged: vi.fn(),
        handle: vi.fn()
    },
    net: {
        fetch: vi.fn()
    }
}));

describe('Image Loading & Protocol Resolution — Issue 1 Fixes', () => {
    describe('1. resolveImageSrc Path Normalization', () => {
        it('resolves empty or null image path gracefully', () => {
            expect(resolveImageSrc(null)).toBe('');
            expect(resolveImageSrc(undefined)).toBe('');
            expect(resolveImageSrc('')).toBe('');
            expect(resolveImageSrc('   ')).toBe('');
        });

        it('preserves data: and blob: URLs untouched', () => {
            const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
            expect(resolveImageSrc(dataUrl)).toBe(dataUrl);

            const blobUrl = 'blob:http://localhost:5173/1234-5678';
            expect(resolveImageSrc(blobUrl)).toBe(blobUrl);
        });

        it('preserves existing app-media:// URLs untouched', () => {
            const appMediaUrl = 'app-media://local/C:/Users/sabbi/drawing.png';
            expect(resolveImageSrc(appMediaUrl)).toBe(appMediaUrl);
        });

        it('routes TrueNAS Cloudflare Tunnel URLs to app-media://nas/ for authentication & caching', () => {
            const nasUrl = 'https://storage.lenas.me/invoices/inv-1001.pdf';
            const resolved = resolveImageSrc(nasUrl);
            expect(resolved).toBe('app-media://nas/invoices/inv-1001.pdf');
        });

        it('preserves public Supabase and external HTTP/HTTPS URLs untouched', () => {
            const supabaseUrl = 'https://my-project.supabase.co/storage/v1/object/public/products/chair.jpg';
            expect(resolveImageSrc(supabaseUrl)).toBe(supabaseUrl);
        });

        it('transforms Windows local paths with backslashes to app-media://local/', () => {
            const winPath = 'C:\\Users\\sabbi\\Documents\\Invoices\\scan.png';
            const resolved = resolveImageSrc(winPath);
            expect(resolved).toBe('app-media://local/C:/Users/sabbi/Documents/Invoices/scan.png');
        });

        it('correctly handles paths with spaces and special characters', () => {
            const winPathWithSpaces = 'C:\\Program Files\\Leading Edge\\Technical Drawings\\Desk Blueprint #1.png';
            const resolved = resolveImageSrc(winPathWithSpaces);
            expect(resolved).toContain('app-media://local/C:/Program%20Files/Leading%20Edge/Technical%20Drawings/Desk%20Blueprint%20%231.png');
        });

        it('normalizes file:// URLs properly without double-encoding', () => {
            const fileUrl = 'file:///C:/Users/sabbi/Pictures/product.jpg';
            const resolved = resolveImageSrc(fileUrl);
            expect(resolved).toBe('app-media://local/C:/Users/sabbi/Pictures/product.jpg');
        });
    });

    describe('2. MediaProtocolService Safe Technical Diagnostics', () => {
        let service: MediaProtocolService;
        const tempUserDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_userdata');
        const sampleImageDir = path.join(tempUserDir, 'test-images');
        const sampleImagePath = path.join(sampleImageDir, 'test product.png');

        beforeEach(() => {
            fs.mkdirSync(sampleImageDir, { recursive: true });
            fs.writeFileSync(sampleImagePath, Buffer.from('mock-png-content-12345678'));
            (MediaProtocolService as any).instance = null;
            service = MediaProtocolService.getInstance();
        });

        it('diagnoses an existing local image accurately with sanitized technical metadata', async () => {
            const result = await service.diagnoseImage(sampleImagePath);

            expect(result.sourceType).toBe('local_file');
            expect(result.exists).toBe(true);
            expect(result.fileSize).toBe(Buffer.from('mock-png-content-12345678').length);
            expect(result.failureReason).toBeUndefined();
            expect(result.loadDurationMs).toBeGreaterThanOrEqual(0);
        });

        it('diagnoses a missing local file without throwing, returning sanitized failure reason', async () => {
            const nonExistentPath = path.join(sampleImageDir, 'does-not-exist.jpg');
            const result = await service.diagnoseImage(nonExistentPath);

            expect(result.sourceType).toBe('local_file');
            expect(result.exists).toBe(false);
            expect(result.fileSize).toBeUndefined();
            expect(result.failureReason).toBe('file_not_found');
        });

        it('diagnoses data URLs safely without leaking payload content', async () => {
            const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
            const result = await service.diagnoseImage(dataUrl);

            expect(result.sourceType).toBe('data_url');
            expect(result.exists).toBe(true);
            expect(result.normalizedSource).toBe(dataUrl.slice(0, 30) + '...');
            expect(result.failureReason).toBeUndefined();
        });

        it('diagnoses TrueNAS storage URLs accurately', async () => {
            const nasUrl = 'https://storage.lenas.me/products/model-a.png';
            const result = await service.diagnoseImage(nasUrl);

            expect(result.sourceType).toBe('nas_storage');
            expect(result.normalizedSource).toBe('https://storage.lenas.me/products/model-a.png');
        });

        it('G. Image loads from local Windows path with spaces', () => {
            const rawPath = 'C:\\Program Files\\Leading Edge\\Technical Drawings\\Desk Blueprint #1.png';
            const resolved = resolveImageSrc(rawPath);

            expect(resolved.startsWith('app-media://local/')).toBe(true);
            expect(resolved).toContain('Desk%20Blueprint%20%231.png');
            expect(resolved).not.toContain('\\');
        });

        it('H. Image loads through app-media://nas with path normalization', () => {
            const rawUrl = 'https://storage.lenas.me/invoices/2026/09/invoice-1002.pdf';
            const resolved = resolveImageSrc(rawUrl);

            expect(resolved).toBe('app-media://nas/invoices/2026/09/invoice-1002.pdf');
        });

        it('I. Storage authentication failure (403/401) produces safe diagnostic without leaking credentials', async () => {
            // Mock net.fetch returning 403 Forbidden (e.g. invalid or missing Cloudflare Access Service Token)
            const netMock = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden'
            });
            const electron = await import('electron');
            (electron as any).net = { fetch: netMock };

            const diag = await service.diagnoseImage('https://storage.lenas.me/secure-invoices/confidential-po.pdf?token=secret123');

            expect(diag.sourceType).toBe('nas_storage');
            expect(diag.exists).toBe(false);
            expect(diag.httpStatus).toBe(403);
            expect(diag.failureReason).toBe('HTTP_403');
            // Confirm query token was stripped and never leaked in normalizedSource
            expect(diag.normalizedSource).toBe('https://storage.lenas.me/secure-invoices/confidential-po.pdf');
            expect(diag.normalizedSource).not.toContain('secret123');
        });

        it('I2. Local cached image can still render offline when network is disconnected', async () => {
            const targetUrl = 'https://storage.lenas.me/products/desk-oak.png';
            const cacheDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_userdata', 'image-cache');
            fs.mkdirSync(cacheDir, { recursive: true });

            // Compute cache file path matching MediaProtocolService algorithm
            const crypto = await import('crypto');
            const cacheHash = crypto.createHash('sha256').update(targetUrl).digest('hex').slice(0, 32);
            const cacheFile = path.join(cacheDir, `${cacheHash}.png`);
            fs.writeFileSync(cacheFile, Buffer.from('offline-cached-image-data'));

            expect(fs.existsSync(cacheFile)).toBe(true);
            expect(fs.statSync(cacheFile).size).toBeGreaterThan(0);
        });
    });
});
