import { describe, expect, it } from 'vitest';
import { decodePathSegments, encodePathSegments } from '../../src/utils/mediaPath';
import { resolveImageSrc } from '../../src/utils/imageSrc';

describe('media path segment encoding', () => {
    it('encodes reserved filename characters without changing path separators', () => {
        const raw = 'files/product-images/Desk Blueprint #1?draft=2 100%.png';
        expect(encodePathSegments(raw)).toBe(
            'files/product-images/Desk%20Blueprint%20%231%3Fdraft%3D2%20100%25.png'
        );
    });

    it('decodes each segment once and preserves malformed percent sequences safely', () => {
        expect(decodePathSegments('files/Desk%20Blueprint%20%231.png')).toBe(
            'files/Desk Blueprint #1.png'
        );
        expect(decodePathSegments('files/100% complete.png')).toBe(
            'files/100% complete.png'
        );
    });

    it('routes encoded NAS URL filename characters through app-media', () => {
        expect(resolveImageSrc(
            'https://storage.lenas.me/files/product-images/Desk%20Blueprint%20%231%3Fdraft%3D2%20100%25.png'
        )).toBe(
            'app-media://nas/files/product-images/Desk%20Blueprint%20%231%3Fdraft%3D2%20100%25.png'
        );
    });

    it('encodes reserved characters in relative NAS file paths', () => {
        expect(resolveImageSrc(
            'files/product-images/Desk Blueprint #1?draft=2 100%.png'
        )).toBe(
            'app-media://nas/files/product-images/Desk%20Blueprint%20%231%3Fdraft%3D2%20100%25.png'
        );
    });

    it('normalizes already-encoded app-media NAS paths exactly once', () => {
        expect(resolveImageSrc(
            'app-media://nas/files/product-images/Desk%20Blueprint%20%231%3Fdraft%3D2.png'
        )).toBe(
            'app-media://nas/files/product-images/Desk%20Blueprint%20%231%3Fdraft%3D2.png'
        );
    });

    it('does not throw when a NAS filename contains a stray percent sign', () => {
        expect(resolveImageSrc(
            'https://storage.lenas.me/files/product-images/100% complete.png'
        )).toBe(
            'app-media://nas/files/product-images/100%25%20complete.png'
        );
    });

    it('normalizes legacy LAN storage URLs using their path, not query or fragment', () => {
        expect(resolveImageSrc(
            'http://100.88.85.6:8081/files/product-images/Desk%20%231.png?token=not-forwarded'
        )).toBe(
            'app-media://nas/files/product-images/Desk%20%231.png'
        );
    });
});
