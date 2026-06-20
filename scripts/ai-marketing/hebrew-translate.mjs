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
  ['<div class="sb-sec">Marketing</div>', '<div class="sb-sec">שיווק</div>'],
  ['>Landing<', '>דף נחיתה<'],
  ['chip-orange">Landing', 'chip-orange">דף נחיתה'],
  ['chip-yellow">Meta<', 'chip-yellow">Meta SEO<'],
  ['>Analytics<', '>Google Analytics<'],
  ['Title + Description', 'כותרת + תיאור'],
  ['Internal/External Links', 'קישורים פנימיים/חיצוניים'],
  ['Dashboard ראשי', 'דשבורד ראשי'],
  ['SEO + Keywords', 'SEO + מילות מפתח'],
  ['<td class="fw7">Dashboard</td>', '<td class="fw7">דשבורד</td>'],
  ['<td>Dashboard</td>', '<td>דשבורד</td>'],
  ['<td class="fw7">Keywords</td>', '<td class="fw7">מילות מפתח</td>'],
  ['<td>Keywords</td>', '<td>מילות מפתח</td>'],
  ['<td>Content</td>', '<td>תוכן</td>'],
  ['<td>Warehouse</td>', '<td>מחסן</td>'],
  ['<td>Landing</td>', '<td>דף נחיתה</td>'],
  ['<td class="fw7">Intelligence</td>', '<td class="fw7">מודיעין</td>'],
  ['<td>Intel</td>', '<td>מודיעין</td>'],
  ['<td>Executive</td>', '<td>מנהלים</td>'],
  ['מיקי — Developer', 'מיקי — מפתח'],
  ['<span class="pill pill-green">Developer</span>', '<span class="pill pill-green">מפתח</span>'],
  ['<span class="pill pill-orange">Content</span>', '<span class="pill pill-orange">תוכן</span>'],
  ['<div class="row-text fw7">Developer</div>', '<div class="row-text fw7">מפתח</div>'],
  ['<div class="row-text fw7">Viewer</div>', '<div class="row-text fw7">צופה</div>'],
  ['נתוני SEO ו-Keywords', 'נתוני SEO ומילות מפתח'],
  ['מאמרים, FAQ, Landing, Meta', 'מאמרים, FAQ, דפי נחיתה, Meta'],
  ['Google Business Profile Profile', 'Google Business Profile'],
  ['<option>Backend</option>', '<option>Backend</option>'],
];

for (const [from, to] of pairs) {
  html = html.split(from).join(to);
}

writeFileSync(file, html, 'utf8');
console.log('Hebrew (safe) applied:', file);
