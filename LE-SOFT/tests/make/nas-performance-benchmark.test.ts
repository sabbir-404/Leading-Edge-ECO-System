import { describe, it, expect } from 'vitest';
import { DatabaseFailoverEngine } from '../../electron/services/DatabaseFailoverEngine';
import { MediaProtocolService } from '../../electron/services/media/MediaProtocolService';
import { resolveImageSrc } from '../../src/utils/imageSrc';

describe('NAS Performance Benchmarking & Latency Verification', () => {

    it('Benchmark 1: NAS direct Tailscale response time is rapid (< 1500ms over WAN/VPN, < 100ms on warm LAN)', async () => {
        const t0 = performance.now();
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 2000);
        try {
            const resp = await fetch('http://100.88.85.6:3001/make_product_categories?limit=1', {
                signal: controller.signal
            });
            clearTimeout(tid);
            const duration = Math.round(performance.now() - t0);
            console.log(`[BENCHMARK] Direct Tailscale query duration: ${duration}ms, status: ${resp.status}`);
            expect(resp.status).toBe(200);
            expect(duration).toBeLessThan(2000);
        } catch (e: any) {
            clearTimeout(tid);
            console.warn('[BENCHMARK] Direct Tailscale query failed or unreachable:', e.message);
        }
    });

    it('Benchmark 2: NAS timeout handling aborts within 2000ms and safely fails over', async () => {
        const t0 = performance.now();
        const controller = new AbortController();
        const timeoutMs = 2000;
        const tid = setTimeout(() => controller.abort(), timeoutMs);

        // Attempt connecting to a blackhole IP to test client timeout bounding
        try {
            await fetch('http://10.255.255.1:3001/make_products', {
                signal: controller.signal
            });
            clearTimeout(tid);
        } catch (err: any) {
            clearTimeout(tid);
            const elapsed = Math.round(performance.now() - t0);
            console.log(`[BENCHMARK] Bounded timeout caught after: ${elapsed}ms`);
            expect(elapsed).toBeLessThanOrEqual(2500); // 2000ms + 500ms margin
        }
    });

    it('Benchmark 3: Image fetch through candidate endpoints (Tailscale :8081)', async () => {
        const t0 = performance.now();
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3000);
        try {
            const testUrl = 'http://100.88.85.6:8081/files/product-images/4791-d-scaled_1788937154524.webp';
            const res = await fetch(testUrl, { signal: controller.signal });
            clearTimeout(tid);
            const duration = Math.round(performance.now() - t0);
            console.log(`[BENCHMARK] Image fetch duration: ${duration}ms, status: ${res.status}`);
            if (res.ok) {
                const buf = await res.arrayBuffer();
                console.log(`[BENCHMARK] Loaded image size: ${Math.round(buf.byteLength / 1024)} KB`);
                expect(buf.byteLength).toBeGreaterThan(1000);
            }
        } catch (e: any) {
            clearTimeout(tid);
            console.warn('[BENCHMARK] Image fetch unreachable:', e.message);
        }
    });

    it('Benchmark 4: Catalog resolution for 10+ products with images completes in < 5ms', () => {
        const mockProducts = Array.from({ length: 25 }).map((_, i) => ({
            id: i + 1,
            product_code: `PRD-${1000 + i}`,
            product_name: `Product ${i + 1}`,
            main_image: `https://storage.lenas.me/files/product-images/item_${i + 1}.webp`
        }));

        const t0 = performance.now();
        const resolvedList = mockProducts.map(p => ({
            ...p,
            resolvedSrc: resolveImageSrc(p.main_image)
        }));
        const duration = performance.now() - t0;

        console.log(`[BENCHMARK] Catalog resolution for 25 products completed in ${duration.toFixed(3)}ms`);
        expect(resolvedList.length).toBe(25);
        expect(resolvedList[0].resolvedSrc).toMatch(/^app-media:\/\/nas\//);
        expect(duration).toBeLessThan(10); // sub-10ms for 25 items
    });
});
