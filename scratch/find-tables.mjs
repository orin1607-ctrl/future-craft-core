import fs from 'fs';
const content = fs.readFileSync('src/features/claims/ClaimsScreen.tsx', 'utf8');
const matches = content.match(/\.from\(['"]([^'"]+)['"]\)/g) || [];
console.log('Tables in ClaimsScreen.tsx:');
console.log([...new Set(matches.map(m => m.replace(/\.from\(['"]|['"]\)/g, '')))].join('\n'));
