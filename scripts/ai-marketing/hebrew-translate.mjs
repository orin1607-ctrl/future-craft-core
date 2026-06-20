/**
 * Hebrew translation — CO.CO Dalia (safe replacements only)
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/ai-marketing-platform.html');
let html = readFileSync(file, 'utf8');

const pairs = [
  ['AI Content Generator', 'מחולל תוכן AI'],
  ['AI Content Generation', 'יצירת תוכן AI'],
  ['AI Keyword Research', 'מחקר מילות מפתח AI'],
  ['AI Landing Page', 'דף נחיתה AI'],
  ['Meta Updates', 'עדכוני Meta'],
  ['Meta SEO', 'Meta SEO'],
  ['Int. Links', 'קישורים פנימיים'],
  ['Ext. Links', 'קישורים חיצוניים'],
  ['Alt Text', 'טקst חלופי'],
  ['API Connections', 'חיבורי API'],
  ['Content Manager', 'מנהל תוכן'],
  ['Landing Page', 'דף נחיתה'],
  ['Sync Now', 'סנכרן עכשיו'],
  ['placeholder="חיפוש Landing Page..."', 'placeholder="חיפוש דף נחיתה..."'],
  ['<th>Landing Page</th>', '<th>דף נחיתה</th>'],
  ['<span>Landing Page</span>', '<span>דף נחיתה</span>'],
  ['Landing:', 'דף נחיתה:'],
  ['<option>Landing</option>', '<option>דף נחיתה</option>'],
  ['10:00 Landing Page', '10:00 דף נחיתה'],
  ['Meta: 8', 'Meta: 8'],
  ['Requires Backend Integration', 'דורש שילוב Backend'],
  ['12 Requires Backend', '12 דורש Backend'],
  ['4 Coming Soon', '4 בקרוב'],
  ['3 Planned', '3 מתוכנן'],
  ['2 Requires Google Approval', '2 דורש אישור Google'],
  ['<option>Planned</option>', '<option>מתוכנן</option>'],
  ['<option>Coming Soon</option>', '<option>בקרוב</option>'],
  ['Requires Backend', 'דורש Backend'],
  ['Coming Soon', 'בקרוב'],
  ['Planned', 'מתוכנן'],
  ['Content Manager', 'מנהל תוכן'],
  ['Super Admin', 'מנהל על'],
];

for (const [from, to] of pairs) {
  html = html.split(from).join(to);
}

writeFileSync(file, html, 'utf8');
console.log('Hebrew (safe) applied:', file);
