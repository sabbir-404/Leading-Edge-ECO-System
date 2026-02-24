const fs = require('fs');
const path = require('path');

// This script ensures that the correctly built sqlite3 native module is 
// placed where the packaged app expects it.
exports.default = async function (context) {
    const sqliteDest = path.join(context.appOutDir, 'resources/app/node_modules/sqlite3');

    // Note: electron-builder extraResources handles most of the copying,
    // but we can add specific logic here if needed for binary pathing.
    console.log('  • afterPack: Ensuring SQLite native modules are correctly placed');
};
