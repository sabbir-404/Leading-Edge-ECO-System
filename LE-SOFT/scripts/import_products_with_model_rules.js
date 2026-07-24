import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import pg from 'pg';
import axios from 'axios';
import FormData from 'form-data';

const { Pool } = pg;

const pool = new Pool({
  host: '100.88.85.6',
  port: 5432,
  user: 'admin',
  password: 'Brown@8099',
  database: 'lesoft',
  max: 10
});

const CSV_PATH = '/Users/sabbirislam/Desktop/Code/Leading Edge/detailed_product_database.csv';
const STORAGE_SERVER = 'http://100.88.85.6:8081';

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

const GROUP_CODE_MAPPING = {
  'lighting': '10',
  'light': '10',
  'lamp': '10',
  'hardware': '11',
  'others': '11', // Map Others to Hardware
  'kitchenware': '31',
  'kitchen': '31',
  'table': '13',
  'board': '14',
  'chair': '15',
  'aluminium profile': '16',
  'aluminium': '16',
  'sofa': '17',
  'furniture': '18'
};

function getGroupCode(categoryName) {
  const cat = (categoryName || '').toLowerCase().trim();
  for (const [key, code] of Object.entries(GROUP_CODE_MAPPING)) {
    if (cat.includes(key)) {
      return code;
    }
  }
  return '11'; // Default to Hardware/Others
}

let attributeMap = {};
const categoryCache = {};
const subcategoryCache = {};
const rulesCache = {};

