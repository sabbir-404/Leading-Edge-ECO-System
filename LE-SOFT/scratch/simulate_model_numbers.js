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
    const missingSerial = [];
    
    res.rows.forEach(row => {
      const sku = row.sku.trim();
      const parts = sku.split('-');
      
      // Determine origin type and code
      let originType = 'IMPORTED';
      let originCode = '01';
      let suffix = sku;

      if (parts.length > 1) {
        const prefix = parts[0];
        if (prefix === '02') {
          originType = 'LOCAL';
          originCode = '02';
        }
        suffix = parts.slice(1).join('-');
      }

      // Map group code
      const categoryName = (row.parent_group_name || row.stock_group_name || '').toLowerCase().trim();
      let groupCode = '11'; // Default Hardware/Others

      if (categoryName.includes('light') || categoryName.includes('lamp')) {
        groupCode = '10';
      } else if (categoryName.includes('kitchen')) {
        groupCode = '31';
      } else if (categoryName.includes('table')) {
        groupCode = '13';
      } else if (categoryName.includes('board')) {
        groupCode = '14';
      } else if (categoryName.includes('chair')) {
        groupCode = '15';
      } else if (categoryName.includes('aluminium') || categoryName.includes('aluminum')) {
        groupCode = '16';
      } else if (categoryName.includes('sofa')) {
        groupCode = '17';
      } else if (categoryName.includes('furniture')) {
        groupCode = '18';
      }

      // Parse serial number integer
      const cleanedSuffix = suffix.replace(/[^0-9]/g, '');
      let serialInt = parseInt(cleanedSuffix, 10);

      if (isNaN(serialInt)) {
        // Fallback: use product ID to guarantee unique integer serial
        serialInt = row.id;
        missingSerial.push({ id: row.id, name: row.name, sku: row.sku });
      }

      const serialText = String(serialInt).padStart(4, '0');
      const generatedCode = `${originCode}.${groupCode}.01.${serialText}`;

      if (codes.has(generatedCode)) {
        duplicates.push({ id: row.id, name: row.name, sku: row.sku, generatedCode });
      } else {
        codes.add(generatedCode);
      }
    });

    console.log(`Simulation complete.`);
    console.log(`Total generated codes: ${codes.size}`);
    console.log(`Total duplicates: ${duplicates.length}`);
    console.log(`Total missing serial: ${missingSerial.length}`);

    if (duplicates.length > 0) {
      console.log('Sample duplicates:');
      console.table(duplicates.slice(0, 10));
    }

    if (missingSerial.length > 0) {
      console.log('Sample missing serial:');
      console.table(missingSerial.slice(0, 10));
    }

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
