import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '100.88.85.6',
  port: 5432,
  user: 'admin',
  password: 'Brown@8099',
  database: 'lesoft'
});

async function main() {
  console.log('Connecting to PostgreSQL database at 100.88.85.6...');
  const client = await pool.connect();
  try {
    const productsRes = await client.query('SELECT count(*) FROM products');
    console.log(`Total products: ${productsRes.rows[0].count}`);

    const activeProductsRes = await client.query('SELECT count(*) FROM products WHERE is_active = true');
    console.log(`Total active products: ${activeProductsRes.rows[0].count}`);

    const zeroQtyProductsRes = await client.query('SELECT count(*) FROM products WHERE quantity = 0');
    console.log(`Total products with 0 quantity: ${zeroQtyProductsRes.rows[0].count}`);

    const groupsRes = await client.query('SELECT count(*) FROM stock_groups');
    console.log(`Total stock groups (categories/subcategories): ${groupsRes.rows[0].count}`);

    const attributesRes = await client.query('SELECT count(*) FROM product_attributes');
    console.log(`Total product attributes: ${attributesRes.rows[0].count}`);

    const valuesRes = await client.query('SELECT count(*) FROM product_attribute_values');
    console.log(`Total product attribute values: ${valuesRes.rows[0].count}`);

    console.log('\n--- Sample Products ---');
    const sampleProducts = await client.query('SELECT id, name, sku, category, selling_price, image_path FROM products LIMIT 5');
    console.table(sampleProducts.rows);

    console.log('\n--- Product Attributes list ---');
    const attrList = await client.query('SELECT id, name, input_type FROM product_attributes WHERE company_id = 1');
    console.table(attrList.rows);

    console.log('\n--- Stock Groups ---');
    const sgRes = await client.query('SELECT id, name, parent_id FROM stock_groups WHERE company_id = 1');
    console.log(`Total stock groups: ${sgRes.rows.length}`);
    console.table(sgRes.rows);

    console.log('\n--- Product Model Rules ---');
    const rulesList = await client.query('SELECT id, name, origin_type, origin_code, stock_group_id, group_code, serial_padding FROM product_model_rules WHERE company_id = 1');
    console.log(`Total model rules: ${rulesList.rows.length}`);
    console.table(rulesList.rows);

  } catch (err) {
    console.error('Database query error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
