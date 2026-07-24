import { createClient } from '@supabase/supabase-js';

const config = {
  url: "https://db.lenas.me",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZGtrZ2pyb2xjamlqd2Zva2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzMzMjQsImV4cCI6MjA4NzUwOTMyNH0.Bn6c-87BOumPXyH5F469P04fQSMnI9SjNDZAwgGyTsM",
  cfAccessClientId: "293c6787c3a98289a1f569b2060eae76.access",
  cfAccessClientSecret: "f4fd4f58933a5191b4ab83292d2bfb5515d94c7f681570ec422646c53908a506"
};

const STORAGE_SERVER = 'https://storage.lenas.me';

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
  global: { fetch: customFetch }
});

async function run() {
  // Find products with the "Acoustic Pendent Light" names
  const { data: prods, error } = await supabase
    .from('products')
    .select('id, name, sku, specs, image_path')
    .ilike('name', '%Acoustic Pendent Light%');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(`Found ${prods.length} matching products:`);
  for (const p of prods) {
    console.log(`  ID: ${p.id}, Name: ${p.name}, SKU: ${p.sku}, image_path: "${p.image_path}"`);
    console.log(`  specs.permalink: ${p.specs?.permalink}`);
  }

  // Determine which CSV SKU maps to which DB product by permalink
  const mapping = [
    {
      csvSku: '01-5039-1',
      permalink: 'https://leadingedge.com.bd/product/acoustic-pendent-light-medium-kp-03-orange-01-5039/'
    },
    {
      csvSku: '01-5039-2',
      permalink: 'https://leadingedge.com.bd/product/acoustic-pendent-light-medium-kp-11-light-grey-01-5039/'
    }
  ];

  for (const m of mapping) {
    const match = prods.find(p => p.specs?.permalink === m.permalink);
    if (!match) {
      console.log(`\nNo match for permalink: ${m.permalink}`);
      continue;
    }

    const imgUrl0 = `${STORAGE_SERVER}/files/product-images/${m.csvSku}_0.jpg`;
    const imgUrl1 = `${STORAGE_SERVER}/files/product-images/${m.csvSku}_1.jpg`;

    console.log(`\nUpdating product ID ${match.id} (${match.name}) with images:`);
    console.log(`  image_path: ${imgUrl0}`);
    console.log(`  image_gallery: [${imgUrl0}, ${imgUrl1}]`);

    const { error: updateErr } = await supabase
      .from('products')
      .update({
        image_path: imgUrl0,
        image_gallery: [imgUrl0, imgUrl1]
      })
      .eq('id', match.id);

    if (updateErr) {
      console.error(`  Update error:`, updateErr);
    } else {
      console.log(`  ✅ Updated!`);
    }
  }

  console.log('\nDone!');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
