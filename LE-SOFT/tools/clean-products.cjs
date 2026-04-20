#!/usr/bin/env node
/**
 * clean-products.cjs
 * Deletes all rows from the products table (and related data) in your Supabase database.
 * Run: cd LE-SOFT && node tools/clean-products.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Try to load config from local override file ───────────────────────────────
let supabaseUrl = '';
let supabaseKey = '';

const localConfigPath = path.join(__dirname, '..', 'electron', 'supabase.local.json');
if (fs.existsSync(localConfigPath)) {
    const cfg = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    supabaseUrl = cfg.url || cfg.supabaseUrl || '';
    supabaseKey = cfg.key || cfg.supabaseKey || cfg.anonKey || '';
    console.log('✅ Loaded Supabase config from supabase.local.json');
}

// ── Tables to clean in FK-safe order (dependents first, products last) ────────
// Use { table, idColumn } — idColumn is used for the delete filter.
// UUID columns: use 'id' and filter with not('id', 'is', null)
// Integer columns: same approach
const TABLES_TO_CLEAN = [
    { table: 'product_price_history',   idCol: 'id' },
    { table: 'exchange_items',          idCol: 'id' },  // ← FK: exchange_items.product_id → products.id
    { table: 'bill_items',              idCol: 'id' },
    { table: 'market_analysis_history', idCol: 'id' },
    { table: 'website_products',        idCol: 'id', optional: true },
    { table: 'products',                idCol: 'id' },  // ← main table, cleared last
];

async function run() {
    if (!supabaseUrl || !supabaseKey) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q) => new Promise(r => rl.question(q, r));
        supabaseUrl = await ask('Supabase URL: ');
        supabaseKey = await ask('Supabase Service Role Key (NOT anon key): ');
        rl.close();
    }

    const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());

    console.log('\n⚠️  WARNING: This will delete ALL rows from the following tables:');
    TABLES_TO_CLEAN.forEach(t => console.log(`   - ${t.table}${t.optional ? ' (optional)' : ''}`));
    console.log('\nThis cannot be undone!\n');

    // 5-second countdown
    for (let i = 5; i > 0; i--) {
        process.stdout.write(`\rStarting in ${i}s... (Ctrl+C to abort) `);
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log('\n');

    let allOk = true;
    for (const { table, idCol, optional } of TABLES_TO_CLEAN) {
        process.stdout.write(`Cleaning ${table}... `);
        const { error } = await supabase
            .from(table)
            .delete()
            .not(idCol, 'is', null);   // works for both UUID and integer PKs

        if (error) {
            const notFound = error.code === '42P01'
                || error.message?.includes('does not exist')
                || error.message?.includes('schema cache');
            if (notFound && optional) {
                console.log(`⚠️  Table not found, skipping (optional).`);
            } else if (notFound) {
                console.log(`⚠️  Table not found, skipping.`);
            } else {
                console.log(`❌ Error: ${error.message}`);
                allOk = false;
            }
        } else {
            console.log(`✅ Cleared`);
        }
    }

    console.log(allOk
        ? '\n✅ Product database cleaned successfully!'
        : '\n⚠️  Some tables had errors. Check output above.'
    );
    process.exit(allOk ? 0 : 1);
}

run().catch(err => { console.error('\n❌ Fatal:', err.message); process.exit(1); });
