const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const os = require('os');

const p = os.homedir() + '/AppData/Roaming/LE-SOFT/supabase-config.json';
const config = JSON.parse(fs.readFileSync(p, 'utf8'));
const supabaseAdmin = createClient(config.url, config.serviceRoleKey);

async function fixAccounts() {
    console.log('Fixing unlinked accounts...');

    // 1. Fetch users from public.users where auth_id is null
    const { data: brokenUsers } = await supabaseAdmin.from('users').select('*').is('auth_id', null);

    if (brokenUsers && brokenUsers.length > 0) {
        for (const user of brokenUsers) {
            console.log(`Fixing user: ${user.username}`);
            const emailToUse = user.email || `${user.username}@lesoft.local`;

            // Try to create in Auth
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: emailToUse,
                password: 'password123',
                email_confirm: true,
                user_metadata: { full_name: user.full_name }
            });

            if (authError) {
                console.log(`Failed to create Auth for ${user.username}: ${authError.message}`);
            } else if (authData.user) {
                // Link auth_id
                const { error: updateError } = await supabaseAdmin.from('users')
                    .update({ auth_id: authData.user.id })
                    .eq('id', user.id);
                console.log(`Successfully fixed ${user.username} - Password set to: password123`);
            }
        }
    } else {
        console.log('No broken users found.');
    }

    // 2. Also reset 'admin' password to a known value just in case
    console.log('Resetting admin password to 123456...');
    const { data: adminAuthData } = await supabaseAdmin.auth.admin.listUsers();
    const adminUser = adminAuthData.users.find(u => u.email === 'admin@lesoft.local');
    if (adminUser) {
        await supabaseAdmin.auth.admin.updateUserById(adminUser.id, { password: '123456' });
        console.log('Admin password reset to: 123456');
    }
}

fixAccounts();