async function initializeCaches() {
  const dbClient = await pool.connect();
  try {
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

  if (!categoryId) {
    const dbClient = await pool.connect();
    try {
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

// Check storage and re-host image
async function processImage(url, originalSku, index) {
  try {
    const parsedUrl = new URL(url);
    const ext = path.extname(parsedUrl.pathname) || '.jpg';
    const filename = `${originalSku}_${index}${ext}`;
    const expectedUrl = `${STORAGE_SERVER}/files/product-images/${filename}`;

    // Test HEAD request to see if it already exists on TrueNAS SCALE storage
    try {
      const headRes = await axios.head(expectedUrl, { timeout: 3000 });
      if (headRes.status === 200) {
        return expectedUrl; // Reuse existing image!
      }
    } catch (e) {
      // Doesn't exist, proceed to download and upload
    }

    // Download from remote
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const buffer = Buffer.from(response.data);
    
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: response.headers['content-type'] });
    
    const uploadRes = await axios.post(`${STORAGE_SERVER}/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'x-subfolder': 'product-images'
      }
    });
    
    if (uploadRes.data && uploadRes.data.success) {
      return expectedUrl;
    }
    return null;
  } catch (err) {
    console.error(`[IMAGE ERROR] Sku ${originalSku}: Failed image ${url} -> ${err.message}`);
    return null;
  }
}

function parseSku(sku, categoryName, productId) {
  let originType = 'IMPORTED';
  let originCode = '01';
  
  sku = (sku || '').trim();
  
  let prefix = '';
  let suffix = sku;
  const dashIndex = sku.indexOf('-');
  if (dashIndex !== -1) {
    prefix = sku.substring(0, dashIndex);
    suffix = sku.substring(dashIndex + 1);
  }

  let prefixVariant = '';
  if (prefix) {
    if (prefix === '02') {
      originType = 'LOCAL';
      originCode = '02';
    } else if (prefix === '01') {
      originType = 'IMPORTED';
      originCode = '01';
    } else if (prefix.endsWith('02')) {
      originType = 'LOCAL';
      originCode = '02';
      prefixVariant = prefix.substring(0, prefix.length - 2);
    } else if (prefix.endsWith('01')) {
      originType = 'IMPORTED';
      originCode = '01';
      prefixVariant = prefix.substring(0, prefix.length - 2);
    } else {
      originType = 'IMPORTED';
      originCode = '01';
      prefixVariant = prefix;
    }
  }

  const groupCode = getGroupCode(categoryName);

  // Extract leading digits for serial
  const match = suffix.match(/^([0-9]+)(.*)$/);
  let serialInt;
  let serialText = '';
  let suffixVariant = '';

  if (match) {
    serialInt = parseInt(match[1], 10);
    serialText = match[1];
    suffixVariant = match[2];
  } else {
    serialInt = productId;
    serialText = String(productId).padStart(4, '0');
    suffixVariant = suffix ? '_' + suffix : '';
  }

  let finalVariant = '';
  if (prefixVariant) finalVariant += '-' + prefixVariant;
  if (suffixVariant) finalVariant += suffixVariant;

  return {
    originType,
    originCode,
    groupCode,
    serialInt,
    serialText,
    variant: finalVariant
  };
}

const generatedCodesMap = new Map();

async function processProduct(row, index) {
  const originalSku = (row.sku || '').trim();
  const name = (row.name || '').trim();
  if (!originalSku || !name) return { success: false, status: 'skipped', reason: 'empty sku or name' };

  try {
    const stockGroupId = row.resolvedStockGroupId;
    const categoryName = row.category || '';

    // Process images
    const uploadedUrls = [];
    if (row.image_urls && row.image_urls.trim()) {
      const urls = row.image_urls.split(',')
        .map(u => u.trim())
        .filter(u => u.startsWith('http://') || u.startsWith('https://'));
      
      for (let i = 0; i < urls.length; i++) {
        const uploaded = await processImage(urls[i], originalSku, i);
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

    // Parse model rules code
    const parsed = parseSku(originalSku, categoryName, index + 10000);
    
    // Look up rule from cache
    const ruleKey = `${parsed.originType}:${stockGroupId}`;
    const rule = rulesCache[ruleKey];
    if (!rule) {
      throw new Error(`Model rule not found in cache for ${ruleKey}`);
    }

    const serialText = String(parsed.serialInt).padStart(Number(rule.serial_padding) || 4, '0');
    const baseCode = `${rule.origin_code}.${rule.group_code}.00.${serialText}${parsed.variant}`;

    // Uniqueness resolution
    let finalCode = baseCode;
    let counter = 1;
    while (generatedCodesMap.has(finalCode)) {
      counter++;
      finalCode = `${baseCode}-${counter}`;
    }
    generatedCodesMap.set(finalCode, true);

    const dbClient = await pool.connect();
    try {
      // Insert product
      const insert = await dbClient.query(
        `INSERT INTO products (
          name, sku, product_code, model_number, origin_type, import_type_code, model_group_code, 
          batch_code, serial_number, category, selling_price, purchase_price, description, 
          image_path, stock_group_id, specs, image_gallery, company_id, 
          quantity, is_active, status, low_stock_threshold, low_stock_alert_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '00', $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, 0, true, 'active', 0, false)
        RETURNING id`,
        [name, finalCode, finalCode, finalCode, parsed.originType, rule.origin_code, rule.group_code, parsed.serialInt,
         row.category || '', price, price, row.description || '', imagePath, stockGroupId, specs, imageGallery]
      );
      const productId = insert.rows[0].id;

      // Sync attributes
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
      return { success: true, status: 'inserted', sku: finalCode };
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error(`[DB ERROR] Original Sku ${originalSku}: Failed to insert product: ${err.message}`);
    return { success: false, status: 'error', sku: originalSku, error: err.message };
  }
}

// Concurrency worker pool
async function runImport(rows, concurrencyLimit) {
  let index = 0;
  const stats = { inserted: 0, skipped: 0, error: 0 };
  const total = rows.length;

  console.log(`Starting migration of ${total} products with a concurrency limit of ${concurrencyLimit}...`);

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const row = rows[currentIndex];
      
      const result = await processProduct(row, currentIndex);
      stats[result.status]++;

      if (currentIndex > 0 && currentIndex % 100 === 0) {
        console.log(`[PROGRESS] Processed ${currentIndex} / ${total} products... (Inserts: ${stats.inserted}, Errors: ${stats.error})`);
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

  // ----------------------------------------------------
  // PARSE AND IMPORT PRODUCTS FROM CSV
  // ----------------------------------------------------
  const rows = [];
  console.log(`Reading CSV file: ${CSV_PATH}`);
  
  fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', (row) => {
      rows.push(row);
    })
    .on('end', async () => {
      console.log(`CSV reading complete. Parsed ${rows.length} rows.`);
      
      console.log('Resolving stock groups for all CSV rows...');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        row.resolvedStockGroupId = await resolveStockGroupId(row.category, row.subcategory);
      }
      console.log('Stock groups resolution complete.');

      // ----------------------------------------------------
      // STEP A: SEED MODEL RULES FOR ALL STOCK GROUPS
      // ----------------------------------------------------
      console.log('Seeding missing product model rules...');
      const dbClient = await pool.connect();
      let rulesCreated = 0;
      try {
        console.log('Fetching active stock groups from database...');
        const groupsRes = await dbClient.query('SELECT id, name, parent_id FROM stock_groups WHERE company_id = 1');
        const stockGroups = groupsRes.rows;

        const rulesRes = await dbClient.query('SELECT origin_type, stock_group_id FROM product_model_rules WHERE company_id = 1');
        const existingRulesSet = new Set(rulesRes.rows.map(r => `${r.origin_type}:${r.stock_group_id}`));

        const groupParentMap = {};
        stockGroups.forEach(sg => {
          let parentName = '';
          if (sg.parent_id) {
            const parent = stockGroups.find(p => p.id === sg.parent_id);
            if (parent) parentName = parent.name;
          }
          groupParentMap[sg.id] = parentName || sg.name;
        });

        for (const sg of stockGroups) {
          const parentCategory = groupParentMap[sg.id];
          const groupCode = getGroupCode(parentCategory);

          // IMPORTED rule
          const impKey = `IMPORTED:${sg.id}`;
          if (!existingRulesSet.has(impKey)) {
            await dbClient.query(`
              INSERT INTO product_model_rules (
                name, origin_type, origin_code, stock_group_id, group_code, 
                batch_sequence, serial_padding, is_active, company_id, is_customizable, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 1, 4, true, 1, false, NOW(), NOW())
            `, [`${sg.name} Imported`, 'IMPORTED', '01', sg.id, groupCode]);
            rulesCreated++;
          }

          // LOCAL rule
          const locKey = `LOCAL:${sg.id}`;
          if (!existingRulesSet.has(locKey)) {
            await dbClient.query(`
              INSERT INTO product_model_rules (
                name, origin_type, origin_code, stock_group_id, group_code, 
                batch_sequence, serial_padding, is_active, company_id, is_customizable, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, 1, 4, true, 1, false, NOW(), NOW())
            `, [`${sg.name} Local`, 'LOCAL', '02', sg.id, groupCode]);
            rulesCreated++;
          }
        }
      } finally {
        dbClient.release();
      }
      console.log(`Created/verified ${rulesCreated} product model rules.`);

      // ----------------------------------------------------
      // STEP B: CACHE ALL MODEL RULES IN MEMORY
      // ----------------------------------------------------
      console.log('Caching all product model rules...');
      const dbClientForCache = await pool.connect();
      try {
        const rulesRes = await dbClientForCache.query(
          'SELECT origin_type, stock_group_id, origin_code, group_code, serial_padding FROM product_model_rules WHERE company_id = 1'
        );
        rulesRes.rows.forEach(r => {
          rulesCache[`${r.origin_type}:${r.stock_group_id}`] = {
            origin_code: r.origin_code,
            group_code: r.group_code,
            serial_padding: r.serial_padding
          };
        });
      } finally {
        dbClientForCache.release();
      }
      console.log(`Cached ${Object.keys(rulesCache).length} model rules.`);

      // ----------------------------------------------------
      // STEP C: RUN CONCURRENT IMPORT OF PRODUCTS
      // ----------------------------------------------------
      // Concurrency of 10 is fast since image checks are local HEAD requests
      const stats = await runImport(rows, 10);

      // ----------------------------------------------------
      // STEP D: APPLY MANUAL OVERRIDES FOR PRE-EXISTING PRODUCTS
      // ----------------------------------------------------
      console.log('Applying manual overrides for pre-existing products...');
      const client = await pool.connect();
      try {
        const overrides = [
          { id: 4737, sku: '01.11.00.1234-test', origin_type: 'IMPORTED', origin_code: '01', group_code: '11', serial: 1234 },
          { id: 4738, sku: '01.10.00.5228-test', origin_type: 'IMPORTED', origin_code: '01', group_code: '10', serial: 5228 },
          { id: 4739, sku: '02.11.00.0001-test', origin_type: 'LOCAL', origin_code: '02', group_code: '11', serial: 1 },
          { id: 4740, sku: '01.31.00.0001-test', origin_type: 'IMPORTED', origin_code: '01', group_code: '31', serial: 1 },
          { id: 4741, sku: '01.11.00.0101-test', origin_type: 'IMPORTED', origin_code: '01', group_code: '11', serial: 101 }
        ];

        for (const ov of overrides) {
          await client.query(`
            UPDATE products SET
              sku = $1,
              product_code = $2,
              model_number = $3,
              origin_type = $4,
              import_type_code = $5,
              model_group_code = $6,
              batch_code = '00',
              serial_number = $7,
              last_modified = NOW()
            WHERE id = $8 AND company_id = 1
          `, [ov.sku, ov.sku, ov.sku, ov.origin_type, ov.origin_code, ov.group_code, ov.serial, ov.id]);
        }
      } finally {
        client.release();
      }
      console.log('Overrides applied.');

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('\n======================================');
      console.log('🎉 Migration Pipeline Complete!');
      console.log(`Duration: ${duration} seconds`);
      console.log('--------------------------------------');
      console.log(`Products Inserted: ${stats.inserted}`);
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
