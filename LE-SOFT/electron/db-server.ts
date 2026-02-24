import http from 'http';
import db from './database';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getNetworkConfig } from './network-config';

let server: http.Server | null = null;

// ═══════════════════════════════════════════════
//  MONITORING: Connection & Query Logging
// ═══════════════════════════════════════════════
interface ConnectionEntry {
    ip: string;
    firstSeen: string;
    lastSeen: string;
    queryCount: number;
    activeNow: boolean;
}

interface QueryLogEntry {
    timestamp: string;
    ip: string;
    method: string;
    sql: string;
    success: boolean;
    durationMs: number;
    error?: string;
}

const activeConnections = new Map<string, ConnectionEntry>();
const queryLog: QueryLogEntry[] = [];
const MAX_QUERY_LOG = 500; // Keep last 500 queries in memory

function logQuery(entry: QueryLogEntry) {
    queryLog.push(entry);
    if (queryLog.length > MAX_QUERY_LOG) queryLog.shift();

    // Also write to log file
    try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, 'db-access.log');
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(logFile, line, 'utf-8');

        // Rotate: keep log file under 5 MB
        const stats = fs.statSync(logFile);
        if (stats.size > 5 * 1024 * 1024) {
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.split('\n');
            fs.writeFileSync(logFile, lines.slice(-1000).join('\n'), 'utf-8');
        }
    } catch { /* logging should never crash the server */ }
}

function trackConnection(ip: string) {
    const now = new Date().toISOString();
    const existing = activeConnections.get(ip);
    if (existing) {
        existing.lastSeen = now;
        existing.queryCount++;
        existing.activeNow = true;
    } else {
        activeConnections.set(ip, {
            ip,
            firstSeen: now,
            lastSeen: now,
            queryCount: 1,
            activeNow: true,
        });
    }
    // Mark connections as inactive after 2 minutes of no activity
    setTimeout(() => {
        const conn = activeConnections.get(ip);
        if (conn && Date.now() - new Date(conn.lastSeen).getTime() > 120_000) {
            conn.activeNow = false;
        }
    }, 120_000);
}

// Export for IPC access from main.ts
export function getDbMonitoringData() {
    return {
        connections: Array.from(activeConnections.values()),
        recentQueries: queryLog.slice(-100),
        stats: {
            totalConnections: activeConnections.size,
            activeConnections: Array.from(activeConnections.values()).filter(c => c.activeNow).length,
            totalQueries: queryLog.length,
        },
    };
}

// ═══════════════════════════════════════════════
//  SECURITY: SQL keyword blocklist
//  Prevents destructive or structure-altering SQL
//  from being executed via the network API.
// ═══════════════════════════════════════════════
const SQL_BLOCKED_KEYWORDS = /\b(DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|CREATE\s+TABLE|CREATE\s+INDEX|TRUNCATE)\b/i;

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB body limit

// SECURITY: Rate limiter — max 100 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
        return false;
    }
    entry.count++;
    return entry.count > 100;
}

// SECURITY: Only allow LAN / localhost origins
function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return true; // direct/non-browser request
    try {
        const host = new URL(origin).hostname;
        // Allow localhost, 127.x.x.x, 10.x, 172.16-31.x, 192.168.x
        return (
            host === 'localhost' ||
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
            /^192\.168\./.test(host)
        );
    } catch {
        return false;
    }
}

/**
 * Starts a lightweight HTTP server that exposes the local SQLite database
 * over the network with API Key authentication and security hardening.
 */
