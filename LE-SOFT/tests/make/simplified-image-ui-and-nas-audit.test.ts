/**
 * Simplified Image UI & NAS Performance Audit — Test Suite
 * ────────────────────────────────────────────────────────────────────────────
 * Validates the 11-section update:
 *   1. Zero user-facing NAS/Tailscale/storage backend details in MAKE UI.
 *   2. Simplified Product Catalog image upload UI (Upload Image button + preview + remove, no URL input).
 *   3. Backend image storage functionality intact.
 *   4. Single authoritative DatabaseFailoverEngine routing system.
 *   5. Adaptive NAS performance & Tailscale-first prioritization.
 *   6. Read/write safety (no blind mutation replay on failover).
 *   7. Sanitized user-facing error messages.
 *   8. 12 Product image display/resolution scenarios.
 *   9. Bounded probe and request timeouts.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveImageSrc } from '../../src/utils/imageSrc';
import { getNasStorageCandidates } from '../../electron/supabase';
import { DatabaseFailoverEngine } from '../../electron/services/DatabaseFailoverEngine';

describe('Simplified Image UI & NAS Performance Audit', () => {

    describe('1 & 2. Product Catalog Image UI Simplification (MAKE UI)', () => {
        const makeProductCatalogPath = path.resolve(__dirname, '../../src/pages/Make/MakeProductCatalog.tsx');
        const productCreateModalPath = path.resolve(__dirname, '../../src/pages/Make/components/ProductCreateModal.tsx');
        const placeOrderPath = path.resolve(__dirname, '../../src/pages/Make/PlaceOrder.tsx');
        const trackOrdersPath = path.resolve(__dirname, '../../src/pages/Make/TrackOrders.tsx');
        const tutorialStepsPath = path.resolve(__dirname, '../../src/components/tutorial/tutorialSteps.ts');

        it('MakeProductCatalog.tsx: No "NAS" badge on selected product image', () => {
            const content = fs.readFileSync(makeProductCatalogPath, 'utf-8');
            expect(content).not.toMatch(/<span[^>]*>NAS<\/span>/i);
        });

        it('MakeProductCatalog.tsx: Spec sheet modal uses "Upload Image" and has no URL text input', () => {
            const content = fs.readFileSync(makeProductCatalogPath, 'utf-8');
            expect(content).toContain('DRAWING / SPEC IMAGE');
            expect(content).not.toContain('DRAWING / SPEC IMAGE (STORED ON NAS)');
            expect(content).not.toContain('placeholder="https://... or click Upload" value={editingSpec.image_url');
            expect(content).toContain('Upload Image');
            expect(content).not.toContain('Upload to NAS');
            expect(content).toContain('✓ Image uploaded');
            expect(content).not.toContain('✓ Stored on NAS Storage');
        });

        it('MakeProductCatalog.tsx: Color modal uses "Upload Image" and has no URL text input', () => {
            const content = fs.readFileSync(makeProductCatalogPath, 'utf-8');
            expect(content).toContain('TEXTURE / FINISH SAMPLE IMAGE');
            expect(content).not.toContain('TEXTURE / FINISH SAMPLE IMAGE (STORED ON NAS)');
            expect(content).not.toContain('placeholder="https://... or click Upload" value={editingColor.image_url');
            expect(content).toContain('Upload Image');
            expect(content).toContain('✓ Image uploaded');
        });

        it('MakeProductCatalog.tsx: Upload notification messages are sanitized (no NAS mentions)', () => {
            const content = fs.readFileSync(makeProductCatalogPath, 'utf-8');
            expect(content).toContain("'Image uploaded successfully!'");
            expect(content).not.toContain('stored on NAS');
            expect(content).not.toContain('Failed to upload image to NAS');
        });

        it('ProductCreateModal.tsx: Simplified UI with "PRODUCT IMAGE", "Upload Image", preview, remove button, no URL input', () => {
            const content = fs.readFileSync(productCreateModalPath, 'utf-8');
            expect(content).toContain('PRODUCT IMAGE');
            expect(content).not.toContain('PRODUCT MAIN IMAGE (STORED ON NAS)');
            expect(content).not.toContain('placeholder="https://... or click Upload"');
            expect(content).toContain('Upload Image');
            expect(content).not.toContain('Upload to NAS');
            expect(content).toContain('✓ Image uploaded');
            expect(content).not.toContain('✓ Live NAS Storage URL');
            expect(content).toContain("handleFieldChange('main_image', '')");
        });

        it('PlaceOrder.tsx: Header and submit button do not expose NAS database details', () => {
            const content = fs.readFileSync(placeOrderPath, 'utf-8');
            expect(content).not.toContain('Connected to NAS PostgreSQL Database');
            expect(content).not.toContain('Submitting Order to NAS Database...');
            expect(content).toContain('Submitting Order...');
        });

        it('TrackOrders.tsx: Loading state does not expose NAS database details', () => {
            const content = fs.readFileSync(trackOrdersPath, 'utf-8');
            expect(content).not.toContain('Loading orders from NAS database...');
            expect(content).toContain('Loading orders...');
        });

        it('tutorialSteps.ts: Tips and details do not mention NAS', () => {
            const content = fs.readFileSync(tutorialStepsPath, 'utf-8');
            expect(content).not.toContain('NAS database');
            expect(content).not.toContain('NAS storage');
        });
    });

    describe('3, 8 & 10. Product Image Resolution Scenarios', () => {
        it('Scenario 1: Null/undefined/empty image returns empty string for clean fallback rendering', () => {
            expect(resolveImageSrc(null)).toBe('');
            expect(resolveImageSrc(undefined)).toBe('');
            expect(resolveImageSrc('')).toBe('');
            expect(resolveImageSrc('   ')).toBe('');
        });

        it('Scenario 2: Cloudflare Tunnel storage URL routes to app-media://nas/', () => {
            const url = 'https://storage.lenas.me/files/product-images/executive-desk_1788937.webp';
            const resolved = resolveImageSrc(url);
            expect(resolved).toBe('app-media://nas/files/product-images/executive-desk_1788937.webp');
        });

        it('Scenario 3: Direct Tailscale storage URL routes to app-media://nas/', () => {
            const url = 'http://100.88.85.6:8081/files/product-images/chair_1789.webp';
            const resolved = resolveImageSrc(url);
            expect(resolved).toBe('app-media://nas/files/product-images/chair_1789.webp');
        });

        it('Scenario 4: Local LAN storage URL routes to app-media://nas/', () => {
            const url = 'http://192.168.1.14:8081/files/product-images/sofa_1789.webp';
            const resolved = resolveImageSrc(url);
            expect(resolved).toBe('app-media://nas/files/product-images/sofa_1789.webp');
        });

        it('Scenario 5: Relative storage path routes to app-media://nas/', () => {
            const path = '/files/product-images/table_1789.webp';
            const resolved = resolveImageSrc(path);
            expect(resolved).toBe('app-media://nas/files/product-images/table_1789.webp');
        });

        it('Scenario 6: Filename with spaces is encoded cleanly', () => {
            const url = 'https://storage.lenas.me/files/product-images/Living Room Sofa 2026.webp';
            const resolved = resolveImageSrc(url);
            expect(resolved).toBe('app-media://nas/files/product-images/Living%20Room%20Sofa%202026.webp');
        });

        it('Scenario 7: Filename with already percent-encoded spaces is preserved without double-encoding', () => {
            const url = 'https://storage.lenas.me/files/product-images/Living%20Room%20Sofa%202026.webp';
            const resolved = resolveImageSrc(url);
            expect(resolved).toBe('app-media://nas/files/product-images/Living%20Room%20Sofa%202026.webp');
        });

        it('Scenario 8: Data URLs pass through untouched', () => {
            const dataUrl = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
            expect(resolveImageSrc(dataUrl)).toBe(dataUrl);
        });

        it('Scenario 9: Blob URLs pass through untouched', () => {
            const blobUrl = 'blob:http://localhost:5173/0e4871e9-1111-2222-3333';
            expect(resolveImageSrc(blobUrl)).toBe(blobUrl);
        });

        it('Scenario 10: Standard external public HTTP/HTTPS URLs pass through untouched', () => {
            const externalUrl = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc';
            expect(resolveImageSrc(externalUrl)).toBe(externalUrl);
        });

        it('Scenario 11: Windows local drive paths normalize to app-media://local/', () => {
            const winPath = 'C:\\LE-SOFT\\photos\\sample.png';
            expect(resolveImageSrc(winPath)).toBe('app-media://local/C:/LE-SOFT/photos/sample.png');
        });

        it('Scenario 12: Existing app-media URLs are preserved without modification', () => {
            const appMediaUrl = 'app-media://nas/files/product-images/existing.webp';
            expect(resolveImageSrc(appMediaUrl)).toBe(appMediaUrl);
        });
    });

    describe('4, 5 & 6. NAS / Tailscale Smart Access & Performance Audit', () => {
        it('Single Authoritative Routing Engine: DatabaseFailoverEngine is a singleton', () => {
            const instance1 = DatabaseFailoverEngine.getInstance();
            const instance2 = DatabaseFailoverEngine.getInstance();
            expect(instance1).toBe(instance2);
        });

        it('Adaptive Storage Priority: Tailscale direct connection (port 8081) is candidate #1', () => {
            const candidates = getNasStorageCandidates();
            expect(candidates.length).toBeGreaterThanOrEqual(1);
            expect(candidates[0]).toContain(':8081');
        });

        it('Transport-level Write Safety: Low-level mutation replay is strictly prevented in electron/supabase.ts', () => {
            const supabaseSource = fs.readFileSync(path.resolve(__dirname, '../../electron/supabase.ts'), 'utf-8');
            expect(supabaseSource).toContain("const isRead = method === 'GET' || method === 'HEAD';");
            expect(supabaseSource).toContain('if (!isRead) {');
            expect(supabaseSource).toContain('Low-level replay rejected to protect database integrity');
        });

        it('Bounded NAS Fetch Timeout: PostgREST fetch timeout is set to 2000ms', () => {
            const supabaseSource = fs.readFileSync(path.resolve(__dirname, '../../electron/supabase.ts'), 'utf-8');
            expect(supabaseSource).toContain('setTimeout(() => controller.abort(), 2000)');
        });

        it('Bounded Connectivity Probe: Failover probe timeout is bounded to <= 1200ms', () => {
            const failoverSource = fs.readFileSync(path.resolve(__dirname, '../../electron/services/DatabaseFailoverEngine.ts'), 'utf-8');
            expect(failoverSource).toContain('timeout: 600');
            expect(failoverSource).toContain('timeout: 1000');
            expect(failoverSource).toContain('timeout: 1200');
        });
    });

    describe('7 & 10. Sanitized Error Messages & Clean Codebase Audit', () => {
        it('ipc-handlers.ts: Image upload errors do not expose internal storage provider names', () => {
            const ipcSource = fs.readFileSync(path.resolve(__dirname, '../../electron/ipc-handlers.ts'), 'utf-8');
            expect(ipcSource).not.toContain("'Failed to upload image to NAS'");
            expect(ipcSource).not.toContain("'Failed to upload image to Hostinger'");
            expect(ipcSource).toContain("'Failed to upload image'");
        });

        it('MAKE UI files: No user-facing occurrences of "NAS", "Tailscale", or "storage.lenas.me"', () => {
            const makeDir = path.resolve(__dirname, '../../src/pages/Make');
            const files = fs.readdirSync(makeDir, { recursive: true })
                .filter((f: any) => typeof f === 'string' && (f.endsWith('.tsx') || f.endsWith('.ts')))
                .map((f: any) => path.join(makeDir, f));

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf-8');
                expect(content).not.toMatch(/>[^<]*\bNAS\b[^<]*</);
                expect(content).not.toMatch(/>[^<]*\bTailscale\b[^<]*</);
                expect(content).not.toMatch(/>[^<]*storage\.lenas\.me[^<]*</);
            }
        });
    });

    describe('11. CSP & MediaProtocol Security Hardening', () => {
        it('MediaProtocolService.ts: bypassCSP is strictly false', () => {
            const mediaSource = fs.readFileSync(path.resolve(__dirname, '../../electron/services/media/MediaProtocolService.ts'), 'utf-8');
            expect(mediaSource).toContain('bypassCSP: false');
            expect(mediaSource).not.toContain('bypassCSP: true');
        });

        it('index.html: Explicitly enforces Content-Security-Policy with app-media: in img-src', () => {
            const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');
            expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
            expect(indexHtml).toContain("img-src 'self' data: blob: app-media:;");
            expect(indexHtml).not.toMatch(/img-src[^;]*\*/);
        });

        it('main.ts: webSecurity is strictly enabled and CSP onHeadersReceived interceptor is present', () => {
            const mainSource = fs.readFileSync(path.resolve(__dirname, '../../electron/main.ts'), 'utf-8');
            expect(mainSource).toContain('webSecurity: true');
            expect(mainSource).toContain('session.defaultSession.webRequest.onHeadersReceived');
            expect(mainSource).toContain("img-src 'self' data: blob: app-media:;");
        });
    });
});

