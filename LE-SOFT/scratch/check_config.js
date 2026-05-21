import fs from 'fs';
const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
if (fs.existsSync(userEnvPath)) {
  const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
  console.log('Keys in config:', Object.keys(conf));
  console.log('Has serviceRoleKey:', !!conf.serviceRoleKey);
  console.log('Has anonKey:', !!conf.anonKey);
} else {
  console.log('Config file not found.');
}
