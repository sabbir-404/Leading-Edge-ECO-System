import fs from 'fs';
const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
console.log('URL:', conf.url);
console.log('Keys configured:', Object.keys(conf).filter(k => conf[k]));
