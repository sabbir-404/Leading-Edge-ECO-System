import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
if (fs.existsSync(userEnvPath)) {
  const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
  console.log('Keys in supabase-config.json:', Object.keys(conf));
  if (conf.db_password || conf.dbPassword || conf.connectionString) {
    console.log('Found database credentials!');
  } else {
    console.log('No direct database credentials found, only URL/keys.');
  }
} else {
  console.log('Config file not found.');
}
