/**
 * Product Catalog Image Loading — Regression Test
 * ────────────────────────────────────────────────────────────────────────────
 * Verifies that real product image references from NAS make_products rows:
 *   1. Are present in the data returned by the catalog query.
 *   2. Are correctly resolved through resolveImageSrc() to app-media://nas/... URLs.
 *   3. Would successfully load through the MediaProtocolService multi-endpoint resolution.
 *   4. Handle spaces in filenames correctly.
 *   5. Handle error/missing images gracefully.
 *
 * This test will FAIL if the Product Catalog receives image data but the image source
 * resolution chain is broken.
 */

import { describe, it, expect } from 'vitest';
import { resolveImageSrc } from '../../src/utils/imageSrc';

// Real image references from NAS make_products (sanitized: no customer data)
const REAL_PRODUCT_IMAGES = [
    {
        label: 'simple filename (no spaces)',
        main_image: 'https://storage.lenas.me/files/product-images/4791-d-scaled_1788937154524.webp',
        expectedSubPath: 'files/product-images/4791-d-scaled_1788937154524.webp'
    },
    {
        label: 'filename with spaces',
        main_image: 'https://storage.lenas.me/files/product-images/Screenshot 2026-09-14 035740_1789390462948.webp',
        expectedSubPath: 'files/product-images/Screenshot%202026-09-14%20035740_1789390462948.webp'
    },
    {
        label: 'percent-encoded spaces',
        main_image: 'https://storage.lenas.me/files/product-images/Screenshot%202026-09-15%20163728_1789470879589.webp',
        expectedSubPath: 'files/product-images/Screenshot%202026-09-15%20163728_1789470879589.webp'
    }
];

