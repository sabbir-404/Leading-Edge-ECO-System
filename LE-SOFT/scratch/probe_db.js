import pg from 'pg';
const { Client } = pg;

async function test(host) {
  console.log(`Testing connection to host ${host}...`);
  const client = new Client({
    host,
    port: 5432,
    user: 'admin',
    password: 'Brown@8099',
    database: 'lesoft',
    connectionTimeoutMillis: 5000
  });
  try {
    await client.connect();
    console.log(`✅ Success for ${host}!`);
    const res = await client.query('SELECT count(*) FROM products');
    console.log(`   Product count: ${res.rows[0].count}`);
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ Failed for ${host}: ${err.message}`);
    return false;
  }
}

async function run() {
  await test('192.168.1.14');
  await test('100.88.85.6');
  process.exit(0);
}

run();
