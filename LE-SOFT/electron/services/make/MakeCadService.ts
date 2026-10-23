/**
 * MakeCadService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Secure File Management & CAD/Drawing Upload Engine for MAKE V1.
 * 
 * Capabilities:
 *  - Native Electron file picker (dialog.showOpenDialog) — eliminates renderer filePath exposure.
 *  - Binary magic-byte validation (rejects executables, PE headers, script files).
 *  - Safe storage key generation and Cloudflare Tunnel / TrueNAS Storage uploads.
 *  - Enforces strict size limits: 50MB for CAD/PDF, 15MB for stage photos.
 */

import { BrowserWindow, dialog, app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { supabase, getCfAccessHeaders, getNasStorageAuthHeaders } from '../../supabase';
import { SupabaseQuotaManager } from '../quota/SupabaseQuotaManager';
import { DurableUploadService } from '../media/DurableUploadService';
import { isAllowedNonProductionEndpoint, isNonProductionEnvironment } from '../../runtime-environment';

export interface FileValidationResult {
    isValid: boolean;
    error?: string;
    mimeType: string;
    fileSize: number;
    fileBuffer: Buffer;
    sanitizedFileName: string;
}

export interface MakeUploadResult {
    success: boolean;
    status: 'synced_nas' | 'buffered_supabase' | 'staged_local' | 'awaiting_association' | 'failed';
    storagePath: string;
    publicUrl?: string;
    durableKey?: string;
    isPendingUpload: boolean;
    uploadId?: string;
    error?: string;
}

const ALLOWED_CAD_EXTENSIONS = new Set([
    'pdf', 'dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'skp', 'stl', 'obj',
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heic', 'heif',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf'
]);

const ALLOWED_PHOTO_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heic', 'heif'
]);

const ALLOWED_INVOICE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'webp', 'pdf', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heic', 'heif'
]);
// Reference uploads may be any ordinary document/archive/design file. Active
// content and executable formats remain blocked before they reach storage.
const BLOCKED_REFERENCE_EXTENSIONS = new Set([
    'exe', 'dll', 'com', 'scr', 'msi', 'msp', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'cjs', 'mjs', 'jar', 'sh', 'bash', 'php', 'phtml', 'html', 'htm', 'svg', 'hta', 'lnk', 'reg'
]);
const isAllowedReferenceExtension = (extension: string) => !!extension && !BLOCKED_REFERENCE_EXTENSIONS.has(extension.toLowerCase());

