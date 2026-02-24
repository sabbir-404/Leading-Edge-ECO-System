import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface NetworkConfig {
    mode: 'server' | 'client' | '';
    serverAddress: string; // IP or Domain
    port: number;
    apiKey: string;
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'network-config.json');

const defaultConfig: NetworkConfig = {
    mode: '',
    serverAddress: '',
    port: 3456,
    apiKey: '',
};

export function getNetworkConfig(): NetworkConfig {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
            return { ...defaultConfig, ...JSON.parse(data) };
        }
    } catch (e) {
        console.warn('Failed to read network config:', e);
    }
    return { ...defaultConfig };
}

export function saveNetworkConfig(config: Partial<NetworkConfig>): void {
    const current = getNetworkConfig();
    const merged = { ...current, ...config };

    // Auto-generate API Key if not present and in server mode
    if (merged.mode === 'server' && !merged.apiKey) {
        merged.apiKey = crypto.randomBytes(32).toString('hex'); // SECURITY: 256-bit key
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
}

export function isConfigured(): boolean {
    const config = getNetworkConfig();
    return config.mode === 'server' || (config.mode === 'client' && !!config.serverAddress && !!config.apiKey);
}

export function isServerMode(): boolean {
    return getNetworkConfig().mode === 'server';
}

export function isClientMode(): boolean {
    return getNetworkConfig().mode === 'client';
}
