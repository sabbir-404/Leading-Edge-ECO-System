import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import pg from 'pg';
import axios from 'axios';
import FormData from 'form-data';

const { Pool } = pg;

// Connection Pool to TrueNAS PostgreSQL using the public Tailscale address
const pool = new Pool({
  host: '100.88.85.6',
  port: 5432,
  user: 'admin',
  password: 'Brown@8099',
  database: 'lesoft',
  max: 10 // Safe concurrency
});

const CSV_PATH = '/Users/sabbirislam/Desktop/Code/Leading Edge/detailed_product_database.csv';
const STORAGE_SERVER = 'http://100.88.85.6:8081'; // Tailscale Storage API

const ATTRIBUTES = [
  { name: 'materials', displayName: 'Materials' },
  { name: 'colors', displayName: 'Colors' },
  { name: 'dimensions_length', displayName: 'Length' },
  { name: 'dimensions_width', displayName: 'Width' },
  { name: 'dimensions_height', displayName: 'Height' },
  { name: 'dimensions_unit', displayName: 'Dimensions Unit' },
  { name: 'packaging_dimensions', displayName: 'Packaging Dimensions' },
  { name: 'min_doorway_clearance', displayName: 'Min Doorway Clearance' },
  { name: 'assembly_required', displayName: 'Assembly Required' },
  { name: 'weight_capacity', displayName: 'Weight Capacity' },
  { name: 'customization_options', displayName: 'Customization Options' },
  { name: 'bulk_discount_threshold', displayName: 'Bulk Discount Threshold' },
  { name: 'care_instructions', displayName: 'Care Instructions' },
  { name: 'warranty_info', displayName: 'Warranty Info' },
  { name: 'return_policy', displayName: 'Return Policy' },
  { name: 'shipping_info', displayName: 'Shipping Info' },
  { name: 'permalink', displayName: 'Website Link' }
];

// In-memory caches for database records
let attributeMap = {};
const categoryCache = {}; // name (lower) -> id
const subcategoryCache = {}; // name (lower):parent_id -> id

async function initializeCaches() {
  const dbClient = await pool.connect();
  try {
    // 1. Ensure attributes exist
    console.log('Ensuring all product attributes exist in product_attributes...');
    const attrRes = await dbClient.query("SELECT id, name FROM product_attributes WHERE company_id = 1");
    const existingAttrs = {};
    attrRes.rows.forEach(r => {
      existingAttrs[r.name.toLowerCase()] = r.id;
    });

    for (const attr of ATTRIBUTES) {
      const key = attr.displayName.toLowerCase();
      if (existingAttrs[key]) {
        attributeMap[attr.name] = existingAttrs[key];
      } else {
        const insertRes = await dbClient.query(
          "INSERT INTO product_attributes (name, input_type, options, is_active, company_id) VALUES ($1, 'text', '[]', true, 1) RETURNING id",
          [attr.displayName]
        );
        attributeMap[attr.name] = insertRes.rows[0].id;
        console.log(`Created attribute "${attr.displayName}" with ID ${insertRes.rows[0].id}`);
      }
    }

    // 2. Fetch existing stock groups (categories & subcategories)
    console.log('Caching existing stock_groups...');
    const groupRes = await dbClient.query("SELECT id, name, parent_id FROM stock_groups WHERE company_id = 1");
    groupRes.rows.forEach(r => {
      if (r.parent_id === null) {
        categoryCache[r.name.toLowerCase().trim()] = r.id;
      } else {
        subcategoryCache[`${r.name.toLowerCase().trim()}:${r.parent_id}`] = r.id;
      }
    });
    console.log(`Cached ${Object.keys(categoryCache).length} categories and ${Object.keys(subcategoryCache).length} subcategories.`);
  } finally {
    dbClient.release();
  }
}

