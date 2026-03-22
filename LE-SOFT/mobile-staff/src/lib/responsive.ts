import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function useResponsive() {
    const { width, height } = useWindowDimensions();

    const widthScale = width / BASE_WIDTH;
    const heightScale = height / BASE_HEIGHT;
    const moderateScale = clamp((widthScale + heightScale) / 2, 0.85, 1.35);

    const scale = (size: number) => Math.round(size * moderateScale);
    const font = (size: number, min = size * 0.85, max = size * 1.25) => clamp(Math.round(size * moderateScale), Math.round(min), Math.round(max));
    const spacing = (size: number) => Math.round(size * moderateScale);
    const radius = (size: number) => Math.round(size * moderateScale);
    const icon = (size: number) => Math.round(size * moderateScale);

    const isCompact = width < 360;
    const isUltraCompact = width < 320;
    const isTablet = width >= 768;

    const contentPadding = isUltraCompact ? spacing(12) : isCompact ? spacing(14) : spacing(16);
    const cardPadding = isUltraCompact ? spacing(10) : isCompact ? spacing(12) : spacing(14);
    const sectionGap = isUltraCompact ? spacing(10) : isCompact ? spacing(12) : spacing(16);
    const controlHeight = isCompact ? scale(44) : scale(48);
    const touchMin = isCompact ? scale(38) : scale(42);
    
    // Ultra-compact row density tokens (don't reduce touch targets, only whitespace)
    const compactRowPadding = isUltraCompact ? spacing(8) : spacing(10);
    const compactRowGap = isUltraCompact ? spacing(6) : spacing(8);
    const compactDetailPadding = isUltraCompact ? spacing(6) : spacing(10);

    return {
        width,
        height,
        scale,
        font,
        spacing,
        radius,
        icon,
        isCompact,
        isUltraCompact,
        isTablet,
        contentPadding,
        cardPadding,
        sectionGap,
        controlHeight,
        touchMin,
        compactRowPadding,
        compactRowGap,
        compactDetailPadding,
    };
}
