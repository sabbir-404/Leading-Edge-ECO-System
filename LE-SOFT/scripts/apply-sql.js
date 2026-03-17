const fs = require('fs');
const path = require('path');
const os = require('os');

async function runMigration() {
    console.log('--- Applying Market Analysis Migration ---');
    try {
        const configPath = path.join(os.homedir(), 'AppData', 'Roaming', 'le-soft', 'supabase-config.json');
        if (!fs.existsSync(configPath)) {
            console.error('ERROR: Could not find supabase-config.json');
            return;
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const supabaseUrl = config.url;
        const supabaseKey = config.serviceRoleKey; // Need admin key for structural changes

        if (!supabaseUrl || !supabaseKey) {
            console.error('ERROR: Missing Supabase URL or Service Role Key in config');
            return;
        }

        // The REST API doesn't support raw SQL execution directly except via RPC. 
        // We will define an RPC function if it doesn't exist, or just instruct the user.
        console.error('ERROR: Cannot execute raw SQL via REST dynamically without an existing RPC function.');
        console.error('Please run the SQL migration manually in your Supabase Dashboard -> SQL Editor.');
        console.log('\nMigration File: D:\\Code\\Leading Edge\\LE-SOFT\\supabase\\migrations\\017_market_analysis.sql\n');
        
    } catch (err) {
        console.error('Migration failed:', err.message);
    }
}

runMigration();
