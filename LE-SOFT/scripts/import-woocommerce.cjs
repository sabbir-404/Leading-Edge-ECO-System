/**
 * Standalone script to import WooCommerce CSV products into LE-SOFT SQLite database.
 * Run with: node scripts/import-woocommerce.js <csv_file_path>
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Database path — same as the Electron app uses
const dbPath = path.join(process.env.APPDATA || '', 'le-soft', 'le_soft.db');
console.log('Database path:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('Database not found at:', dbPath);
    // Try alternative paths
    const altPaths = [
        path.join(process.env.APPDATA || '', 'LE-SOFT', 'le_soft.db'),
        path.join(process.env.APPDATA || '', 'le-soft', 'le_soft.db'),
    ];
    let found = false;
    for (const p of altPaths) {
        if (fs.existsSync(p)) {
            console.log('Found DB at:', p);
            found = true;
            break;
        }
    }
    if (!found) {
        console.log('Searching for le_soft.db in AppData...');
        const appData = process.env.APPDATA || '';
        // List directories to find it
        try {
            const dirs = fs.readdirSync(appData);
            for (const d of dirs) {
                const candidate = path.join(appData, d, 'le_soft.db');
                if (fs.existsSync(candidate)) {
                    console.log('Found DB at:', candidate);
                    break;
                }
            }
        } catch (e) { }
    }
    process.exit(1);
}

const csvFilePath = process.argv[2] || path.join(__dirname, '..', '..', 'product_export_2026-02-20-01-05-31.csv');
console.log('CSV file:', csvFilePath);

if (!fs.existsSync(csvFilePath)) {
    console.error('CSV file not found at:', csvFilePath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

function stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

async function runImport() {
    let raw = fs.readFileSync(csvFilePath, 'utf-8');
    // Strip UTF-8 BOM if present
    if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
    }

    // Split into lines, handling multiline quoted fields
    const lines = [];
    let currentLine = '';
    let inQuotes = false;
    for (const ch of raw) {
        if (ch === '"') inQuotes = !inQuotes;
        if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (currentLine.trim()) lines.push(currentLine);
            currentLine = '';
        } else if (ch !== '\r' || inQuotes) {
            currentLine += ch;
        }
    }
    if (currentLine.trim()) lines.push(currentLine);

    console.log(`Total CSV lines (logical records): ${lines.length}`);

    if (lines.length < 2) {
        console.error('CSV has no data rows');
        return;
    }

    // Parse header
    const headers = parseCSVLine(lines[0]);
    const colIndex = (name) => headers.indexOf(name);

    const iTitle = colIndex('post_title');
    const iSku = colIndex('sku');
    const iPrice = colIndex('regular_price');
    const iSalePrice = colIndex('sale_price');
    const iStock = colIndex('stock');
    const iStatus = colIndex('post_status');
    const iParent = colIndex('post_parent');
    const iExcerpt = colIndex('post_excerpt');
    const iImages = colIndex('images');
    const iCategory = colIndex('tax:product_cat');
    const iType = colIndex('tax:product_type');

    console.log('Column indices - title:', iTitle, 'sku:', iSku, 'price:', iPrice, 'stock:', iStock, 'category:', iCategory, 'type:', iType);

    // Ensure a "Pieces" unit exists
    const unitId = await new Promise((res, rej) => {
        db.get("SELECT id FROM units WHERE symbol = 'pcs' OR name = 'Pieces'", (err, row) => {
            if (err) return rej(err);
            if (row) return res(row.id);
            db.run("INSERT INTO units (name, symbol, precision, company_id) VALUES ('Pieces', 'pcs', 0, 1)", function (err) {
                if (err) return rej(err);
                res(this.lastID);
            });
        });
    });
    console.log('Unit ID (Pieces):', unitId);

    // Collect unique categories and create stock_groups
    const categoryMap = new Map();
    // Load existing stock groups
    const existingGroups = await new Promise((res, rej) => {
        db.all("SELECT id, name FROM stock_groups", (err, rows) => {
            if (err) return rej(err);
            res(rows || []);
        });
    });
    existingGroups.forEach(g => categoryMap.set(g.name.toLowerCase(), g.id));
    console.log('Existing stock groups:', existingGroups.length);

    // First pass: collect all categories
    const allCategories = new Set();
    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (iCategory >= 0 && fields[iCategory]) {
            const cats = fields[iCategory].split('|').map(c => c.trim()).filter(Boolean);
            cats.forEach(c => {
                const parts = c.split('>').map(p => p.trim());
                parts.forEach(p => { if (p) allCategories.add(p); });
            });
        }
    }
    console.log('Unique categories found:', allCategories.size);

    // Create missing stock groups
    for (const cat of allCategories) {
        if (!categoryMap.has(cat.toLowerCase())) {
            const groupId = await new Promise((res, rej) => {
                db.run("INSERT INTO stock_groups (name, company_id) VALUES (?, 1)", [cat], function (err) {
                    if (err) return rej(err);
                    res(this.lastID);
                });
            });
            categoryMap.set(cat.toLowerCase(), groupId);
        }
    }
    console.log('Total stock groups after insert:', categoryMap.size);

    // Ensure products table has the extra columns
    await new Promise((res) => {
        db.run("ALTER TABLE products ADD COLUMN image_path TEXT", () => res());
    });
    await new Promise((res) => {
        db.run("ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 0", () => res());
    });

    // Import products
    let imported = 0;
    let skipped = 0;
    const errors = [];

    const stmt = db.prepare(`INSERT INTO products (name, sku, category, purchase_price, selling_price, tax_rate, description, unit_id, stock_group_id, company_id, image_path, quantity) VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, 1, ?, ?)`);

    for (let i = 1; i < lines.length; i++) {
        try {
            const fields = parseCSVLine(lines[i]);

            const title = fields[iTitle]?.trim();
            if (!title) { skipped++; continue; }

            // Skip variations (have post_parent)
            const parent = fields[iParent]?.trim();
            if (parent && parent !== '' && parent !== '0') { skipped++; continue; }

            // Skip certain product types that aren't standalone
            const pType = iType >= 0 ? fields[iType]?.trim().toLowerCase() : '';
            if (pType === 'variation') { skipped++; continue; }

            const sku = fields[iSku]?.trim() || '';
            const priceStr = fields[iPrice]?.trim() || fields[iSalePrice]?.trim() || '0';
            const price = parseFloat(priceStr) || 0;
            const stockStr = fields[iStock]?.trim() || '0';
            const stock = parseInt(stockStr) || 0;
            const excerpt = iExcerpt >= 0 ? stripHTML(fields[iExcerpt] || '') : '';
            const description = excerpt.substring(0, 500);

            // Extract first image URL
            let imagePath = '';
            if (iImages >= 0 && fields[iImages]) {
                const imgField = fields[iImages].trim();
                const firstImg = imgField.split('|')[0].trim();
                imagePath = firstImg.split('!')[0].trim();
            }

            // Category
            const categoryRaw = iCategory >= 0 ? (fields[iCategory]?.trim() || '') : '';
            const category = categoryRaw.replace(/\|/g, ', ');

            // Stock group from first category
            let stockGroupId = null;
            if (categoryRaw) {
                const firstCat = categoryRaw.split('|')[0].split('>').map(s => s.trim()).filter(Boolean);
                const primary = firstCat[firstCat.length - 1];
                if (primary && categoryMap.has(primary.toLowerCase())) {
                    stockGroupId = categoryMap.get(primary.toLowerCase()) || null;
                }
            }

            await new Promise((res, rej) => {
                stmt.run([title, sku, category, price, description, unitId, stockGroupId, imagePath, stock], (err) => {
                    if (err) { errors.push(`Row ${i}: ${err.message}`); skipped++; rej(err); }
                    else { imported++; res(); }
                });
            }).catch(() => { });
        } catch (rowErr) {
            errors.push(`Row ${i}: ${rowErr.message}`);
            skipped++;
        }

        if (i % 100 === 0) {
            process.stdout.write(`\rProgress: ${i}/${lines.length - 1} rows processed...`);
        }
    }

    stmt.finalize();
    console.log(`\n\n=== Import Complete ===`);
    console.log(`Imported: ${imported}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors.length}`);
    if (errors.length > 0) {
        console.log('First 10 errors:');
        errors.slice(0, 10).forEach(e => console.log('  -', e));
    }

    // Verification
    const count = await new Promise((res, rej) => {
        db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
            if (err) return rej(err);
            res(row.count);
        });
    });
    console.log(`\nTotal products in database: ${count}`);

    const sample = await new Promise((res, rej) => {
        db.all("SELECT id, name, sku, selling_price, category, quantity FROM products LIMIT 5", (err, rows) => {
            if (err) return rej(err);
            res(rows);
        });
    });
    console.log('\nSample products:');
    console.table(sample);

    db.close();
}

runImport().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
