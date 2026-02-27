const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read the config from the electron user data
// On Windows it's usually in AppData/Roaming/le-soft/supabase-config.json
const appDataPath = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share");
const configPath = path.join(appDataPath, 'le-soft', 'supabase-config.json');

let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('Could not find supabase-config.json. Please start the LE-SOFT app at least once.');
    process.exit(1);
}

const supabaseUrl = config.url;
const serviceRoleKey = config.serviceRoleKey;

if (!serviceRoleKey) {
    console.error('ERROR: You must define "serviceRoleKey" in your supabase-config.json to run this migration.');
    console.log('Path:', configPath);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function migrate() {
    console.log('--- Starting Legacy Auth Migration ---');

    // 1. Fetch all legacy users
    const { data: users, error: fetchErr } = await supabase.from('users').select('*').is('auth_id', null);

    if (fetchErr) {
        console.error('Failed to fetch legacy users:', fetchErr);
        return;
    }

    if (!users || users.length === 0) {
        console.log('No legacy users to migrate (all users already have an auth_id).');
        return;
    }

    console.log(`Found ${users.length} legacy users. Migrating to Supabase Auth...`);

    for (const user of users) {
        const emailToUse = user.email || (user.username + '@lesoft.local');

        console.log(`Migrating user: ${user.username} -> ${emailToUse}`);

        // Supabase REST admin API for createUser
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: emailToUse,
            email_confirm: true,
            password: 'migrated_user_needs_password_reset', // We cannot extract plain text from bcrypt. They will need to reset it, or we use a default.
            user_metadata: {
                username: user.username,
                full_name: user.full_name,
                role: user.role
            }
        });

        if (authError) {
            console.error(`  [X] Failed to create ${user.username}: ${authError.message}`);
            continue;
        }

        // Update the legacy record with the new auth_id
        const { error: updateErr } = await supabase.from('users').update({ auth_id: authData.user.id }).eq('id', user.id);

        if (updateErr) {
            console.error(`  [X] Failed to link ${user.username} to auth_id:`, updateErr);
        } else {
            console.log(`  [OK] Successfully migrated ${user.username}`);
        }
    }

    console.log('--- Migration Complete ---');
    console.log('IMPORTANT: Migrated users have had their passwords reset to: "migrated_user_needs_password_reset"');
    console.log('They must log in with this password and change it immediately. DO NOT re-run this script blindly.');
}

migrate();
