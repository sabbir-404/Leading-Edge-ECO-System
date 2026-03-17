/**
 * import_showroom_stock.js
 * Specialized script to import stock from "Stock ss.csv" into Supabase.
 * OPTIMIZED version with batching.
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPABASE_URL = 'https://ildkkgjrolcjijwfokek.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CSV_PATH = 'D:/Code/Leading Edge/Stock ss.csv';

async function run() {
    console.log('🚀 Starting OPTIMIZED Showroom Stock Import...');

    try {
        console.log('🧹 Clearing existing products and stock groups...');
        await supabase.from('products').delete().neq('id', 0);
        await supabase.from('stock_groups').delete().neq('id', 0);
        console.log('✅ Previous stock cleared.');

        console.log(`📖 Reading ${CSV_PATH}...`);
        const workbook = XLSX.readFile(CSV_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        let rootGroupId = null;
        let subGroupId = null;
        let currentRootName = '';

        const unitsMap = new Map();
        async function getUnitId(name) {
            if (unitsMap.has(name)) return unitsMap.get(name);
            const { data: u } = await supabase.from('units').select('id').eq('name', name).maybeSingle();
            if (u) {
                unitsMap.set(name, u.id);
                return u.id;
            }
            const { data: newU, error } = await supabase.from('units').insert({ name, symbol: name, company_id: 1 }).select('id').single();
            if (error) throw error;
            unitsMap.set(name, newU.id);
            return newU.id;
        }

        const productsToInsert = [];
        const BATCH_SIZE = 100;

        for (const row of data) {
            const particular = (row['Particular'] || row['__EMPTY'] || '').toString().trim();
            if (!particular) continue;

            const quantityStr = (row['Quantity'] || '').toString().trim();
            const rateStr = (row['Rate'] || '').toString().trim();

            if (!quantityStr && !rateStr) {
                // It's a Group
                if (particular === 'ALUMINIUM PROFILE' || particular === 'BOARD' || particular === 'CUP-BOARD ACCESSORIES' || particular === 'FURNITURE' || particular === 'HARDWARE' || particular === '01P-IMPORTED GOODS') {
                    console.log(`📦 Root Group: ${particular}`);
                    const { data: g } = await supabase.from('stock_groups').insert({ name: particular, company_id: 1 }).select('id').single();
                    rootGroupId = g.id;
                    subGroupId = null;
                    currentRootName = particular;
                } else {
                    console.log(`  📂 Sub-Group: ${particular} (under ${currentRootName})`);
                    const { data: sg } = await supabase.from('stock_groups').insert({ name: particular, parent_id: rootGroupId, company_id: 1 }).select('id').single();
                    subGroupId = sg.id;
                }
                continue;
            }

            if (quantityStr) {
                const match = quantityStr.match(/(-?\d+\.?\d*)\s*(.*)/);
                const quantity = match ? parseFloat(match[1]) : 0;
                const unitName = match ? match[2].trim() : 'Pcs';
                const unitId = await getUnitId(unitName);
                const rate = parseFloat(rateStr) || 0;
                const skuMatch = particular.match(/(\d{2}-\d{4,5})/);
                const sku = skuMatch ? skuMatch[1] : '';

                productsToInsert.push({
                    name: particular,
                    sku: sku,
                    quantity: quantity,
                    purchase_price: rate,
                    selling_price: rate,
                    unit_id: unitId,
                    stock_group_id: subGroupId || rootGroupId,
                    company_id: 1,
                    description: `Showroom Stock Import`
                });

                if (productsToInsert.length >= BATCH_SIZE) {
                    const { error } = await supabase.from('products').insert(productsToInsert);
                    if (error) console.error('❌ Batch Product Error:', error.message);
                    productsToInsert.length = 0;
                    console.log(`   ✅ Inserted ${BATCH_SIZE} products...`);
                }
            }
        }

        // Final batch
        if (productsToInsert.length > 0) {
            const { error } = await supabase.from('products').insert(productsToInsert);
            if (error) console.error('❌ Final Batch Product Error:', error.message);
            console.log(`   ✅ Inserted final ${productsToInsert.length} products.`);
        }

        console.log('✨ Optimized Import completed!');

    } catch (error) {
        console.error('💥 Fatal Error:', error.message);
    }
}

run();
