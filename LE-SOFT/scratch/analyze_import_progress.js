import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import csv from 'csv-parser';

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

const CSV_PATH = '/Users/sabbirislam/Desktop/Code/Leading Edge/detailed_product_database.csv';

async function run() {
  try {
    const csvRows = [];
    await new Promise((resolve) => {
      fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on('data', (row) => {
          csvRows.push(row);
        })
        .on('end', resolve);
    });

    const csvWithImages = csvRows.filter(row => row.image_urls && row.image_urls.trim() !== '');
    console.log(`CSV rows with non-empty image_urls: ${csvWithImages.length}`);

    // Let's see how many of those have image_path in DB
    const { data: dbProducts, error: dbErr } = await supabase.from('products').select('sku, specs, image_path');
    if (dbErr) throw dbErr;

    const permalinkMap = new Map(dbProducts.map(p => [p.specs?.permalink || '', p]));

    let csvImageWithDbImage = 0;
    let csvImageWithoutDbImage = 0;
    const sampleMissingDbImage = [];

    csvWithImages.forEach(row => {
      const permalink = (row.permalink || '').trim();
      const dbProd = permalinkMap.get(permalink);
      if (dbProd) {
        if (dbProd.image_path && dbProd.image_path.trim() !== '') {
          csvImageWithDbImage++;
        } else {
          csvImageWithoutDbImage++;
          sampleMissingDbImage.push({ sku: row.sku, name: row.name, image_urls: row.image_urls });
        }
      }
    });

    console.log(`Matched CSV rows with image_urls having image_path in DB: ${csvImageWithDbImage}`);
    console.log(`Matched CSV rows with image_urls MISSING image_path in DB: ${csvImageWithoutDbImage}`);

    if (sampleMissingDbImage.length > 0) {
      console.log('Sample missing DB images:', sampleMissingDbImage.slice(0, 5));
    }

  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

run();