async function resolveStockGroupId(categoryName, subcategoryName) {
  categoryName = (categoryName || '').trim() || 'Uncategorized';
  subcategoryName = (subcategoryName || '').trim();

  const catKey = categoryName.toLowerCase();
  let categoryId = categoryCache[catKey];

  // Create category if not cached
  if (!categoryId) {
    const dbClient = await pool.connect();
    try {
      // Double check in DB to prevent concurrent insert races
      const check = await dbClient.query(
        "SELECT id FROM stock_groups WHERE name = $1 AND parent_id IS NULL AND company_id = 1",
        [categoryName]
      );
      if (check.rows.length > 0) {
        categoryId = check.rows[0].id;
      } else {
        const insert = await dbClient.query(
          "INSERT INTO stock_groups (name, parent_id, company_id) VALUES ($1, null, 1) RETURNING id",
          [categoryName]
        );
        categoryId = insert.rows[0].id;
        console.log(`Created stock_group category "${categoryName}" (ID: ${categoryId})`);
      }
      categoryCache[catKey] = categoryId;
    } finally {
      dbClient.release();
    }
  }

  if (!subcategoryName) {
    return categoryId;
  }

  const subKey = `${subcategoryName.toLowerCase()}:${categoryId}`;
  let subcategoryId = subcategoryCache[subKey];

  // Create subcategory if not cached
  if (!subcategoryId) {
    const dbClient = await pool.connect();
    try {
      const check = await dbClient.query(
        "SELECT id FROM stock_groups WHERE name = $1 AND parent_id = $2 AND company_id = 1",
        [subcategoryName, categoryId]
      );
      if (check.rows.length > 0) {
        subcategoryId = check.rows[0].id;
      } else {
        const insert = await dbClient.query(
          "INSERT INTO stock_groups (name, parent_id, company_id) VALUES ($1, $2, 1) RETURNING id",
          [subcategoryName, categoryId]
        );
        subcategoryId = insert.rows[0].id;
        console.log(`Created stock_group subcategory "${subcategoryName}" under category "${categoryName}" (ID: ${subcategoryId})`);
      }
      subcategoryCache[subKey] = subcategoryId;
    } finally {
      dbClient.release();
    }
  }

  return subcategoryId;
}

