const fs = require('fs');
const text = fs.readFileSync('src/features/claims/ClaimsScreen.tsx', 'utf8');

const start = 198731 + 11500;
console.log(text.substring(start, start + 2500));
