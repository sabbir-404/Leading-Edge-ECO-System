import fs from 'fs';
import csv from 'csv-parser';

const csvPath = '/Users/sabbirislam/Desktop/Code/Leading Edge/detailed_product_database.csv';

let totalRows = 0;
let rowsWithImages = 0;
const categories = new Set();
const subcategories = new Set();

fs.createReadStream(csvPath)
  .pipe(csv())
  .on('data', (row) => {
    totalRows++;
    if (row.image_urls && row.image_urls.trim()) {
      rowsWithImages++;
    }
    if (row.category) categories.add(row.category.trim());
    if (row.subcategory) subcategories.add(row.subcategory.trim());
  })
  .on('end', () => {
    console.log('--- CSV Analysis ---');
    console.log('Total Rows:', totalRows);
    console.log('Rows with Images:', rowsWithImages);
    console.log('Unique Categories:', categories.size, Array.from(categories));
    console.log('Unique Subcategories:', subcategories.size, Array.from(subcategories).slice(0, 10));
  });