export function startDbServer(port: number = 3456): Promise<string> {
    const config = getNetworkConfig();
    const apiKey = config.apiKey;

    return new Promise((resolve, reject) => {
        if (server) {
            return resolve(getLocalIp());
        }

        server = http.createServer((req, res) => {
            const clientIp = req.socket.remoteAddress || '';

            // SECURITY: Rate limiting per IP
            if (isRateLimited(clientIp)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Too many requests' }));
                return;
            }

            const origin = req.headers['origin'] as string | undefined;

            // SECURITY: Restrict CORS to LAN origins only
            if (origin && !isAllowedOrigin(origin)) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Forbidden: Origin not allowed' }));
                return;
            }

            // Set restrictive CORS headers
            const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : 'null';
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // Health check (no auth required for ping, but limited info)
            if (req.method === 'GET' && req.url === '/ping') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
                return;
            }

            // SECURITY: Auth check for all other requests
            const clientApiKey = req.headers['x-api-key'];
            if (!clientApiKey || clientApiKey !== apiKey) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            // Database query endpoint
            if (req.method === 'POST' && req.url === '/query') {
                let body = '';
                let bodySize = 0;

                req.on('data', (chunk: Buffer) => {
                    bodySize += chunk.length;
                    // SECURITY: Body size limit (1 MB)
                    if (bodySize > MAX_BODY_BYTES) {
                        req.destroy();
                        res.writeHead(413, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Request body too large' }));
                        return;
                    }
                    body += chunk;
                });

                req.on('end', () => {
                    try {
                        const { method, sql, params } = JSON.parse(body);

                        // SECURITY: Validate method is one of the allowed values
                        if (!['all', 'get', 'run'].includes(method)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid method' }));
                            return;
                        }

                        // SECURITY: Validate SQL is a string and not empty
                        if (typeof sql !== 'string' || sql.trim().length === 0) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid SQL' }));
                            return;
                        }

                        // SECURITY: Block dangerous SQL keywords (DDL + structural operations)
                        if (SQL_BLOCKED_KEYWORDS.test(sql)) {
                            console.warn(`[SECURITY] Blocked dangerous SQL from ${clientIp}: ${sql.substring(0, 100)}`);
                            logQuery({ timestamp: new Date().toISOString(), ip: clientIp, method, sql: sql.substring(0, 200), success: false, durationMs: 0, error: 'Blocked: dangerous SQL' });
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'SQL operation not permitted' }));
                            return;
                        }

                        // SECURITY: Validate params is an array
                        const safeParams = Array.isArray(params) ? params : [];

                        // MONITORING: Track connection and time the query
                        trackConnection(clientIp);
                        const queryStart = Date.now();

                        if (method === 'all') {
                            db.all(sql, safeParams, (err: any, rows: any[]) => {
                                const dur = Date.now() - queryStart;
                                logQuery({ timestamp: new Date().toISOString(), ip: clientIp, method, sql: sql.substring(0, 200), success: !err, durationMs: dur, error: err?.message });
                                if (err) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Query failed' }));
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ rows }));
                                }
                            });
                        } else if (method === 'get') {
                            db.get(sql, safeParams, (err: any, row: any) => {
                                const dur = Date.now() - queryStart;
                                logQuery({ timestamp: new Date().toISOString(), ip: clientIp, method, sql: sql.substring(0, 200), success: !err, durationMs: dur, error: err?.message });
                                if (err) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Query failed' }));
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ row: row || null }));
                                }
                            });
                        } else if (method === 'run') {
                            db.run(sql, safeParams, function (this: any, err: any) {
                                const dur = Date.now() - queryStart;
                                logQuery({ timestamp: new Date().toISOString(), ip: clientIp, method, sql: sql.substring(0, 200), success: !err, durationMs: dur, error: err?.message });
                                if (err) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Query failed' }));
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ lastID: this.lastID, changes: this.changes }));
                                }
                            });
                        }
                    } catch (e: any) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    }
                });
                return;
            }

            // MONITORING: Expose monitoring data (requires auth)
            if (req.method === 'GET' && req.url === '/monitoring') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(getDbMonitoringData()));
                return;
            }

            res.writeHead(404);
            res.end();
        });

        server.listen(port, '0.0.0.0', () => {
            console.log(`[SECURITY] LE-SOFT DB Server started — rate limiting, CORS, and SQL blocklist active`);
            resolve(getLocalIp());
        });

        server.on('error', (err) => reject(err));
    });
}

export function stopDbServer(): void {
    if (server) {
        server.close();
        server = null;
    }
}

export function getLocalIp(): string {
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
