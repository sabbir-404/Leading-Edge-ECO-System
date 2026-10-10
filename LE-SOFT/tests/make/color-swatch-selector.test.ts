import { describe, expect, it } from 'vitest';
import { getColorSwatchColor } from '../../src/pages/Make/PlaceOrder';

describe('Color Swatch Selector — Verification', () => {
  describe('1. Color value normalization and swatch calculation', () => {
    it('accurately parses standard 3, 6, and 8 digit hexadecimal color codes', () => {
      expect(getColorSwatchColor('#fff')).toBe('#fff');
      expect(getColorSwatchColor('#10b981')).toBe('#10b981');
      expect(getColorSwatchColor('#3B82F6')).toBe('#3B82F6');
      expect(getColorSwatchColor('#00000080')).toBe('#00000080');
      expect(getColorSwatchColor('  #ea580c  ')).toBe('#ea580c');
    });

    it('accurately parses named CSS colors', () => {
      expect(getColorSwatchColor('black')).toBe('black');
      expect(getColorSwatchColor('white')).toBe('white');
      expect(getColorSwatchColor('gold')).toBe('gold');
      expect(getColorSwatchColor('navy')).toBe('navy');
      expect(getColorSwatchColor('RoyalBlue')).toBe('RoyalBlue');
    });

    it('accurately parses functional rgb/rgba/hsl/hsla color strings', () => {
      expect(getColorSwatchColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
      expect(getColorSwatchColor('rgba(16, 185, 129, 0.5)')).toBe('rgba(16, 185, 129, 0.5)');
      expect(getColorSwatchColor('hsl(210, 50%, 60%)')).toBe('hsl(210, 50%, 60%)');
    });

    it('gracefully falls back to neutral gray (#d1d5db) for missing, null, or empty values', () => {
      expect(getColorSwatchColor(null)).toBe('#d1d5db');
      expect(getColorSwatchColor(undefined)).toBe('#d1d5db');
      expect(getColorSwatchColor('')).toBe('#d1d5db');
      expect(getColorSwatchColor('   ')).toBe('#d1d5db');
    });

    it('gracefully falls back to neutral gray (#d1d5db) for invalid color strings', () => {
      expect(getColorSwatchColor('12345')).toBe('#d1d5db');
      expect(getColorSwatchColor('###')).toBe('#d1d5db');
      expect(getColorSwatchColor('not-a-valid-color-value-because-it-has-dashes-and-is-too-long')).toBe('#d1d5db');
      expect(getColorSwatchColor('javascript:void(0)')).toBe('#d1d5db');
    });
  });

  describe('2. Color preservation in item and cart data', () => {
    it('preserves color_id, color_name, and color_code when standard color is selected', () => {
      const selectedColor = {
        id: 42,
        color_name: 'Smoked Walnut',
        color_code: '#5c4033'
      };

      const cartItem = {
        _id: 'item-101',
        product_id: 10,
        product_code: 'DSK-01',
        product_name: 'Executive Desk',
        color_id: selectedColor.id,
        color_name: selectedColor.color_name,
        color_code: selectedColor.color_code,
        quantity: 1
      };

      expect(cartItem.color_id).toBe(42);
      expect(cartItem.color_name).toBe('Smoked Walnut');
      expect(cartItem.color_code).toBe('#5c4033');
      expect(getColorSwatchColor(cartItem.color_code)).toBe('#5c4033');
    });

    it('preserves custom color name without a color_id when custom color is entered', () => {
      const customColorName = 'Custom Midnight Navy';
      const cartItem = {
        _id: 'item-102',
        product_id: 10,
        product_code: 'DSK-01',
        product_name: 'Executive Desk',
        color_id: undefined,
        color_name: customColorName,
        color_code: undefined,
        quantity: 1
      };

      expect(cartItem.color_id).toBeUndefined();
      expect(cartItem.color_name).toBe('Custom Midnight Navy');
      expect(cartItem.color_code).toBeUndefined();
      expect(getColorSwatchColor(cartItem.color_code)).toBe('#d1d5db');
    });
  });
});
