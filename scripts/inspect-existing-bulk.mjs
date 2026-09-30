import fs from 'fs';

const html = fs.readFileSync('public/openprospector.html', 'utf8');

console.log('=== INSPECTION OF EXISTING PAGINATION, LIMITS & BULK IN OPENPROSPECTOR ===');

const lines = html.split('\n');

function findOccurrences(term) {
  console.log(`\n--- Searching for: "${term}" ---`);
  let count = 0;
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(term.toLowerCase())) {
      count++;
      if (count <= 15) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
  console.log(`Total occurrences of "${term}": ${count}`);
}

findOccurrences('limit');
findOccurrences('offset');
findOccurrences('datastore_search');
findOccurrences('a-count');
findOccurrences('batch');
findOccurrences('bulk');
findOccurrences('pagination');
findOccurrences('exportCsv');
