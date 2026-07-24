import { createClient } from '@supabase/supabase-js';

const config = {
  url: "https://db.lenas.me",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM",
  cfAccessClientId: "293c6787c3a98289a1f569b2060eae76.access",
  cfAccessClientSecret: "f4fd4f58933a5191b4ab83292d2bfb5515d94c7f681570ec422646c53908a506"
};

const customFetch = (input, init) => {
  let reqUrl = typeof input === 'string' ? input : input.toString();
  if (reqUrl.includes('/rest/v1/')) {
    reqUrl = reqUrl.replace('/rest/v1/', '/');
  }
  const mergedInit = {
    ...init,
    headers: {
      ...(init?.headers || {}),
      'CF-Access-Client-Id': config.cfAccessClientId,
      'CF-Access-Client-Secret': config.cfAccessClientSecret
    }
  };
  return fetch(reqUrl, mergedInit);
};

const supabase = createClient(config.url, config.anonKey, {
  global: {
    fetch: customFetch
  }
});

async function run() {
  try {
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, sku, category, stock_group_id, stock_groups(id, name, parent_id)');
    if (prodErr) throw prodErr;

    // Load parent groups to match parents names
    const { data: allGroups, error: groupsErr } = await supabase
      .from('stock_groups')
      .select('id, name');
    if (groupsErr) throw groupsErr;

    const groupMap = new Map(allGroups.map(g => [g.id, g.name]));

    const groups = {};

    products.forEach(row => {
      const sg = row.stock_groups;
      if (!sg) return;
      const sgId = sg.id;
      if (!groups[sgId]) {
        groups[sgId] = {
          id: sgId,
          name: sg.name,
          parent: sg.parent_id ? groupMap.get(sg.parent_id) : 'None',
          product_category: row.category,
          skus: [],
          prefixes: new Set(),
          dots: 0,
          dashes: 0
        };
      }
      
      const sku = row.sku || '';
      groups[sgId].skus.push(sku);
      
      const parts = sku.split('.');
      if (parts.length > 1) {
        groups[sgId].dots++;
      }
      if (sku.includes('-')) {
        groups[sgId].dashes++;
      }
    });

    console.log('--- Stock Group SKU Pattern Analysis ---');
    Object.values(groups).forEach(g => {
      console.log(`\nStock Group: ${g.name} (ID: ${g.id}, Parent: ${g.parent}, Category: ${g.product_category})`);
      console.log(`  Total Products: ${g.skus.length}`);
      console.log(`  SKUs with dots (.):   ${g.dots}`);
      console.log(`  SKUs with dashes (-): ${g.dashes}`);
      console.log(`  Sample SKUs: ${g.skus.slice(0, 5).join(', ')}`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

run();
