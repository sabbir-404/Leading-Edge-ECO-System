import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';

export function getLockFilePath(): string {
    return path.join(app.getPath('userData'), '.system-lock');
}

export function triggerSystemLockout(reason: string) {
    const lockFilePath = getLockFilePath();
    const logPath = path.join(app.getPath('userData'), 'app.log');
    
    try {
        fs.writeFileSync(lockFilePath, JSON.stringify({
            timestamp: new Date().toISOString(),
            reason
        }, null, 2), 'utf-8');
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] SECURITY LOCKOUT: ${reason}\n`);
    } catch {}

    console.error(`[SECURITY] SYSTEM LOCKOUT TRIGGERED: ${reason}`);

    // Instantly replace all window contents with the lockout screen
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.loadURL(`data:text/html,
                <html>
                <head>
                    <title>System Locked</title>
                    <style>
                        body {
                            background: #0f172a;
                            color: #f8fafc;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                            text-align: center;
                            padding: 2rem;
                            box-sizing: border-box;
                        }
                        .container {
                            max-width: 450px;
                            background: #1e293b;
                            border: 1px solid #334155;
                            border-radius: 16px;
                            padding: 2rem;
                            box-shadow: 0 20px 40px rgba(0,0,0,0.45);
                        }
                        .icon {
                            font-size: 3.5rem;
                            margin-bottom: 0.75rem;
                        }
                        h1 {
                            font-size: 1.6rem;
                            margin: 0 0 0.75rem;
                            font-weight: 800;
                            color: #ef4444;
                            letter-spacing: -0.025em;
                        }
                        p {
                            color: #94a3b8;
                            font-size: 0.9rem;
                            line-height: 1.5;
                            margin: 0 0 1.5rem;
                        }
                        .reason {
                            background: #0f172a;
                            color: #f1f5f9;
                            font-family: monospace;
                            font-size: 0.8rem;
                            padding: 0.5rem;
                            border-radius: 6px;
                            margin-bottom: 1.5rem;
                            border: 1px solid #334155;
                        }
                        .footer {
                            font-size: 0.75rem;
                            color: #64748b;
                            border-top: 1px solid #334155;
                            padding-top: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">🛑</div>
                        <h1>SYSTEM DISABLED</h1>
                        <p>LESOFT has been disabled due to detected software tampering or unauthorized modification. Please contact the administrator/developer to restore access.</p>
                        <div class="reason">Reason: ${reason}</div>
                        <div class="footer">
                            Secure Lock State Active
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
    });
}
