import fs from 'fs';

const p = 'C:/Users/אליאב/Projects/oren-car-carpart-staging/src/features/claims/claims-ai.css';
let content = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

content = content.replace('z-index: 6000;', 'z-index: 10000 !important;');
content = content.replace('z-index: 6000 !important;', 'z-index: 10000 !important;');

fs.writeFileSync(p, content, 'utf8');
console.log('Updated z-index to 10000 in claims-ai.css');
