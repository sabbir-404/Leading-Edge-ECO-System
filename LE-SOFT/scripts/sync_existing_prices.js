import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const userEnvPath = '/Users/sabbirislam/Library/Application Support/le-soft/supabase-config.json';
const conf = JSON.parse(fs.readFileSync(userEnvPath, 'utf8'));
const supabase = createClient(conf.url, conf.serviceRoleKey || conf.anonKey);

async function run() {
  console.log('Fetching all products...');
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, purchase_price');
  
  if (prodError) {
    console.error('Error fetching products:', prodError);
    return;
  }

  console.log(`Found ${products.length} products. Scanning for completed requisitions to update prices...`);

  for (const product of products) {
    console.log(`\nChecking product: ${product.name} (ID: ${product.id}, Current Price: ${product.purchase_price})`);

    // Find completed requisitions that reference this product directly or via line items
    const { data: directReqs, error: reqError } = await supabase
      .from('purchase_requisitions')
      .select('id, requisition_number, status, supplier_ledger_id, product_id')
      .eq('product_id', product.id)
      .eq('status', 'COMPLETED');

    if (reqError) {
      console.error(`Error fetching direct requisitions for product ${product.id}:`, reqError);
      continue;
    }

    // Also check requisitions that have this product inside purchase_requisition_items
    const { data: itemRows, error: itemsError } = await supabase
      .from('purchase_requisition_items')
      .select('requisition_id')
      .eq('product_id', product.id);

    if (itemsError) {
      console.error(`Error fetching line items for product ${product.id}:`, itemsError);
      continue;
    }

    const itemReqIds = (itemRows || []).map(row => row.requisition_id);
    let allCompletedReqs = [...(directReqs || [])];

    if (itemReqIds.length > 0) {
      const { data: indirectReqs, error: indError } = await supabase
        .from('purchase_requisitions')
        .select('id, requisition_number, status, supplier_ledger_id, product_id')
        .in('id', itemReqIds)
        .eq('status', 'COMPLETED');

      if (!indError && indirectReqs) {
        for (const ir of indirectReqs) {
          if (!allCompletedReqs.some(r => r.id === ir.id)) {
            allCompletedReqs.push(ir);
          }
        }
      }
    }

    if (allCompletedReqs.length === 0) {
      console.log(`No completed requisitions found for product ${product.name}.`);
      continue;
    }

    console.log(`Found ${allCompletedReqs.length} completed requisition(s) for ${product.name}. Finding winning quotes...`);

    let bestPrice = null;
    let chosenReqNumber = '';

    for (const req of allCompletedReqs) {
      // Get the quote for this requisition and product. Prefer the winning supplier's quote.
      let quoteQuery = supabase
        .from('purchase_requisition_quotes')
        .select('unit_price, supplier_ledger_id')
        .eq('requisition_id', req.id)
        .eq('product_id', product.id);

      if (req.supplier_ledger_id) {
        quoteQuery = quoteQuery.eq('supplier_ledger_id', req.supplier_ledger_id);
      }

      const { data: quotes, error: qError } = await quoteQuery;
      if (qError) {
        console.error(`Error fetching quotes for requisition ${req.id}:`, qError);
        continue;
      }

      if (quotes && quotes.length > 0) {
        const price = Number(quotes[0].unit_price);
        if (price > 0) {
          bestPrice = price;
          chosenReqNumber = req.requisition_number;
          break; // Stop at the first valid completed requisition quote
        }
      }

      // Fallback: search for any quote for this requisition and product if the supplier ledger mismatch happened
      const { data: fallbackQuotes } = await supabase
        .from('purchase_requisition_quotes')
        .select('unit_price')
        .eq('requisition_id', req.id)
        .eq('product_id', product.id)
        .limit(1);

      if (fallbackQuotes && fallbackQuotes.length > 0) {
        const price = Number(fallbackQuotes[0].unit_price);
        if (price > 0) {
          bestPrice = price;
          chosenReqNumber = req.requisition_number;
          break;
        }
      }
    }

    if (bestPrice !== null) {
      console.log(`Updating ${product.name} purchase_price to ${bestPrice} (derived from REQ: ${chosenReqNumber})`);
      const { error: updateError } = await supabase
        .from('products')
        .update({ purchase_price: bestPrice })
        .eq('id', product.id);

      if (updateError) {
        console.error(`Failed to update price for product ${product.id}:`, updateError.message);
      } else {
        console.log(`Successfully updated ${product.name} purchase_price!`);
      }
    } else {
      console.log(`Could not find a valid quote price for any completed requisition of product ${product.name}.`);
    }
  }

  console.log('\nPrice synchronization completed.');
}

run();
