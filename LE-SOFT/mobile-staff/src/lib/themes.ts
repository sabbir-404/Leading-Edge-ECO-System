export interface Theme {
    bg: string;
    bgCard: string;
    bgElevated: string;
    bgInput: string;
    bgInput2: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    borderStrong: string;
    accent: string;
    accentLight: string;
    success: string;
    successLight: string;
    danger: string;
    dangerLight: string;
    warning: string;
    warningLight: string;
    purple: string;
    purpleLight: string;
    tabBar: string;
    tabBarBorder: string;
    headerBg: string;
    overlay: string;
    shadow: string;
    isDark: boolean;
}

export const lightTheme: Theme = {
    bg: '#d4d4d4',            // Silver gray
    bgCard: '#c8c8c8',        // Slightly darker silver
    bgElevated: '#e0e0e0',
    bgInput: '#e8e8e8',
    bgInput2: '#d1d5db',
    textPrimary: '#111111',   // Near-black
    textSecondary: '#444444',
    textMuted: '#666666',
    border: '#000000',        // Black borders like desktop
    borderStrong: '#000000',
    accent: '#f97316',        // Orange accent
    accentLight: '#ffedd5',
    success: '#16a34a',
    successLight: '#dcfce7',
    danger: '#dc2626',
    dangerLight: '#fee2e2',
    warning: '#f97316',
    warningLight: '#ffedd5',
    purple: '#7c3aed',
    purpleLight: '#ede9fe',
    tabBar: '#c0c0c0',
    tabBarBorder: '#000000',
    headerBg: '#c0c0c0',
    overlay: 'rgba(0,0,0,0.5)',
    shadow: '0 2px 12px rgba(0,0,0,0.15)',
    isDark: false,
};

export const darkTheme: Theme = {
    bg: '#0a0a0a',            // Rich Black
    bgCard: '#141414',        // Slightly lighter black
    bgElevated: '#1e1e1e',
    bgInput: '#1e1e1e',
    bgInput2: '#2a2a2a',
    textPrimary: '#f5f5f5',   // Off-white
    textSecondary: '#999999',
    textMuted: '#666666',
    border: '#2a2a2a',        // Subtle dark border
    borderStrong: '#333333',
    accent: '#f97316',        // Orange accent
    accentLight: '#3b2a0a',
    success: '#10b981',
    successLight: '#0f3229',
    danger: '#ef4444',
    dangerLight: '#3b0f0f',
    warning: '#f59e0b',
    warningLight: '#3b2a0a',
    purple: '#8b5cf6',
    purpleLight: '#2d1b6e',
    tabBar: '#111111',
    tabBarBorder: '#2a2a2a',
    headerBg: '#141414',
    overlay: 'rgba(0,0,0,0.8)',
    shadow: '0 2px 12px rgba(0,0,0,0.4)',
    isDark: true,
};
