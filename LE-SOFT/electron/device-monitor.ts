import { app } from 'electron';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import supabase from './supabase';

// ─── Machine ID (stable hardware fingerprint) ─────────────────────────────────
function getMachineId(): string {
    const idFile = path.join(app.getPath('userData'), '.device-id');
    if (fs.existsSync(idFile)) {
        return fs.readFileSync(idFile, 'utf-8').trim();
    }
    // Generate a stable ID from hostname + platform + username
    const raw = `${os.hostname()}-${os.platform()}-${os.userInfo().username}`;
    const id = createHash('sha256').update(raw).digest('hex').substring(0, 32);
    fs.writeFileSync(idFile, id, 'utf-8');
    return id;
}

export const DEVICE_ID = getMachineId();
export const DEVICE_NAME = os.hostname();
export const DEVICE_PLATFORM = os.platform();

// ─── Get local IP address ─────────────────────────────────────────────────────
function getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// ─── Register/update device session in Supabase ───────────────────────────────
export async function registerDevice(username?: string): Promise<void> {
    const { version } = JSON.parse(
        fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf-8')
    );

    const payload = {
        device_id: DEVICE_ID,
        device_name: DEVICE_NAME,
        ip_address: getLocalIP(),
        platform: DEVICE_PLATFORM,
        app_version: version,
        last_seen: new Date().toISOString(),
        ...(username ? { username } : {}),
    };

    const { error } = await supabase
        .from('device_sessions')
        .upsert(payload, { onConflict: 'device_id' });

    if (error) {
        console.warn('[DEVICE] Could not register device session:', error.message);
    } else {
        console.log('[DEVICE] Session registered →', DEVICE_NAME, getLocalIP());
    }
}

// ─── Set/unset this device as backup node ────────────────────────────────────
export async function setBackupNode(isBackup: boolean): Promise<void> {
    const { error } = await supabase
        .from('device_sessions')
        .update({ is_backup_node: isBackup })
        .eq('device_id', DEVICE_ID);

    if (error) console.error('[DEVICE] Failed to update backup node status:', error.message);
    else console.log(`[DEVICE] Backup node: ${isBackup}`);
}

// ─── Get all connected devices ───────────────────────────────────────────────
export async function getConnectedDevices(): Promise<any[]> {
    const { data, error } = await supabase
        .from('device_sessions')
        .select('*')
        .order('last_seen', { ascending: false });

    if (error) {
        console.error('[DEVICE] Failed to fetch devices:', error.message);
        return [];
    }
    return data || [];
}

// ─── Heartbeat — keep session alive ──────────────────────────────────────────
export function startHeartbeat(intervalMs = 60_000): NodeJS.Timeout {
    return setInterval(async () => {
        await supabase
            .from('device_sessions')
            .update({ last_seen: new Date().toISOString() })
            .eq('device_id', DEVICE_ID);
    }, intervalMs);
}
