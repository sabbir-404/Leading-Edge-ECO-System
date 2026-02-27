const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const os = require('os');

const p = os.homedir() + '/AppData/Roaming/LE-SOFT/supabase-config.json';
if (!fs.existsSync(p)) {
    console.log('No config file');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(p, 'utf8'));
const supabase = createClient(config.url, config.anonKey);
const supabaseAdmin = createClient(config.url, config.serviceRoleKey);

async function test() {
    console.log('Testing login...');
    console.time('signIn');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'admin@lesoft.local',
        password: 'admin' // Or whatever password might be
    });
    console.timeEnd('signIn');

    if (authError) {
        console.log('Auth Error (admin):', authError.message);
    } else {
        console.log('Auth Success for admin! User ID:', authData.user.id);
    }

    // Check users table
    const { data: users, error: usersError } = await supabaseAdmin.from('users').select('*');
    if (usersError) {
        console.log('Users Query Error:', usersError.message);
    } else {
        console.log(`Found ${users.length} users in public.users table.`);
        console.log(users.map(u => `${u.username} (active: ${u.is_active}, auth_id: ${u.auth_id})`));
    }

    // Check auth.users
    const { data: authUsers, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers();
    if (authUsersError) {
        console.log('Auth Admin Query Error:', authUsersError.message);
    } else {
        console.log(`Found ${authUsers.users.length} users in auth.users.`);
        console.log(authUsers.users.map(u => `${u.email} (confirmed_at: ${u.email_confirmed_at})`));
    }
}

test();