const MAX_CAD_FILE_SIZE = 50 * 1024 * 1024;    // 50 MB
const MAX_PHOTO_FILE_SIZE = 15 * 1024 * 1024;  // 15 MB
const MAX_INVOICE_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export class MakeCadService {
    /** Permanently stamps product-drawing PDFs with a subtle Leading Edge mark. */
    public static async watermarkProductDrawingPdf(fileBuffer: Buffer, fileName: string): Promise<Buffer> {
        if (path.extname(fileName).toLowerCase() !== '.pdf') return fileBuffer;
        try {
            const pdf = await PDFDocument.load(fileBuffer, { updateMetadata: true });
            const font = await pdf.embedFont(StandardFonts.HelveticaBold);
            for (const page of pdf.getPages()) {
                const { width, height } = page.getSize();
                const size = Math.max(22, Math.min(46, width / 13));
                const label = 'LEADING EDGE';
                const textWidth = font.widthOfTextAtSize(label, size);
                page.drawText(label, {
                    x: Math.max(16, (width - textWidth) / 2),
                    y: Math.max(16, height / 2),
                    size,
                    font,
                    color: rgb(0.72, 0.75, 0.78),
                    opacity: 0.16,
                    rotate: degrees(32)
                });
            }
            return Buffer.from(await pdf.save());
        } catch (error: any) {
            throw new Error(`Could not watermark this PDF product drawing: ${error?.message || 'invalid or protected PDF'}`);
        }
    }

    /**
     * Resolves the TrueNAS Storage URL from config or default tunnel
     */
    private static getNasStorageUrl(): string | null {
        try {
            const configPath = path.join(app?.getPath ? app.getPath('userData') : process.cwd(), 'supabase-config.json');
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                const configured = cfg.storageUrl || cfg.nasStorageUrl;
                if (configured && (!isNonProductionEnvironment() || isAllowedNonProductionEndpoint(configured))) return configured;
            }
        } catch { }
        if (process.env.NAS_STORAGE_URL && (!isNonProductionEnvironment() || isAllowedNonProductionEndpoint(process.env.NAS_STORAGE_URL))) return process.env.NAS_STORAGE_URL;
        return isNonProductionEnvironment() ? 'http://127.0.0.1:8081' : 'http://100.88.85.6:8081';
    }

    /**
     * Resolves Cloudflare Access Service Token Headers
     */
    private static getCfAccessHeaders(): Record<string, string> {
        return getCfAccessHeaders();
    }

    /**
     * Inspects the buffer for binary header signatures (magic bytes)
     */
    public static validateBufferMagicBytes(buffer: Buffer, extension: string): { isValid: boolean; detectedMime: string; error?: string } {
        // Block Windows PE / DOS Executables (MZ header: 0x4D, 0x5A)
        if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
            return { isValid: false, detectedMime: 'application/x-dosexec', error: 'Executable binaries (.exe, .dll) are strictly forbidden.' };
        }

        // Block Unix Executables (ELF header: 0x7F, 0x45, 0x4C, 0x46)
        if (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
            return { isValid: false, detectedMime: 'application/x-executable', error: 'Executable binaries are strictly forbidden.' };
        }

        // Block script / HTML / SVG content masked as images or documents
        const headerStr = buffer.toString('utf8', 0, Math.min(buffer.length, 512)).toLowerCase();
        if (headerStr.includes('<script') || headerStr.includes('javascript:') || headerStr.startsWith('#!/') || headerStr.includes('<iframe') || headerStr.includes('<svg') || headerStr.includes('<?php')) {
            return { isValid: false, detectedMime: 'text/plain', error: 'Executable scripts and active HTML content are strictly forbidden.' };
        }

        const ext = extension.toLowerCase();

        // PDF (%PDF- / 0x25, 0x50, 0x44, 0x46, 0x2D)
        if (ext === 'pdf') {
            const isPdf = buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D;
            if (!isPdf) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Invalid PDF file structure. File content does not match PDF specification.' };
            }
            return { isValid: true, detectedMime: 'application/pdf' };
        }

        // PNG (0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        if (ext === 'png') {
            const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
            if (!isPng) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Corrupted or invalid PNG image file.' };
            }
            return { isValid: true, detectedMime: 'image/png' };
        }

        // JPEG (0xFF, 0xD8, 0xFF)
        if (ext === 'jpg' || ext === 'jpeg') {
            const isJpg = buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
            if (!isJpg) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Corrupted or invalid JPEG image file.' };
            }
            return { isValid: true, detectedMime: 'image/jpeg' };
        }

        // WEBP (RIFF....WEBP)
        if (ext === 'webp') {
            const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
            if (!isWebp) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Corrupted or invalid WebP image file.' };
            }
            return { isValid: true, detectedMime: 'image/webp' };
        }

        // GIF (GIF87a or GIF89a: 0x47, 0x49, 0x46, 0x38)
        if (ext === 'gif') {
            const isGif = buffer.length >= 6 && buffer.toString('ascii', 0, 4) === 'GIF8';
            if (!isGif) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Corrupted or invalid GIF image file.' };
            }
            return { isValid: true, detectedMime: 'image/gif' };
        }

        // BMP (0x42, 0x4D / BM)
        if (ext === 'bmp') {
            const isBmp = buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4D;
            if (!isBmp) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Corrupted or invalid BMP image file.' };
            }
            return { isValid: true, detectedMime: 'image/bmp' };
        }

        // TIFF (II*. / 0x49, 0x49, 0x2A, 0x00 or MM.* / 0x4D, 0x4D, 0x00, 0x2A)
        if (ext === 'tiff' || ext === 'tif') {
            const isTiffLE = buffer.length >= 4 && buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00;
            const isTiffBE = buffer.length >= 4 && buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A;
            if (!isTiffLE && !isTiffBE) {
                return { isValid: false, detectedMime: 'application/octet-stream', error: 'Corrupted or invalid TIFF image file.' };
            }
            return { isValid: true, detectedMime: 'image/tiff' };
        }

        // AVIF / HEIC / HEIF (ftyp at offset 4 with compatible brand)
        if (ext === 'avif' || ext === 'heic' || ext === 'heif') {
            const hasFtyp = buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
            if (hasFtyp) {
                const brand = buffer.toString('ascii', 8, 12).toLowerCase();
                if (brand.includes('avif') || brand.includes('avis')) {
                    return { isValid: true, detectedMime: 'image/avif' };
                }
                return { isValid: true, detectedMime: 'image/heic' };
            }
            // Allow general fallback for container formats
            return { isValid: true, detectedMime: ext === 'avif' ? 'image/avif' : 'image/heic' };
        }

        // DWG (AC10 / 0x41, 0x43, 0x31, 0x30)
        if (ext === 'dwg') {
            const isDwg = buffer.length >= 4 && buffer[0] === 0x41 && buffer[1] === 0x43 && buffer[2] === 0x31 && buffer[3] === 0x30;
            return { isValid: true, detectedMime: isDwg ? 'application/acad' : 'application/octet-stream' };
        }

        // DXF, STEP, IGES are ASCII/text-based 3D CAD formats
        if (ext === 'dxf') return { isValid: true, detectedMime: 'application/dxf' };
        if (ext === 'step' || ext === 'stp') return { isValid: true, detectedMime: 'application/step' };
        if (ext === 'iges' || ext === 'igs') return { isValid: true, detectedMime: 'model/iges' };
        if (ext === 'stl') return { isValid: true, detectedMime: 'model/stl' };
        if (ext === 'obj') return { isValid: true, detectedMime: 'model/obj' };
        if (ext === 'skp') return { isValid: true, detectedMime: 'application/octet-stream' };

        // Common reference documents. Validate container signatures before accepting.
        if (['doc', 'xls', 'ppt'].includes(ext)) {
            const isOle = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]));
            return { isValid: isOle, detectedMime: 'application/x-ole-storage', error: isOle ? undefined : 'Invalid Office document structure.' };
        }
        if (['docx', 'xlsx', 'pptx'].includes(ext)) {
            const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && [0x03, 0x05, 0x07].includes(buffer[2]);
            const mime = ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            return { isValid: isZip, detectedMime: mime, error: isZip ? undefined : 'Invalid Office document structure.' };
        }
        if (ext === 'rtf') {
            const isRtf = buffer.toString('utf8', 0, Math.min(buffer.length, 16)).trimStart().startsWith('{\\rtf');
            return { isValid: isRtf, detectedMime: 'application/rtf', error: isRtf ? undefined : 'Invalid RTF document structure.' };
        }
        if (['txt', 'csv'].includes(ext)) {
            const isText = !buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
            return { isValid: isText, detectedMime: ext === 'csv' ? 'text/csv' : 'text/plain', error: isText ? undefined : 'The selected text document contains binary data.' };
        }

        return { isValid: true, detectedMime: 'application/octet-stream' };
    }

    /**
     * Native Electron File Picker: Opens dialog directly in Main Process.
     * Guarantees that the file path comes exclusively from an authorized user OS selection.
     */
    public static async pickAndValidateFile(
        type: 'cad' | 'photo' | 'invoice_attachment',
        targetWindow?: BrowserWindow | null
    ): Promise<FileValidationResult | { canceled: true; error?: string }> {
        const win = targetWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (!win) {
            return { canceled: true, error: 'No active window found' };
        }

        const commonImgExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'avif', 'heic', 'heif'];
        const referenceDocExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf'];
        const cadExts = ['pdf', 'dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'skp', 'stl', 'obj', ...commonImgExts, ...referenceDocExts];

        const filters = type === 'invoice_attachment'
            ? [
                { name: 'Invoices & Documents', extensions: ['pdf', ...commonImgExts] },
                { name: 'PDF Documents', extensions: ['pdf'] },
                { name: 'Images', extensions: commonImgExts }
              ]
            : (type === 'photo'
                ? [{ name: 'Images', extensions: commonImgExts }]
                : [
                    { name: 'Drawings & CAD Files', extensions: cadExts },
                    { name: 'All Supported Files', extensions: ['*'] }
                  ]);

        const title = type === 'invoice_attachment'
            ? 'Select Invoice Attachment / Document'
            : (type === 'photo' ? 'Select Stage Completion Photo' : 'Select Technical Drawing / CAD Blueprint');

        const result = await dialog.showOpenDialog(win, {
            title,
            properties: ['openFile'],
            filters
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { canceled: true };
        }

        const selectedPath = result.filePaths[0];
        return this.validateLocalFile(selectedPath, type);
    }

    /**
     * Validates file metadata without requiring physical disk presence.
     */
    public static validateFileMetadata(
        fileName: string,
        fileSize: number,
        type: 'cad' | 'photo' | 'invoice_attachment'
    ): { isValid: boolean; error?: string } {
        const ext = path.extname(fileName).replace('.', '').toLowerCase();
        const allowed = type === 'photo' ? ALLOWED_PHOTO_EXTENSIONS.has(ext)
            : type === 'invoice_attachment' ? ALLOWED_INVOICE_EXTENSIONS.has(ext)
            : isAllowedReferenceExtension(ext);

        if (!allowed) {
            return { isValid: false, error: `File type ".${ext}" is not supported for a safe reference attachment.` };
        }

        const maxSize = (type === 'photo' || type === 'invoice_attachment') ? MAX_INVOICE_FILE_SIZE : MAX_CAD_FILE_SIZE;
        if (fileSize > maxSize) {
            const maxMb = maxSize / (1024 * 1024);
            return { isValid: false, error: `File size exceeds maximum allowed limit of ${maxMb} MB.` };
        }

        return { isValid: true };
    }

    /**
     * Sanitizes a base filename preserving Unicode characters and spaces while stripping illegal filesystem chars.
     */
    public static sanitizeFileName(rawFileName: string): string {
        const extWithDot = path.extname(rawFileName).toLowerCase();
        const baseWithoutExt = path.basename(rawFileName, extWithDot);
        // Strip illegal filename characters (/ \ ? * : | " < > and control chars)
        // eslint-disable-next-line no-control-regex
        const cleaned = baseWithoutExt.replace(/[\/\\:*?"<>|\x00-\x1F\x7F]/g, '_').trim() || 'attachment';
        return `${cleaned}${extWithDot}`;
    }

    /**
     * Validates an approved local file by reading its buffer and checking limits.
     */
    public static validateLocalFile(filePath: string, type: 'cad' | 'photo' | 'invoice_attachment'): FileValidationResult | { canceled: true; error?: string } {
        if (!fs.existsSync(filePath)) {
            return { canceled: true, error: 'Selected file does not exist on disk.' };
        }

        const stats = fs.statSync(filePath);
        const maxSize = (type === 'photo' || type === 'invoice_attachment') ? MAX_INVOICE_FILE_SIZE : MAX_CAD_FILE_SIZE;

        if (stats.size > maxSize) {
            const maxMb = maxSize / (1024 * 1024);
            return { canceled: true, error: `File size (${(stats.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of ${maxMb} MB.` };
        }

        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        const allowed = type === 'photo' ? ALLOWED_PHOTO_EXTENSIONS.has(ext)
            : type === 'invoice_attachment' ? ALLOWED_INVOICE_EXTENSIONS.has(ext)
            : isAllowedReferenceExtension(ext);
        if (!allowed) {
            return { canceled: true, error: `File extension ".${ext}" is not supported.` };
        }

        const buffer = fs.readFileSync(filePath);
        const magicCheck = this.validateBufferMagicBytes(buffer, ext);

        if (!magicCheck.isValid) {
            return { canceled: true, error: magicCheck.error || 'File failed security validation.' };
        }

        const sanitizedBase = this.sanitizeFileName(path.basename(filePath));

        return {
            isValid: true,
            mimeType: magicCheck.detectedMime,
            fileSize: stats.size,
            fileBuffer: buffer,
            sanitizedFileName: sanitizedBase
        };
    }

    /**
     * Validates an in-memory buffer (such as from browser camera or mobile upload)
     * enforcing size, extension, magic byte validation, and absence of PE/ELF executables.
     */
    public static validateBuffer(
        buffer: Buffer,
        fileName: string,
        type: 'cad' | 'photo' | 'invoice_attachment'
    ): FileValidationResult | { isValid: false; error: string } {
        const maxSize = (type === 'photo' || type === 'invoice_attachment') ? MAX_INVOICE_FILE_SIZE : MAX_CAD_FILE_SIZE;
        if (buffer.length > maxSize) {
            const maxMb = maxSize / (1024 * 1024);
            return { isValid: false, error: `File size (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of ${maxMb} MB.` };
        }

        const ext = path.extname(fileName).replace('.', '').toLowerCase();
        const allowed = type === 'photo' ? ALLOWED_PHOTO_EXTENSIONS.has(ext)
            : type === 'invoice_attachment' ? ALLOWED_INVOICE_EXTENSIONS.has(ext)
            : isAllowedReferenceExtension(ext);
        if (!allowed) {
            return { isValid: false, error: `File extension ".${ext}" is not supported.` };
        }

        const magicCheck = this.validateBufferMagicBytes(buffer, ext);
        if (!magicCheck.isValid) {
            return { isValid: false, error: magicCheck.error || 'File failed security validation.' };
        }

        const sanitizedBase = this.sanitizeFileName(fileName);
        return {
            isValid: true,
            mimeType: magicCheck.detectedMime,
            fileSize: buffer.length,
            fileBuffer: buffer,
            sanitizedFileName: sanitizedBase
        };
    }

    /**
     * Uploads a validated file buffer using DurableUploadService with TrueNAS primary
     * and quota-managed Supabase Storage fallback, or direct pipeline if durable queue is unavailable.
     */
    public static async uploadValidatedBuffer(
        buffer: Buffer,
        fileName: string,
        mimeType: string,
        subfolder: string,
        meta?: { entityType?: string; entityId?: string | number; fieldName?: string }
    ): Promise<MakeUploadResult> {
        // 1. Resilient staging & durable dispatch
        try {
            const durableUpload = DurableUploadService.getInstance();
            const staged = await durableUpload.stageFile(
                buffer,
                fileName,
                mimeType,
                subfolder,
                meta,
                { autoDispatch: false }
            );
            const result = await durableUpload.dispatchUpload(staged.id);
            const durableKey = `${subfolder}/${staged.id}_${staged.fileName}`;

            if (result.status === 'synced_nas') {
                const confirmedUrl = result.activeUrl || result.url;
                return {
                    success: true,
                    status: 'synced_nas',
                    storagePath: durableKey,
                    publicUrl: confirmedUrl,
                    durableKey: confirmedUrl || durableKey,
                    isPendingUpload: false,
                    uploadId: staged.id
                };
            }

            if (result.status === 'buffered_supabase') {
                return {
                    success: true,
                    status: 'buffered_supabase',
                    storagePath: durableKey,
                    publicUrl: result.activeUrl,
                    durableKey: result.durableKey || durableKey,
                    isPendingUpload: true,
                    uploadId: staged.id
                };
            }

            if (result.status === 'staged_local' || result.status === 'awaiting_association') {
                // Truthful contract: durably accepted and staged; NEVER guessed remote URLs, NEVER file://
                return {
                    success: !result.error,
                    status: result.status,
                    storagePath: staged.localPath,
                    publicUrl: undefined,
                    durableKey: durableKey,
                    isPendingUpload: true,
                    uploadId: staged.id,
                    error: result.error
                };
            }

            return {
                success: false,
                status: 'failed',
                storagePath: '',
                isPendingUpload: false,
                uploadId: staged.id,
                error: result.error || 'Failed to dispatch durable upload'
            };
        } catch (durableErr: any) {
            console.warn('[MakeCadService] DurableUploadService exception, falling back to direct pipeline:', durableErr.message);
        }

        // 2. Direct pipeline fallback (for test environments without SQLite or direct mode)
        const timestamp = Date.now();
        const randomToken = crypto.randomBytes(4).toString('hex');
        const sanitized = this.sanitizeFileName(fileName);
        const storageFileName = `${timestamp}_${randomToken}_${sanitized}`;
        const storagePath = `${subfolder}/${storageFileName}`;
        const nasStorageUrl = this.getNasStorageUrl();

        if (nasStorageUrl) {
            const timeoutMs = Math.max(30000, Math.min(300000, Math.ceil(buffer.length / 200000) * 1000 + 30000));
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const formData = new FormData();
                formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), storageFileName);

                const cfHeaders = nasStorageUrl.startsWith('https://') ? this.getCfAccessHeaders() : {};
                const response = await fetch(`${nasStorageUrl.replace(/\/$/, '')}/upload`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'x-subfolder': subfolder,
                        ...getNasStorageAuthHeaders(),
                        ...cfHeaders
                    },
                    signal: controller.signal
                });

                if (response.ok || (response as any).status === undefined) {
                    const data = await response.json();
                    if (data && data.success && (data.file_url || data.url)) {
                        const rawUrl = encodeURI(data.file_url || data.url);
                        return {
                            success: true,
                            status: 'synced_nas',
                            storagePath: storagePath,
                            publicUrl: rawUrl,
                            durableKey: rawUrl,
                            isPendingUpload: false
                        };
                    }
                }
            } catch (nasErr: any) {
                console.warn('[MakeCadService] NAS upload failed, attempting Supabase fallback:', nasErr.message);
            } finally {
                clearTimeout(timeoutId);
            }
        }

        // Supabase Storage Fallback (strictly gated and tracked by Quota Manager)
        const quotaMgr = SupabaseQuotaManager.getInstance();
        if (!quotaMgr.canAcceptStorageUpload(buffer.length)) {
            return {
                success: false,
                status: 'failed',
                storagePath: '',
                isPendingUpload: false,
                error: 'Supabase Storage quota limit reached (2.2 GB / 3 GB ceiling).'
            };
        }

        const canBuffer = await quotaMgr.reserveStorageQuota(storageFileName, buffer.length);
        if (!canBuffer) {
            return {
                success: false,
                status: 'failed',
                storagePath: '',
                isPendingUpload: false,
                error: 'Supabase Storage quota reservation rejected.'
            };
        }

        const { error: sbErr } = await supabase.storage
            .from('make-order-files')
            .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

        if (sbErr) {
            await quotaMgr.releaseStorageQuota(storageFileName, 0, 'released');
            return {
                success: false,
                status: 'failed',
                storagePath: '',
                isPendingUpload: false,
                error: sbErr.message
            };
        }

        await quotaMgr.releaseStorageQuota(storageFileName, buffer.length, 'committed');
        // Do not call getPublicUrl on private bucket! Resolve authorized signed URL on demand
        let signedUrl: string | undefined = undefined;
        try {
            const storageBucket = supabase.storage.from('make-order-files');
            if (typeof storageBucket.createSignedUrl === 'function') {
                const { data: signedData } = await storageBucket.createSignedUrl(storagePath, 3600);
                signedUrl = signedData?.signedUrl;
            }
        } catch {}

        return {
            success: true,
            status: 'buffered_supabase',
            storagePath: storagePath,
            durableKey: storagePath,
            publicUrl: signedUrl,
            isPendingUpload: true
        };
    }
}
