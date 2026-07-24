import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '100.88.85.6',
  port: 5432,
  user: 'admin',
  password: 'Brown@8099',
  database: 'lesoft'
});

function parseSku(sku, categoryName, productId) {
  let originType = 'IMPORTED';
  let originCode = '01';
  let groupCode = '11';
  let serialInt = productId;
  let serialText = '';

  sku = sku.trim();
  
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

  const cat = categoryName.toLowerCase().trim();
  if (cat.includes('light') || cat.includes('lamp')) {
    groupCode = '10';
  } else if (cat.includes('kitchen') || cat.includes('sink')) {
    groupCode = '31';
  } else if (cat.includes('table')) {
    groupCode = '13';
  } else if (cat.includes('board')) {
    groupCode = '14';
  } else if (cat.includes('chair')) {
    groupCode = '15';
  } else if (cat.includes('aluminium') || cat.includes('aluminum')) {
    groupCode = '16';
  } else if (cat.includes('sofa')) {
    groupCode = '17';
  } else if (cat.includes('furniture')) {
    groupCode = '18';
  } else {
    groupCode = '11'; // Hardware/Others
  }

  const match = suffix.match(/^([0-9]+)(.*)$/);
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

  const generatedCode = `${originCode}.${groupCode}.01.${serialText}${finalVariant}`;

  return {
    originType,
    originCode,
    groupCode,
    serialInt,
    generatedCode
  };
}

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        p.id,
        p.sku,
        p.name,
        p.category as product_category,
        sg.id as stock_group_id,
        sg.name as stock_group_name,
        sg_parent.name as parent_group_name
      FROM products p
      JOIN stock_groups sg ON p.stock_group_id = sg.id
      LEFT JOIN stock_groups sg_parent ON sg.parent_id = sg_parent.id
      WHERE p.company_id = 1
    `);

    console.log(`Retrieved ${res.rows.length} products. Simulating translations...`);

    const codes = new Set();
    const duplicates = [];
    const mappingResults = [];
    
    res.rows.forEach(row => {
      const categoryName = row.parent_group_name || row.stock_group_name || row.product_category || '';
      const parsed = parseSku(row.sku, categoryName, row.id);

      mappingResults.push({
        id: row.id,
        oldSku: row.sku,
        name: row.name,
        originType: parsed.originType,
        originCode: parsed.originCode,
        groupCode: parsed.groupCode,
        serialInt: parsed.serialInt,
        generatedCode: parsed.generatedCode
      });

      if (codes.has(parsed.generatedCode)) {
        duplicates.push({ id: row.id, name: row.name, sku: row.sku, generatedCode: parsed.generatedCode });
      } else {
        codes.add(parsed.generatedCode);
      }
    });

    console.log(`Simulation complete.`);
    console.log(`Total generated codes: ${codes.size}`);
    console.log(`Total duplicates: ${duplicates.length}`);

    if (duplicates.length > 0) {
      console.log('Sample duplicates:');
      console.table(duplicates.slice(0, 20));
    } else {
      console.log('🎉 SUCCESS! All generated model codes are unique!');
      console.log('\nSample mapping output:');
      console.table(mappingResults.slice(0, 20));
    }

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
