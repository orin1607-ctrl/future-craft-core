/**
 * Batch Hebrew translation for ai-marketing-platform.html
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, '../../public/ai-marketing-platform.html');
let html = readFileSync(file, 'utf8');

const pairs = [
  // Categories
  ['Executive Dashboard', 'דשבורד מנהלים'],
  ['Content & AI', 'תוכן ו-AI'],
  ['Google Services', 'שירותי Google'],
  ['Analytics & Data', 'אנליטיקה ונתונים'],
  ['Reports & History', 'דוחות והיסטוריה'],
  ['FleetOS Integration', 'שילוב FleetOS'],
  ['Settings & API', 'הגדרות ו-API'],
  ['Permissions & Security', 'הרשאות ואבטחה'],
  ['QA & Roadmap', 'בדיקות ו-Roadmap'],
  // Sidebar items
  ['Approval Center', 'מרכז אישורים'],
  ['Daily Briefing', 'תדרוך יומי'],
  ['SEO Intelligence', 'מודיעין SEO'],
  ['Intelligence Center', 'מרכז מודיעין'],
  ['News Intelligence', 'מודיעין חדשות'],
  ['Content Factory', 'מפעל תוכן'],
  ['Website Control', 'ניהול אתר'],
  ['Landing Pages', 'דפי נחיתה'],
  ['AI Strategy', 'אסטרטגיית AI'],
  ['AI Lab', 'מעבדת AI'],
  ['Autonomous Mode', 'מצב אוטונומי'],
  ['AI Image Studio', 'סטודיו תמונות AI'],
  ['Marketing Funnel', 'משפך שיווק'],
  ['Customer Journey', 'מסע לקוח'],
  ['Heat Map', 'מפת חום'],
  ['Health Dashboard', 'דשבורד בריאות'],
  ['QA Checklist', 'רשימת בדיקות QA'],
  ['Google Business', 'Google Business Profile'],
  ['Google Ads', 'Google Ads'],
  ['ROI & Forecast', 'ROI ותחזית'],
  ['KPI Dashboard', 'דשבורד KPI'],
  ['CRM Marketing', 'שיווק CRM'],
  ['Roadmap', 'מפת דרכים'],
  // Badges & placeholders
  ['Requires Backend Integration', 'דורש שילוב Backend'],
  ['Requires GSC Backend', 'דורש Backend של Google Search Console'],
  ['Requires Google Ads API', 'דורש Google Ads API'],
  ['Requires Google Approval', 'דורש אישור Google'],
  ['Requires Hotjar / Microsoft Clarity Integration', 'דורש Hotjar / Microsoft Clarity'],
  ['Requires Hotjar/Clarity', 'דורש Hotjar/Clarity'],
  ['Requires Analytics Backend', 'דורש Backend אנליטיקה'],
  ['Requires API', 'דורש API'],
  ['Requires Backend — היסטוריה מלאה', 'דורש Backend — היסטוריה מלאה'],
  ['Requires Backend', 'דורש Backend'],
  ['Requires OpenAI DALL-E / Midjourney API', 'דורש OpenAI DALL-E / Midjourney API'],
  ['Coming Soon', 'בקרוב'],
  ['Planned', 'מתוכנן'],
  // Screen titles fragments
  ['Approval Center — מרכז אישורים', 'מרכז אישורים'],
  ['Scheduler — לוח פרסום חכם', 'מתזמן פרסום — לוח פרסום חכם'],
  ['Content Warehouse', 'מחסן תוכן'],
  ['Heat Map Analytics', 'אנליטיקת מפת חום'],
  ['Autonomous Mode — מצב AI אוטונומי', 'מצב AI אוטונומי'],
  ['AI Director', 'מנהל AI'],
  ['Super Admin', 'מנהל על'],
  ['AI Marketing Platform v2.0', 'פלטפורמת שיווק AI v2.0'],
  // Buttons / UI
  ['Sync Now', 'סנכרן עכשיו'],
  ['Export', 'יצוא'],
  ['Filter', 'סנן'],
  ['Preview', 'תצוגה מקדימה'],
  ['Edit', 'עריכה'],
  ['Approve', 'אישור'],
  ['Reject', 'דחייה'],
  ['Schedule', 'תזמון'],
  // QA table options
  ['<option>Backend</option>', '<option>Backend</option>'],
  ['<option>Planned</option>', '<option>מתוכנן</option>'],
  ['<option>Coming Soon</option>', '<option>בקרוב</option>'],
  ['12 Requires Backend', '12 דורש Backend'],
  ['4 Coming Soon', '4 בקרוב'],
  ['3 Planned', '3 מתוכנן'],
  ['2 Requires Google Approval', '2 דורש אישור Google'],
  // Footer
  ['Content Manager', 'מנהל תוכן'],
  ['Landing Page', 'דף נחיתה'],
  ['AI Landing Page', 'דף נחיתה AI'],
  ['Meta Descriptions', 'תיאורי Meta'],
  ['AI Marketing Platform', 'פלטפורמת שיווק AI'],
  ['WordPress', 'WordPress'],
  ['Hero', 'Hero'],
  ['Internal Links', 'קישורים פנימיים'],
  ['Schema', 'Schema'],
  ['Content Manager', 'מנהל תוכן'],
  ['placeholder="חיפוש Landing Page..."', 'placeholder="חיפוש דף נחיתה..."'],
  ['<th>Landing Page</th>', '<th>דף נחיתה</th>'],
  ['AI Keyword Research', 'מחקר מילות מפתח AI'],
  ['Content Manager', 'מנהל תוכן'],
  ['Marketing ', 'שיווק '],
];

for (const [from, to] of pairs) {
  html = html.split(from).join(to);
}

// Scheduler standalone (after Landing Pages translation might conflict - use specific)
html = html.replace(/<button class="sb-item" data-sc="scheduler"><span class="icon">📅<\/span> מתזמן פרסום<\/button>/,
  '<button class="sb-item" data-sc="scheduler"><span class="icon">📅</span> מתזמן פרסום</button>');

writeFileSync(file, html, 'utf8');
console.log('Hebrew translation applied:', file);
