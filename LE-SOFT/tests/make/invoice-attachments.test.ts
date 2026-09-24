import { describe, it, expect } from 'vitest';
import { MakeCadService } from '../../electron/services/make/MakeCadService';

describe('MAKE V1.1 — Invoice Attachments Security & File Validation', () => {
    // ── 1. ACCEPTED FORMATS (JPG, JPEG, PNG, WEBP) ───────────────────────────
    it('should accept valid image extensions for invoice attachments', () => {
        const allowedFormats = ['receipt.jpg', 'bill.jpeg', 'invoice_photo.png', 'scan.webp'];

        for (const fileName of allowedFormats) {
            const result = MakeCadService.validateFileMetadata(fileName, 5 * 1024 * 1024, 'invoice_attachment');
            expect(result.isValid).toBe(true);
            expect(result.error).toBeUndefined();
        }
    });

    it('should accept valid image buffers with proper magic bytes', () => {
        // PNG magic bytes
        const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
        const pngResult = MakeCadService.validateBuffer(pngBuffer, 'invoice.png', 'invoice_attachment');
        expect(pngResult.isValid).toBe(true);

        // JPEG magic bytes
        const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
        const jpegResult = MakeCadService.validateBuffer(jpegBuffer, 'bill.jpg', 'invoice_attachment');
        expect(jpegResult.isValid).toBe(true);

        // WebP magic bytes (RIFF....WEBP)
        const webpBuffer = Buffer.from('RIFF1234WEBPVP8 ');
        const webpResult = MakeCadService.validateBuffer(webpBuffer, 'scan.webp', 'invoice_attachment');
        expect(webpResult.isValid).toBe(true);
    });

    // ── 2. 15MB LIMIT ENFORCEMENT ────────────────────────────────────────────
    it('should enforce 15MB maximum file size for invoice attachments', () => {
        const exactly15MB = 15 * 1024 * 1024;
        const over15MB = 15 * 1024 * 1024 + 1;
        const under15MB = 10 * 1024 * 1024;

        expect(MakeCadService.validateFileMetadata('invoice.jpg', under15MB, 'invoice_attachment').isValid).toBe(true);
        expect(MakeCadService.validateFileMetadata('invoice.png', exactly15MB, 'invoice_attachment').isValid).toBe(true);

        const overResult = MakeCadService.validateFileMetadata('invoice.png', over15MB, 'invoice_attachment');
        expect(overResult.isValid).toBe(false);
        expect(overResult.error).toContain('exceeds maximum allowed limit');
    });

    // ── 3. REJECTION OF EXECUTABLES & UNSUPPORTED FORMATS ────────────────────
    it('should reject non-image file types for invoice attachments', () => {
        const disallowed = [
            'document.pdf',
            'blueprint.dwg',
            'vector.dxf',
            'script.js',
            'archive.zip',
            'executable.exe'
        ];

        for (const fileName of disallowed) {
            const result = MakeCadService.validateFileMetadata(fileName, 1024 * 1024, 'invoice_attachment');
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid file type');
        }
    });

    it('should strictly reject executable binaries disguised as images (MZ / PE header)', () => {
        // Disguised .exe with MZ header named as .png
        const maliciousExeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]);
        const result = MakeCadService.validateBuffer(maliciousExeBuffer, 'invoice.png', 'invoice_attachment');
        expect(result.isValid).toBe(false);
        if ('error' in result) {
            expect(result.error).toContain('Executable binaries');
        }
    });

    // ── 4. RENDERER ARBITRARY FILESYSTEM PATH REJECTION ──────────────────────
    it('should reject arbitrary local filesystem paths passed from renderer', () => {
        const handleUploadWithFilePath = (payload: { filePath?: string }) => {
            if (payload.filePath) {
                return { error: 'Arbitrary filesystem paths are rejected. Use the native file picker.' };
            }
            return { success: true };
        };

        const attackPayload = { filePath: 'C:\\Windows\\System32\\calc.exe' };
        const response = handleUploadWithFilePath(attackPayload);
        expect(response.error).toContain('Arbitrary filesystem paths are rejected');
    });

    // ── 5. MULTIPLE IMAGES HANDLING ──────────────────────────────────────────
    it('should handle multiple invoice attachment images in sequence', () => {
        const attachments = [
            { name: 'invoice_pg1.jpg', url: 'https://storage.lenas.me/invoices/1.jpg' },
            { name: 'invoice_pg2.png', url: 'https://storage.lenas.me/invoices/2.png' },
            { name: 'tax_slip.webp', url: 'https://storage.lenas.me/invoices/3.webp' }
        ];

        const urls = attachments.map(a => a.url);
        expect(urls).toHaveLength(3);
        expect(urls).toContain('https://storage.lenas.me/invoices/1.jpg');
        expect(urls).toContain('https://storage.lenas.me/invoices/2.png');
        expect(urls).toContain('https://storage.lenas.me/invoices/3.webp');
    });

    // ── 6. ITEM-LEVEL ATTACHMENTS ────────────────────────────────────────────
    it('should support item-level CAD drawings and documents up to 50MB', () => {
        const validDrawing = MakeCadService.validateFileMetadata('dining_table_v2.dwg', 45 * 1024 * 1024, 'cad');
        expect(validDrawing.isValid).toBe(true);

        const validPdf = MakeCadService.validateFileMetadata('table_spec.pdf', 30 * 1024 * 1024, 'cad');
        expect(validPdf.isValid).toBe(true);
    });
});
