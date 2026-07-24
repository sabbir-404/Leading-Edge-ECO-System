// Updates all product image_path and image_gallery from Tailscale IP to storage.lenas.me
// Run from: node scratch/update_image_urls.js

import axios from 'axios';

const CF_ID = '293c6787c3a98289a1f569b2060eae76.access';
const CF_SECRET = 'f4fd4f58933a5191b4ab83292d2bfb5515d94c7f681570ec422646c53908a506';
const DB = 'https://db.lenas.me';
const OLD = 'http://100.88.85.6:8081';
const NEW = 'https://storage.lenas.me';

const headers = {
  'CF-Access-Client-Id': CF_ID,
  'CF-Access-Client-Secret': CF_SECRET,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

async function run() {
  console.log('Fetching all products with Tailscale image_path...');
  const resp = await axios.get(`${DB}/products?image_path=like.*100.88.85.6*&select=id,sku,image_path,image_gallery&limit=2000`, { headers: { 'CF-Access-Client-Id': CF_ID, 'CF-Access-Client-Secret': CF_SECRET } });
  const products = resp.data;
  console.log(`Found ${products.length} products to update.`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const newImagePath = prod.image_path ? prod.image_path.replace(OLD, NEW) : '';
    let newGallery = prod.image_gallery;
    if (Array.isArray(newGallery)) {
      newGallery = newGallery.map(url => typeof url === 'string' ? url.replace(OLD, NEW) : url);
    } else if (typeof newGallery === 'string') {
      try { newGallery = JSON.parse(newGallery).map(u => u.replace(OLD, NEW)); } catch { newGallery = []; }
    }

    try {
      await axios.patch(`${DB}/products?id=eq.${prod.id}`,
        { image_path: newImagePath, image_gallery: newGallery },
        { headers }
      );
      updated++;
    } catch (e) {
      console.error(`  ❌ ID ${prod.id}: ${e.response?.data?.message || e.message}`);
      failed++;
    }

    if ((i + 1) % 100 === 0 || i + 1 === products.length) {
      console.log(`  [${i+1}/${products.length}] Updated: ${updated}, Failed: ${failed}`);
    }
  }

  console.log(`\n✅ Done. Updated: ${updated}, Failed: ${failed}`);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
