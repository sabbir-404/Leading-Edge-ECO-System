import fs from 'fs';
import csv from 'csv-parser';

const CSV_PATH = '/Users/sabbirislam/Desktop/Code/Leading Edge/detailed_product_database.csv';

async function run() {
  const rows = [];
  await new Promise((resolve) => {
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        if (row.permalink && row.permalink.includes('01-5256')) {
          rows.push(row);
        }
      })
      .on('end', resolve);
  });

  console.log(`Found ${rows.length} rows in CSV matching "01-5256":`);
  if (rows.length > 0) {
    console.log(JSON.stringify(rows[0], null, 2));
  } else {
    console.log('No rows found in CSV.');
  }
}

run();
