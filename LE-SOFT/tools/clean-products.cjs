#!/usr/bin/env node
/**
 * clean-products.cjs
 * Deletes all rows from the products table (and related data) in your Supabase database.
 * Run with: node tools/clean-products.cjs
 *
 * This script reads your Supabase config from electron/supabase.ts local override
 * or prompts you to enter the URL + key directly.
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

// ── Tables to clean (order matters — dependents first) ────────────────────────
// These are all tables that reference products by product_id or similar FK
const TABLES_TO_CLEAN = [
    'product_price_history',    // price history rows
    'bill_items',               // bill line items referencing products
    'stock_movements',          // stock movement logs
    'competitor_urls',          // AI market analysis URLs
    'market_analysis_history',  // AI analysis history
    'products',                 // ← main products table, cleaned last
];

async function run() {
    if (!supabaseUrl || !supabaseKey) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q) => new Promise(r => rl.question(q, r));
        supabaseUrl = await ask('Supabase URL: ');
        supabaseKey = await ask('Supabase Service Role Key (NOT anon key): ');
        rl.close();
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('\n⚠️  WARNING: This will delete ALL rows from the following tables:');
    TABLES_TO_CLEAN.forEach(t => console.log(`   - ${t}`));
    console.log('\nThis cannot be undone!\n');

    // Simple 5-second countdown
    for (let i = 5; i > 0; i--) {
        process.stdout.write(`\rStarting in ${i}s... (Ctrl+C to abort) `);
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log('\n');

    let allOk = true;
    for (const table of TABLES_TO_CLEAN) {
        process.stdout.write(`Cleaning ${table}... `);
        const { error, count } = await supabase.from(table).delete().neq('id', 0);
        if (error) {
            // Some tables may not exist yet — that's fine
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                console.log(`⚠️  Table not found, skipping.`);
            } else {
                console.log(`❌ Error: ${error.message}`);
                allOk = false;
            }
        } else {
            console.log(`✅ Cleared`);
        }
    }

    if (allOk) {
        console.log('\n✅ Product database cleaned successfully!');
    } else {
        console.log('\n⚠️  Some tables had errors. Check output above.');
    }
}

run().catch(console.error);