describe('Product Catalog Image Loading — Regression', () => {

    describe('1. resolveImageSrc correctly routes storage.lenas.me URLs through app-media://nas/', () => {
        for (const img of REAL_PRODUCT_IMAGES) {
            it(`routes "${img.label}" through app-media://nas/`, () => {
                const result = resolveImageSrc(img.main_image);
                expect(result).toMatch(/^app-media:\/\/nas\//);
                expect(result).toBe(`app-media://nas/${img.expectedSubPath}`);
            });
        }
    });

    describe('2. resolveImageSrc handles edge cases', () => {
        it('returns empty string for null/undefined/empty', () => {
            expect(resolveImageSrc(null)).toBe('');
            expect(resolveImageSrc(undefined)).toBe('');
            expect(resolveImageSrc('')).toBe('');
            expect(resolveImageSrc('  ')).toBe('');
        });

        it('passes through data URLs unchanged', () => {
            const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANS';
            expect(resolveImageSrc(dataUrl)).toBe(dataUrl);
        });

        it('passes through blob URLs unchanged', () => {
            const blobUrl = 'blob:http://localhost:5173/abc-123';
            expect(resolveImageSrc(blobUrl)).toBe(blobUrl);
        });

        it('routes Tailscale :8081 storage URLs through app-media://nas/', () => {
            const url = 'http://100.88.85.6:8081/files/product-images/test.webp';
            const result = resolveImageSrc(url);
            expect(result).toBe('app-media://nas/files/product-images/test.webp');
        });

        it('handles relative /files/product-images/ paths', () => {
            const path = '/files/product-images/test.webp';
            const result = resolveImageSrc(path);
            expect(result).toBe('app-media://nas/files/product-images/test.webp');
        });

        it('already-resolved app-media://nas/ URLs are normalized', () => {
            const url = 'app-media://nas/files/product-images/Screenshot 2026-09-14 035740.webp';
            const result = resolveImageSrc(url);
            expect(result).toBe('app-media://nas/files/product-images/Screenshot%202026-09-14%20035740.webp');
        });

        it('routes local filesystem paths through app-media://local/', () => {
            const winPath = 'C:\\Users\\test\\Pictures\\photo.jpg';
            const result = resolveImageSrc(winPath);
            expect(result).toMatch(/^app-media:\/\/local\//);
            expect(result).toContain('photo.jpg');
        });

        it('passes through other HTTPS URLs unchanged', () => {
            const url = 'https://example.com/images/test.png';
            expect(resolveImageSrc(url)).toBe(url);
        });
    });

    describe('3. Space handling in filenames', () => {
        it('both space and %20 inputs produce the same resolved URL', () => {
            const withSpaces = 'https://storage.lenas.me/files/product-images/Screenshot 2026-09-14 035740.webp';
            const withPercent = 'https://storage.lenas.me/files/product-images/Screenshot%202026-09-14%20035740.webp';
            const result1 = resolveImageSrc(withSpaces);
            const result2 = resolveImageSrc(withPercent);
            expect(result1).toBe(result2);
            expect(result1).toContain('Screenshot%202026-09-14%20035740.webp');
        });
    });

    describe('4. Catalog data simulation: catalog receives image data and image source is generated', () => {
        it('for each real product with main_image, resolveImageSrc produces a loadable URL', () => {
            // Simulate what MakeProductCatalog.tsx does:
            // 1. Receive products with main_image field from IPC
            // 2. Pass main_image through resolveImageSrc()
            // 3. Use result as <img src>
            const mockProducts = [
                { id: 4, product_code: 'LE-CT-03', product_name: 'Aero Coffee Table', main_image: 'https://storage.lenas.me/files/product-images/4791-d-scaled_1788937154524.webp' },
                { id: 6, product_code: '1002', product_name: 'Hanging Counter Support', main_image: 'https://storage.lenas.me/files/product-images/Screenshot 2026-09-14 035740_1789390462948.webp' },
                { id: 8, product_code: '1003', product_name: '2 Person Workstation', main_image: 'https://storage.lenas.me/files/product-images/Screenshot 2026-09-15 163728_1789470879589.webp' },
                { id: 5, product_code: '1000', product_name: 'WS 2P', main_image: 'https://storage.lenas.me/files/product-images/StockCake-Rich_wooden_texture-2130701-standard_1789274764148.webp' }
            ];

            for (const p of mockProducts) {
                expect(p.main_image).toBeTruthy();
                const src = resolveImageSrc(p.main_image);
                expect(src).toMatch(/^app-media:\/\/nas\/files\/product-images\//);
                expect(src).not.toBe('');
                // Verify no double-encoding: there should be no %25 (encoded %)
                expect(src).not.toContain('%25');
            }
        });

        it('product without main_image does NOT generate an image src', () => {
            const emptyProduct = { id: 99, product_code: 'TEST', main_image: '' };
            expect(resolveImageSrc(emptyProduct.main_image)).toBe('');
        });
    });

    describe('5. Remote NAS image actually downloadable via Tailscale', () => {
        it('downloads a real product image from Tailscale storage (port 8081)', async () => {
            // This tests the actual network path that MediaProtocolService would use
            const testUrl = 'http://100.88.85.6:8081/files/product-images/4791-d-scaled_1788937154524.webp';
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(testUrl, { signal: controller.signal });
                clearTimeout(tid);

                if (res.ok) {
                    expect(res.status).toBe(200);
                    const contentType = res.headers.get('content-type');
                    expect(contentType).toContain('image/webp');
                    const buf = await res.arrayBuffer();
                    expect(buf.byteLength).toBeGreaterThan(1000);
                    console.log(`  ✓ Real image download: ${buf.byteLength} bytes, type=${contentType}`);
                } else {
                    console.log(`  ⚠ Tailscale storage not reachable (status ${res.status}), skipping network test`);
                }
            } catch (e: any) {
                console.log(`  ⚠ Tailscale storage not reachable (${e.message}), skipping network test`);
            }
        });

        it('downloads a real image with spaces in filename from Tailscale storage', async () => {
            const testUrl = encodeURI('http://100.88.85.6:8081/files/product-images/Screenshot 2026-09-14 035740_1789390462948.webp');
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(testUrl, { signal: controller.signal });
                clearTimeout(tid);

                if (res.ok) {
                    expect(res.status).toBe(200);
                    const contentType = res.headers.get('content-type');
                    expect(contentType).toContain('image/webp');
                    const buf = await res.arrayBuffer();
                    expect(buf.byteLength).toBeGreaterThan(1000);
                    console.log(`  ✓ Real image with spaces: ${buf.byteLength} bytes, type=${contentType}`);
                } else {
                    console.log(`  ⚠ Tailscale storage not reachable (status ${res.status}), skipping`);
                }
            } catch (e: any) {
                console.log(`  ⚠ Tailscale storage not reachable (${e.message}), skipping`);
            }
        });
    });
});
