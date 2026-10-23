// Electron entry shim: select the profile before importing main.ts and its
// services, some of which create persistent queues during module evaluation.
const path = require('node:path');
const { app } = require('electron');

const allowed = new Set(['development', 'testing', 'staging', 'production']);
const requested = String(process.env.LE_SOFT_ENVIRONMENT || '').trim().toLowerCase();
const mode = allowed.has(requested)
    ? requested
    : (app.isPackaged ? 'production' : 'development');

process.env.LE_SOFT_ENVIRONMENT = mode;

if (mode !== 'production') {
    // This directory cannot read or overwrite the installed production profile.
    app.setPath('userData', path.join(app.getPath('appData'), 'LE-SOFT', mode));
}

require('./app-main.cjs');