// Download image from remote and upload to local NAS storage server
async function processImage(url, sku, index) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const buffer = Buffer.from(response.data);
    
    const parsedUrl = new URL(url);
    const ext = path.extname(parsedUrl.pathname) || '.jpg';
    const filename = `${sku}_${index}${ext}`;
    
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: response.headers['content-type'] });
    
    const uploadRes = await axios.post(`${STORAGE_SERVER}/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'x-subfolder': 'product-images'
      }
    });
    
    if (uploadRes.data && uploadRes.data.success) {
      // Construct the absolute HTTP URL pointing to port 8081
      return `${STORAGE_SERVER}/files/product-images/${filename}`;
    }
    return null;
  } catch (err) {
    console.error(`[IMAGE ERROR] SKU ${sku}: Failed to process image ${url} -> ${err.message}`);
    return null;
  }
}

async function processProduct(row, index) {
  const sku = (row.sku || '').trim();
  const name = (row.name || '').trim();
  if (!sku || !name) return { success: false, status: 'skipped', reason: 'empty sku or name' };

  try {
    const stockGroupId = await resolveStockGroupId(row.category, row.subcategory);

    // Process images if present
    const uploadedUrls = [];
    if (row.image_urls && row.image_urls.trim()) {
      const urls = row.image_urls.split(',')
        .map(u => u.trim())
        .filter(u => u.startsWith('http://') || u.startsWith('https://'));
      
      for (let i = 0; i < urls.length; i++) {
        const uploaded = await processImage(urls[i], sku, i);
        if (uploaded) uploadedUrls.push(uploaded);
      }
    }

    const imagePath = uploadedUrls[0] || '';
    const imageGallery = JSON.stringify(uploadedUrls);
    const price = parseFloat(row.price) || 0;

    // Build specs JSON object
    const specs = {};
    ATTRIBUTES.forEach(attr => {
      if (row[attr.name] && row[attr.name].trim()) {
        specs[attr.name] = row[attr.name].trim();
      }
    });

    const dbClient = await pool.connect();
    try {
      // Find or insert product
      const check = await dbClient.query("SELECT id FROM products WHERE sku = $1", [sku]);
      let productId;
      let status = 'inserted';

      if (check.rows.length > 0) {
        productId = check.rows[0].id;
        status = 'updated';
        await dbClient.query(
          `UPDATE products SET
            name = $1, category = $2, selling_price = $3, purchase_price = $4,
            description = $5, image_path = $6, stock_group_id = $7, specs = $8,
            image_gallery = $9, is_active = true, last_modified = NOW()
          WHERE id = $10`,
          [name, row.category || '', price, price, row.description || '', imagePath, stockGroupId, specs, imageGallery, productId]
        );
      } else {
        const insert = await dbClient.query(
          `INSERT INTO products (
            name, sku, category, selling_price, purchase_price, description, 
            image_path, stock_group_id, specs, image_gallery, company_id, 
            quantity, is_active, status, low_stock_threshold, low_stock_alert_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, 0, true, 'active', 0, false)
          RETURNING id`,
          [name, sku, row.category || '', price, price, row.description || '', imagePath, stockGroupId, specs, imageGallery]
        );
        productId = insert.rows[0].id;
      }

      // Sync attribute values
      await dbClient.query("DELETE FROM product_attribute_values WHERE product_id = $1", [productId]);
      for (const attr of ATTRIBUTES) {
        const val = (row[attr.name] || '').trim();
        if (val) {
          const attrId = attributeMap[attr.name];
          await dbClient.query(
            "INSERT INTO product_attribute_values (product_id, attribute_id, value, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())",
            [productId, attrId, val]
          );
        }
      }
      return { success: true, status, sku };
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error(`[DB ERROR] SKU ${sku}: Failed to upsert product: ${err.message}`);
    return { success: false, status: 'error', sku, error: err.message };
  }
}

// Concurrency-controlled worker pool
async function runImport(rows, concurrencyLimit) {
  let index = 0;
  const stats = { inserted: 0, updated: 0, skipped: 0, error: 0 };
  const total = rows.length;

  console.log(`Starting migration of ${total} products with a concurrency limit of ${concurrencyLimit}...`);

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const row = rows[currentIndex];
      
      const result = await processProduct(row, currentIndex);
      stats[result.status]++;

      if (currentIndex > 0 && currentIndex % 50 === 0) {
        console.log(`[PROGRESS] Processed ${currentIndex} / ${total} products... (Inserts: ${stats.inserted}, Updates: ${stats.updated}, Errors: ${stats.error})`);
      }
    }
  }

  const workers = Array(concurrencyLimit).fill(null).map(worker);
  await Promise.all(workers);
  return stats;
}

async function main() {
  const startTime = Date.now();
  console.log('Initializing database caches and setting up attributes...');
  await initializeCaches();

  const rows = [];
  console.log(`Reading CSV file: ${CSV_PATH}`);
  
  fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', (row) => {
      rows.push(row);
    })
    .on('end', async () => {
      console.log(`CSV reading complete. Parsed ${rows.length} rows.`);
      
      // Run the concurrency pool (5 workers is safe to avoid LiteSpeed/NAS rate limits)
      const stats = await runImport(rows, 5);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('\n======================================');
      console.log('🎉 Migration Pipeline Complete!');
      console.log(`Duration: ${duration} seconds`);
      console.log('--------------------------------------');
      console.log(`Products Inserted: ${stats.inserted}`);
      console.log(`Products Updated:  ${stats.updated}`);
      console.log(`Skipped Rows:      ${stats.skipped}`);
      console.log(`Database Errors:   ${stats.error}`);
      console.log('======================================');
      
      await pool.end();
      process.exit(0);
    });
}

main().catch(async (err) => {
  console.error('Migration aborted due to fatal error:', err);
  await pool.end();
  process.exit(1);
});
