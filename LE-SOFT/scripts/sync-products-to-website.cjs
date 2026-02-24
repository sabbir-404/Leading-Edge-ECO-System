/**
 * Standalone bulk sync script: push all LE-SOFT SQLite products to MySQL website database.
 * Run with: node scripts/sync-products-to-website.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const path = require('path');

const dbPath = path.join(process.env.APPDATA || '', 'le-soft', 'le_soft.db');
const sqliteDb = new sqlite3.Database(dbPath);

async function main() {
    console.log('SQLite DB:', dbPath);

    // Connect to MySQL
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'furniture_shop',
        port: 3306,
        waitForConnections: true,
        connectionLimit: 5,
    });

    // Ensure stock and sku columns exist
    try { await pool.query('ALTER TABLE products ADD COLUMN stock INT DEFAULT 0'); console.log('Added stock column'); } catch (e) { }
    try { await pool.query('ALTER TABLE products ADD COLUMN sku VARCHAR(100)'); console.log('Added sku column'); } catch (e) { }

    // Get all products from SQLite
    const rows = await new Promise((res, rej) => {
        sqliteDb.all('SELECT id, name, sku, category, selling_price, description, image_path, quantity FROM products', (err, rows) => {
            if (err) return rej(err);
            res(rows);
        });
    });

    console.log(`Found ${rows.length} products in SQLite`);

    let synced = 0;
    let failed = 0;

    for (const row of rows) {
        const mysqlId = `lesoft-${row.id}`;
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                `INSERT INTO products (id, name, price, sale_price, on_sale, description, model_number, image, is_visible, stock, sku)
                 VALUES (?, ?, ?, 0, 0, ?, ?, ?, 1, ?, ?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), description=VALUES(description),
                 model_number=VALUES(model_number), image=VALUES(image), stock=VALUES(stock), sku=VALUES(sku)`,
                [mysqlId, row.name, row.selling_price || 0, row.description || '',
                    row.sku || '', row.image_path || '', row.quantity || 0, row.sku || '']
            );

            // Sync categories
            await conn.query('DELETE FROM product_categories WHERE product_id = ?', [mysqlId]);
            if (row.category) {
                const cats = row.category.split(',').map(c => c.trim()).filter(Boolean);
                for (const cat of cats) {
                    await conn.query('INSERT IGNORE INTO product_categories (product_id, category_name) VALUES (?, ?)', [mysqlId, cat]);
                }
            }

            await conn.commit();
            synced++;
        } catch (e) {
            await conn.rollback();
            failed++;
            if (failed <= 5) console.error(`Failed: ${row.name}:`, e.message);
        } finally {
            conn.release();
        }

        if (synced % 100 === 0) {
            process.stdout.write(`\rSynced: ${synced}/${rows.length}...`);
        }
    }

    console.log(`\n\n=== Sync Complete ===`);
    console.log(`Synced: ${synced}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${rows.length}`);

    // Verify MySQL
    const [countResult] = await pool.query('SELECT COUNT(*) as count FROM products WHERE id LIKE "lesoft-%"');
    console.log(`\nMySQL products with lesoft- prefix: ${countResult[0].count}`);

    const [sample] = await pool.query('SELECT id, name, price, stock, sku FROM products WHERE id LIKE "lesoft-%" LIMIT 5');
    console.table(sample);

    await pool.end();
    sqliteDb.close();
}

main().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});
