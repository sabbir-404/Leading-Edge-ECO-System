import fs from 'fs';
import csv from 'csv-parser';
import pg from 'pg';
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

async function main() {
  const startTime = Date.now();
  console.log('Connecting to PostgreSQL database at 100.88.85.6...');
  const client = await pool.connect();

  try {
    // ----------------------------------------------------
    // STEP 1: CREATE MODEL RULES FOR ALL STOCK GROUPS
    // ----------------------------------------------------
    console.log('Fetching active stock groups from database...');
    const groupsRes = await client.query('SELECT id, name, parent_id FROM stock_groups WHERE company_id = 1');
    const stockGroups = groupsRes.rows;
    console.log(`Found ${stockGroups.length} stock groups.`);

    // Pre-cache existing rules
    const rulesRes = await client.query('SELECT origin_type, stock_group_id FROM product_model_rules WHERE company_id = 1');
    const existingRulesSet = new Set(rulesRes.rows.map(r => `${r.origin_type}:${r.stock_group_id}`));

    console.log('Creating missing product model rules...');
    let rulesCreated = 0;

    // Create mappings cache for stock group parents
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

      // Create rule for IMPORTED if not exists
      const impKey = `IMPORTED:${sg.id}`;
      if (!existingRulesSet.has(impKey)) {
        await client.query(`
          INSERT INTO product_model_rules (
            name, origin_type, origin_code, stock_group_id, group_code, 
            batch_sequence, serial_padding, is_active, company_id, is_customizable, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 1, 4, true, 1, false, NOW(), NOW())
        `, [`${sg.name} Imported`, 'IMPORTED', '01', sg.id, groupCode]);
        rulesCreated++;
      }

      // Create rule for LOCAL if not exists
      const locKey = `LOCAL:${sg.id}`;
      if (!existingRulesSet.has(locKey)) {
        await client.query(`
          INSERT INTO product_model_rules (
            name, origin_type, origin_code, stock_group_id, group_code, 
            batch_sequence, serial_padding, is_active, company_id, is_customizable, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 1, 4, true, 1, false, NOW(), NOW())
        `, [`${sg.name} Local`, 'LOCAL', '02', sg.id, groupCode]);
        rulesCreated++;
      }
    }
    console.log(`Created/verified product model rules.`);

    // ----------------------------------------------------
    // STEP 2: TEMPORARILY RESET CODES TO AVOID CONSTRAINTS
    // ----------------------------------------------------
    console.log('Temporarily resetting product codes to prevent unique constraint conflicts...');
    await client.query(`
      UPDATE products 
      SET 
        model_number = 'TEMP_' || id, 
        sku = 'TEMP_' || id, 
        product_code = 'TEMP_' || id 
      WHERE company_id = 1
    `);
    console.log('Temporary reset complete.');

    // ----------------------------------------------------
    // STEP 3: PARSE CSV AND MAP PRODUCTS BY PERMALINK
    // ----------------------------------------------------
    console.log(`Reading CSV file: ${CSV_PATH}`);
    const csvRows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on('data', (row) => {
          if (row.permalink && row.permalink.trim()) {
            csvRows.push(row);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    console.log(`Read ${csvRows.length} valid product rows from CSV.`);

    let productsUpdated = 0;
    const generatedCodesMap = new Map(); // code -> count

    // Process CSV rows
    for (const row of csvRows) {
      const permalink = row.permalink.trim();
      const categoryName = row.category || '';
      const parsed = parseSku(row.sku, categoryName, 9999); // Fallback serial if NaN
      
      const serialText = String(parsed.serialInt).padStart(4, '0');
      let baseCode = `${parsed.originCode}.${parsed.groupCode}.00.${serialText}${parsed.variant}`;
      
      // Uniqueness resolution
      let finalCode = baseCode;
      let counter = 1;
      while (generatedCodesMap.has(finalCode)) {
        counter++;
        finalCode = `${baseCode}-${counter}`;
      }
      generatedCodesMap.set(finalCode, true);

      // Update in DB by matching specs->>'permalink'
      const updateRes = await client.query(`
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
        WHERE specs->>'permalink' = $8 AND company_id = 1
      `, [finalCode, finalCode, finalCode, parsed.originType, parsed.originCode, parsed.groupCode, parsed.serialInt, permalink]);

      productsUpdated += updateRes.rowCount;
      if (productsUpdated > 0 && productsUpdated % 200 === 0) {
        console.log(`Updated ${productsUpdated} products matching CSV...`);
      }
    }

    // ----------------------------------------------------
    // STEP 4: APPLY MANUAL OVERRIDES FOR PRE-EXISTING PRODUCTS
    // ----------------------------------------------------
    console.log('Applying manual overrides for pre-existing products...');
    const overrides = [
      { id: 4737, sku: '01.11.00.1234', origin_type: 'IMPORTED', origin_code: '01', group_code: '11', serial: 1234 },
      { id: 4738, sku: '01.10.00.5228', origin_type: 'IMPORTED', origin_code: '01', group_code: '10', serial: 5228 },
      { id: 4739, sku: '02.11.00.0001', origin_type: 'LOCAL', origin_code: '02', group_code: '11', serial: 1 },
      { id: 4740, sku: '01.31.00.0001', origin_type: 'IMPORTED', origin_code: '01', group_code: '31', serial: 1 },
      { id: 4741, sku: '01.11.00.0101', origin_type: 'IMPORTED', origin_code: '01', group_code: '11', serial: 101 }
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
    console.log('Overrides applied.');

    console.log('\n======================================');
    console.log('🎉 Product Code Migration Complete!');
    console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
    console.log('--------------------------------------');
    console.log(`Rules Created/Verified:  ${rulesCreated}`);
    console.log(`Products Updated:        ${productsUpdated + overrides.length}`);
    console.log('======================================');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
