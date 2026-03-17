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
    bg: '#f5f6fa',
    bgCard: '#ffffff',
    bgElevated: '#f0f1f5',
    bgInput: '#f9fafb',
    bgInput2: '#edf0f7',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textMuted: '#9ca3af',
    border: '#e5e7eb',
    borderStrong: '#d1d5db',
    accent: '#1d4ed8',
    accentLight: '#dbeafe',
    success: '#16a34a',
    successLight: '#dcfce7',
    danger: '#dc2626',
    dangerLight: '#fee2e2',
    warning: '#d97706',
    warningLight: '#fef3c7',
    purple: '#7c3aed',
    purpleLight: '#ede9fe',
    tabBar: '#ffffff',
    tabBarBorder: '#e5e7eb',
    headerBg: '#ffffff',
    overlay: 'rgba(0,0,0,0.5)',
    shadow: '0 2px 12px rgba(0,0,0,0.08)',
    isDark: false,
};

export const darkTheme: Theme = {
    bg: '#0a0a0a',
    bgCard: '#111111',
    bgElevated: '#1a1a1a',
    bgInput: '#1a1a1a',
    bgInput2: '#222222',
    textPrimary: '#f9fafb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    border: '#1f2937',
    borderStrong: '#374151',
    accent: '#3b82f6',
    accentLight: '#1e3a5f',
    success: '#10b981',
    successLight: '#0f3229',
    danger: '#ef4444',
    dangerLight: '#3b0f0f',
    warning: '#f59e0b',
    warningLight: '#3b2a0a',
    purple: '#8b5cf6',
    purpleLight: '#2d1b6e',
    tabBar: '#0d0d0d',
    tabBarBorder: '#1a1a1a',
    headerBg: '#0d0d0d',
    overlay: 'rgba(0,0,0,0.8)',
    shadow: '0 2px 12px rgba(0,0,0,0.4)',
    isDark: true,
};
