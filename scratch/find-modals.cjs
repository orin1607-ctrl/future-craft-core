const fs = require('fs');
const text = fs.readFileSync('src/features/claims/ClaimsScreen.tsx', 'utf8');

const regex = /<div className=\{`ov \$\{modal === ['"]([^'"]+)['"]/g;
let m;
const modals = [];
while ((m = regex.exec(text)) !== null) {
  modals.push(m[1]);
}
console.log('Modals found:', modals);

// Also look for how the claim card is opened
const openCardMatch = text.match(/const openCard = [^\{]+\{([^}]+)\}/s);
console.log('openCard:', openCardMatch ? openCardMatch[0].substring(0, 300) : 'not found');

// Find where cur && is rendered
const curMatches = text.match(/\{cur && [^\n]+/g);
console.log('cur matches:', curMatches);
