/**
 * בדיקת כל מודולי AI דרך API — דורש OPENAI_API_KEY ב-.env.openai + api-server פעיל
 * Usage: npm run ai-marketing:api  (terminal 1)
 *        npm run ai-marketing:openai-modules-probe  (terminal 2)
 */
import { loadOpenAIKey, openAIKeyStatus } from './_lib/openai-env.mjs';

const API = process.env.COCO_API_URL || 'http://127.0.0.1:8787';

const MODULES = [
  { id: 'dashboard', name: 'דשבורד ראשי', prompt: '3 KPI שיווקיים ל-dalia-c.com' },
  { id: 'director', name: 'מנהל AI', prompt: '3 תובנות SEO קצרות ל-dalia-c.com' },
  { id: 'keywords', name: 'מחקר מילות מפתח', prompt: '5 מילות מפתח לניהול צי רכב עם כוונת חיפוש' },
  { id: 'content', name: 'מפעל תוכן', prompt: 'כותרת H1 + 3 נקודות למאמר SEO קצר' },
  { id: 'strategy', name: 'אסטרטגיית תוכן', prompt: 'יעד שיווקי אחד ל-30 יום ל-dalia-c.com' },
  { id: 'ailab', name: 'מעבדת AI', prompt: '2 רעיונות A/B לכותרת דף נחיתה' },
  { id: 'intel', name: 'מרכז מודיעין', prompt: 'הזדמנות תוכן אחת מ-GSC' },
  { id: 'competitors', name: 'ניתוח מתחרים', prompt: 'חוזקה אחת של מתחרה בתחום ניהול צי' },
  { id: 'news', name: 'חדשות וטרנדים', prompt: 'נושא טרנד אחד לתוכן שיווקי בניהול צי' },
  { id: 'ads', name: 'Google Ads', prompt: 'כותרת מודעה אחת לתוכנת ניהול צי' },
  { id: 'gbp', name: 'Google Business', prompt: 'משפט אחד לפוסט GBP על ניהול צי' },
  { id: 'landing', name: 'יצירת דפי נחיתה', prompt: 'כותרת ראשית לדף נחיתה — ניהול צי לעסקים' },
  { id: 'pages', name: 'עמודים ו-SEO', prompt: 'שיפור Meta Description אחד לעמוד ניהול צי' },
  { id: 'seo', name: 'הצעות SEO', prompt: '3 הצעות SEO ל-dalia-c.com' },
  { id: 'warehouse', name: 'מחסן תוכן', prompt: 'צ\'קליסט SEO קצר לתוכן חדש' },
  { id: 'briefing', name: 'תדרוך יומי', prompt: 'תדרוך יומי שיווקי — 3 שורות' },
  { id: 'executive', name: 'סיכום מנהלים', prompt: 'סיכום מנהלים — 3 נקודות KPI' },
  { id: 'roi', name: 'ROI', prompt: 'הערכת ROI לערוץ SEO אחד' },
  { id: 'reports', name: 'דוחות', prompt: 'מתווה דוח שיווק שבועי — 4 סעיפים' },
  { id: 'funnel', name: 'משפך שיווק', prompt: 'שלב משפך אחד לשיפור ב-B2B' },
  { id: 'journey', name: 'מסע לקוח', prompt: 'נקודת מגע אחת במסע לקוח B2B' },
  { id: 'crm', name: 'שיווק CRM', prompt: 'רעיון קמפיין CRM אחד ללידים' },
  { id: 'autonomous', name: 'מצב אוטונומי', prompt: 'פעולת AI אוטונומית אחת (ללא פרסום)' },
  { id: 'aiimage', name: 'סטודיו תמונות AI', prompt: 'תיאור תמונה שיווקית אחת לדף נחיתה' },
];

async function main() {
  const status = openAIKeyStatus();
  console.log('\n=== OpenAI Modules Probe ===\n');
  console.log('Env file:', status.file);
  console.log('Model:', status.model);

  if (!loadOpenAIKey()) {
    console.log('\n❌ OPENAI_API_KEY חסר ב-.env.openai');
    console.log('→ הדבק מפתח בשורה: OPENAI_API_KEY=sk-...');
    console.log('→ הפעל: npm run ai-marketing:api');
    process.exit(1);
  }

  let health;
  try {
    health = await fetch(`${API}/api/ai/health`).then((r) => r.json());
  } catch (e) {
    console.log('\n❌ API לא זמין ב', API);
    console.log('→ הפעל: npm run ai-marketing:api');
    process.exit(1);
  }

  if (!health.ok) {
    console.log('\n❌ API מדווח OpenAI לא מחובר:', health.message);
    console.log('→ הפעל מחדש: npm run ai-marketing:api (לאחר הדבקת המפתח)');
    process.exit(1);
  }

  console.log('✓ API OpenAI health OK\n');

  const results = [];
  for (const mod of MODULES) {
    process.stdout.write(`  ${mod.name}... `);
    try {
      const res = await fetch(`${API}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: mod.id, prompt: mod.prompt, max_tokens: 120 }),
      });
      const data = await res.json();
      const demoLike = data.text && /דמו|demo|placeholder|לא זמין/i.test(data.text);
      const ok = res.ok && data.ok && data.text && data.text.length > 20 && !demoLike;
      results.push({ ...mod, ok, len: data.text?.length || 0, error: demoLike ? 'demo-like response' : data.message });
      console.log(ok ? `✓ (${data.text.length} chars)` : `✗ ${results.at(-1).error || 'empty'}`);
    } catch (e) {
      results.push({ ...mod, ok: false, error: e.message });
      console.log(`✗ ${e.message}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${passed}/${MODULES.length} modules OK ===\n`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error || 'no response'}`));
    process.exit(1);
  }
  console.log('All AI modules return live OpenAI responses.\n');
}

main();
