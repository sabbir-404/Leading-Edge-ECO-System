import http from 'http';

/**
 * Proxies all queries to the remote LE-SOFT DB Server using the API Key.
 */
export function createDbClient(serverAddress: string, apiKey: string, port: number = 3456) {
    const isIp = /^[0-9\.]+$/.test(serverAddress);
    const hostname = serverAddress;

    function request(body: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);

            const req = http.request({
                hostname,
                port,
                path: '/query',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'X-API-Key': apiKey
                },
                timeout: 10000,
            }, (res) => {
                let responseBody = '';
                res.on('data', chunk => { responseBody += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 401) {
                        return reject(new Error('Invalid Secret Key — Access Denied'));
                    }
                    try {
                        const parsed = JSON.parse(responseBody);
                        if (parsed.error) reject(new Error(parsed.error));
                        else resolve(parsed);
                    } catch (e) {
                        reject(new Error('Invalid response from server'));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Failed to connect to ${serverAddress}: ${err.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Connection to ${serverAddress} timed out`));
            });

            req.write(data);
            req.end();
        });
    }

    return {
        all(sql: string, params: any[] | any = [], callback?: Function) {
            if (typeof params === 'function') { callback = params; params = []; }
            request({ method: 'all', sql, params: Array.isArray(params) ? params : [] })
                .then(r => callback ? callback(null, r.rows) : null)
                .catch(e => callback ? callback(e) : null);
        },
        get(sql: string, params: any[] | any = [], callback?: Function) {
            if (typeof params === 'function') { callback = params; params = []; }
            request({ method: 'get', sql, params: Array.isArray(params) ? params : [] })
                .then(r => callback ? callback(null, r.row) : null)
                .catch(e => callback ? callback(e) : null);
        },
        run(sql: string, params: any[] | any = [], callback?: Function) {
            if (typeof params === 'function') { callback = params; params = []; }
            request({ method: 'run', sql, params: Array.isArray(params) ? params : [] })
                .then(r => {
                    if (callback) callback.call({ lastID: r.lastID, changes: r.changes }, null);
                })
                .catch(e => callback ? callback(e) : null);
        },
        serialize(fn: Function) { fn(); },
        prepare(sql: string) {
            const runs: Promise<any>[] = [];
            return {
                run(params: any[], cb?: Function) {
                    runs.push(request({ method: 'run', sql, params }).then(r => cb?.call({ lastID: r.lastID, changes: r.changes }, null)).catch(e => cb?.(e)));
                },
                finalize(cb?: Function) { Promise.all(runs).then(() => cb?.()).catch(e => cb?.(e)); }
            };
        }
    };
}

export function testConnection(serverAddress: string, apiKey: string, port: number = 3456): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve) => {
        const req = http.get({
            hostname: serverAddress,
            port,
            path: '/ping',
            headers: { 'X-API-Key': apiKey },
            timeout: 5000
        }, (res) => {
            if (res.statusCode === 401) {
                resolve({ success: false, message: 'Invalid Secret Key' });
                return;
            }
            resolve({ success: res.statusCode === 200 });
        });
        req.on('error', (e) => resolve({ success: false, message: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'Timed out' }); });
    });
}
