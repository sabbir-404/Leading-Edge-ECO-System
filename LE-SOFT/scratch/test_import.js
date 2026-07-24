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
  max: 5
});

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

async function ensureAttributes() {
  const dbClient = await pool.connect();
  const attributeMap = {};
  try {
    const res = await dbClient.query("SELECT id, name FROM product_attributes WHERE company_id = 1");
    const existing = {};
    res.rows.forEach(r => {
      existing[r.name.toLowerCase()] = r.id;
    });

    for (const attr of ATTRIBUTES) {
      const key = attr.displayName.toLowerCase();
      if (existing[key]) {
        attributeMap[attr.name] = existing[key];
        console.log(`Attribute "${attr.displayName}" already exists with ID ${existing[key]}`);
      } else {
        const insertRes = await dbClient.query(
          "INSERT INTO product_attributes (name, input_type, options, is_active, company_id) VALUES ($1, 'text', '[]', true, 1) RETURNING id",
          [attr.displayName]
        );
        attributeMap[attr.name] = insertRes.rows[0].id;
        console.log(`Created attribute "${attr.displayName}" with ID ${insertRes.rows[0].id}`);
      }
    }
  } finally {
    dbClient.release();
  }
  return attributeMap;
}

async function ensureCategory(categoryName, subcategoryName) {
  const dbClient = await pool.connect();
  try {
    categoryName = (categoryName || '').trim() || 'Uncategorized';
    
    // Check/insert category
    let catRes = await dbClient.query(
      "SELECT id FROM stock_groups WHERE name = $1 AND parent_id IS NULL AND company_id = 1",
      [categoryName]
    );
    let categoryId;
    if (catRes.rows.length > 0) {
      categoryId = catRes.rows[0].id;
    } else {
      let insertCat = await dbClient.query(
        "INSERT INTO stock_groups (name, parent_id, company_id) VALUES ($1, null, 1) RETURNING id",
        [categoryName]
      );
      categoryId = insertCat.rows[0].id;
      console.log(`Created main category stock_group "${categoryName}" with ID ${categoryId}`);
    }

    // Check/insert subcategory if present
    subcategoryName = (subcategoryName || '').trim();
    if (subcategoryName) {
      let subRes = await dbClient.query(
        "SELECT id FROM stock_groups WHERE name = $1 AND parent_id = $2 AND company_id = 1",
        [subcategoryName, categoryId]
      );
      if (subRes.rows.length > 0) {
        return subRes.rows[0].id;
      } else {
        let insertSub = await dbClient.query(
          "INSERT INTO stock_groups (name, parent_id, company_id) VALUES ($1, $2, 1) RETURNING id",
          [subcategoryName, categoryId]
        );
        console.log(`Created subcategory stock_group "${subcategoryName}" under category "${categoryName}" with ID ${insertSub.rows[0].id}`);
        return insertSub.rows[0].id;
      }
    }
    
    return categoryId;
  } finally {
    dbClient.release();
  }
}

async function uploadImage(url, sku, index) {
  try {
    console.log(`Downloading image from: ${url}`);
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const buffer = Buffer.from(response.data);
    
    const parsedUrl = new URL(url);
    const ext = path.extname(parsedUrl.pathname) || '.jpg';
    const filename = `${sku}_${index}${ext}`;
    
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: response.headers['content-type'] });
    
    console.log(`Uploading ${filename} to NAS storage...`);
    const uploadRes = await axios.post('http://100.88.85.6:8081/upload', form, {
      headers: {
        ...form.getHeaders(),
        'x-subfolder': 'product-images'
      }
    });
    
    if (uploadRes.data && uploadRes.data.success) {
      console.log(`Uploaded successfully: ${uploadRes.data.url}`);
      return uploadRes.data.url;
    } else {
      console.warn(`Failed uploading ${filename}:`, uploadRes.data);
      return null;
    }
  } catch (err) {
    console.error(`Error processing image ${url}:`, err.message);
    return null;
  }
}

async function testImport() {
  const attributeMap = await ensureAttributes();
  const rows = [];

  let totalRows = 0;
  fs.createReadStream('/Users/sabbirislam/Desktop/Code/Leading Edge/detailed_product_database.csv')
    .pipe(csv())
    .on('data', (row) => {
      totalRows++;
      if (totalRows >= 5 && totalRows <= 8) {
        rows.push(row);
      }
    })
    .on('end', async () => {
      console.log(`Starting test import of ${rows.length} rows...`);
      for (const row of rows) {
        const sku = (row.sku || '').trim();
        const name = (row.name || '').trim();
        if (!sku || !name) continue;

        console.log(`\n--- Processing product: ${name} (SKU: ${sku}) ---`);
        const stockGroupId = await ensureCategory(row.category, row.subcategory);
        
        // Parse image urls
        const uploadedImages = [];
        if (row.image_urls) {
          const urls = row.image_urls.split(',')
            .map(u => u.trim())
            .filter(u => u.startsWith('http://') || u.startsWith('https://'));
          
          for (let i = 0; i < urls.length; i++) {
            const uploadedUrl = await uploadImage(urls[i], sku, i);
            if (uploadedUrl) {
              uploadedImages.push(uploadedUrl);
            }
          }
        }

        const imagePath = uploadedImages[0] || '';
        const imageGallery = JSON.stringify(uploadedImages);

        // Prepare specs
        const specs = {};
        ATTRIBUTES.forEach(attr => {
          if (row[attr.name] && row[attr.name].trim()) {
            specs[attr.name] = row[attr.name].trim();
          }
        });

        const price = parseFloat(row.price) || 0;
        
        const dbClient = await pool.connect();
        try {
          // Check if product exists
          const checkRes = await dbClient.query("SELECT id FROM products WHERE sku = $1", [sku]);
          let productId;
          if (checkRes.rows.length > 0) {
            productId = checkRes.rows[0].id;
            await dbClient.query(
              `UPDATE products SET
                name = $1, category = $2, selling_price = $3, purchase_price = $4,
                description = $5, image_path = $6, stock_group_id = $7, specs = $8,
                image_gallery = $9, is_active = true, last_modified = NOW()
              WHERE id = $10`,
              [name, row.category || '', price, price, row.description || '', imagePath, stockGroupId, specs, imageGallery, productId]
            );
            console.log(`Updated product in DB with ID ${productId}`);
          } else {
            const insertRes = await dbClient.query(
              `INSERT INTO products (
                name, sku, category, selling_price, purchase_price, description, 
                image_path, stock_group_id, specs, image_gallery, company_id, 
                quantity, is_active, status, low_stock_threshold, low_stock_alert_enabled
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, 0, true, 'active', 0, false)
              RETURNING id`,
              [name, sku, row.category || '', price, price, row.description || '', imagePath, stockGroupId, specs, imageGallery]
            );
            productId = insertRes.rows[0].id;
            console.log(`Inserted product in DB with ID ${productId}`);
          }

          // Clear existing attributes
          await dbClient.query("DELETE FROM product_attribute_values WHERE product_id = $1", [productId]);

          // Insert new attribute values
          for (const attr of ATTRIBUTES) {
            const val = (row[attr.name] || '').trim();
            if (val) {
              const attrId = attributeMap[attr.name];
              await dbClient.query(
                "INSERT INTO product_attribute_values (product_id, attribute_id, value, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())",
                [productId, attrId, val]
              );
              console.log(`Inserted attribute value: ${attr.displayName} = "${val}"`);
            }
          }
        } finally {
          dbClient.release();
        }
      }

      console.log('\nTest import finished.');
      await pool.end();
    });
}

testImport().catch(console.error);
