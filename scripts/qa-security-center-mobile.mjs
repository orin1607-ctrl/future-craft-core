/**
 * Viewport QA for Security Center classification cards + labeled filters.
 * No Production. No secrets.
 * node scripts/qa-security-center-mobile.mjs
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const OUT = join(process.cwd(), 'docs/audit-reports/security-filters-classification-oren-car');
mkdirSync(OUT, { recursive: true });

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Security Center filters classification fixture</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, sans-serif; background: #f6f7fb; color: #111; }
  .page { padding: 12px; max-width: 100%; overflow-x: hidden; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .cards { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .sum { background: #fff; border-radius: 16px; padding: 10px; box-shadow: 0 1px 4px #0001; min-width: 0; border-right: 4px solid #10b981; }
  .sum.warn { border-right-color: #f59e0b; }
  .sum p { margin: 0; font-size: 11px; color: #666; }
  .sum b { display: block; font-size: 22px; margin-top: 4px; }
  .filters { background: #fff; border-radius: 16px; padding: 10px; margin: 10px 0; }
  .filters input { width: 100%; padding: 10px; border-radius: 12px; border: 2px solid #ddd; }
  .filters-extra { max-height: 256px; overflow-y: auto; display: none; }
  .filters-extra.open { display: block; }
  .filters label { display: block; font-size: 12px; font-weight: 700; margin-top: 8px; }
  .filters select, .filters .mini { width: 100%; padding: 10px; border-radius: 12px; border: 2px solid #ddd; }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  .quick button { padding: 8px 10px; border-radius: 12px; border: 2px solid #ddd; background: #fff; font-size: 12px; }
  .actions button { flex: 1; padding: 10px; border-radius: 12px; border: 2px solid #ddd; background: #fff; }
  .clear { background: #2563eb !important; color: #fff; border-color: #2563eb !important; }
  .event { background: #fff; border-radius: 16px; padding: 12px; margin: 10px 0; width: 100%; text-align: right; box-shadow: 0 1px 4px #0001; border-right: 4px solid #10b981; }
  .event.yellow { border-right-color: #f59e0b; }
  .event.orange { border-right-color: #f97316; }
  .event.red { border-right-color: #ef4444; }
  .badge { display: inline-block; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 8px; border: 1px solid; }
  .g { background: #d1fae5; color: #065f46; border-color: #10b981; }
  .y { background: #fef3c7; color: #92400e; border-color: #f59e0b; }
  .o { background: #ffedd5; color: #9a3412; border-color: #f97316; }
  .r { background: #fee2e2; color: #991b1b; border-color: #ef4444; }
  .muted { color: #666; font-size: 12px; }
  .desktop-only { display: none; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { padding: 8px; text-align: right; border-top: 1px solid #eee; font-size: 13px; }
  @media (min-width: 768px) {
    .mobile-only { display: none; }
    .desktop-only { display: block; }
    .cards { grid-template-columns: repeat(3, 1fr); }
    .filters-extra { display: flex !important; max-height: none; overflow: visible; flex-wrap: wrap; gap: 8px; }
    .toggle-filters { display: none; }
  }
</style>
</head>
<body>
<div class="page">
  <h1>מרכז בקרה ואבטחה</h1>
  <div class="cards">
    <div class="sum"><p>משתמשי אפליקציה פעילים עכשיו</p><b>1</b></div>
    <div class="sum"><p>מאושר על ידינו</p><b>2</b></div>
    <div class="sum warn" style="border-right-color:#f97316"><p>דורש בדיקה</p><b>1</b></div>
  </div>
  <div class="quick" style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">
    <button type="button">הכול</button>
    <button type="button">מאושרים</button>
    <button type="button">דורשים בדיקה</button>
    <button type="button">לא מזוהים</button>
    <button type="button">נכשלו/נחסמו</button>
  </div>
  <div class="filters">
    <input placeholder="חיפוש חופשי: שם, אימייל או מילה מהפעולה"/>
    <div class="actions">
      <button class="toggle-filters" type="button">עוד סינונים</button>
      <button class="clear" type="button">נקה סינונים</button>
    </div>
    <div class="filters-extra">
      <label>סטטוס אישור<select><option>הכול</option><option>מאושר על ידינו</option><option>דורש בדיקה</option><option>לא מאושר</option><option>נכשל / נחסם</option></select></label>
      <label>זהות<select><option>הכול</option><option>מזוהה</option><option>זהות לא זמינה</option><option>זהות לא מזוהה</option></select></label>
      <label>מערכת<select><option>הכול</option><option>אפליקציה</option><option>GitHub</option><option>Supabase</option><option>Hostinger/VPS</option></select></label>
      <label>כלי<select><option>הכול</option><option>Cursor/Cross</option><option>Claude Code</option><option>ChatGPT</option><option>GitHub Actions</option><option>Automation</option><option>לא מזוהה</option></select></label>
    </div>
  </div>
  <div class="event yellow mobile-only">
    <span class="badge y">זהות לא זמינה</span>
    <span class="badge g">מאושר — בדיקת QA</span>
    <div class="muted">14:18</div>
    <div><b>זהות לא זמינה</b></div>
    <div>מערכת: Supabase</div>
    <div>פעולה: אירוע Auth</div>
    <div>תוצאה: זהות לא זמינה</div>
  </div>
  <div class="event orange mobile-only">
    <span class="badge y">זהות לא מזוהה</span>
    <span class="badge o">דורש בדיקה</span>
    <div class="muted">14:11</div>
    <div><b>root</b></div>
    <div>מערכת: Hostinger / VPS</div>
    <div>פעולה: כניסת SSH</div>
    <div>תוצאה: הצלחה</div>
  </div>
  <div class="event red mobile-only">
    <span class="badge y">זהות לא מזוהה</span>
    <span class="badge r">נכשל / נחסם</span>
    <div class="muted">14:15</div>
    <div><b>root</b></div>
    <div>מערכת: Hostinger / VPS</div>
    <div>פעולה: כניסת SSH שנכשלה</div>
    <div>תוצאה: נכשל</div>
  </div>
  <div class="desktop-only">
    <table>
      <thead><tr><th>זהות</th><th>סטטוס אישור</th><th>מערכת</th><th>שם משתמש</th><th>פעולה</th><th>שעה</th></tr></thead>
      <tbody>
        <tr><td>זהות לא זמינה</td><td>מאושר — בדיקת QA</td><td>Supabase</td><td>—</td><td>אירוע Auth</td><td>14:18</td></tr>
        <tr><td>זהות לא מזוהה</td><td>דורש בדיקה</td><td>VPS</td><td>root</td><td>כניסת SSH</td><td>14:11</td></tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`;

writeFileSync(join(OUT, 'mobile-fixture.html'), html);

const widths = [320, 375, 390, 430, 1280];
const results = [];

const browser = await chromium.launch();
const page = await browser.newPage();
const fileUrl = 'file:///' + join(OUT, 'mobile-fixture.html').replace(/\\/g, '/');

for (const width of widths) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(fileUrl);
  const metrics = await page.evaluate(() => {
    const desktop = document.querySelector('.desktop-only');
    const mobile = document.querySelector('.mobile-only');
    const extra = document.querySelector('.filters-extra');
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      desktopDisplay: desktop ? getComputedStyle(desktop).display : null,
      mobileDisplay: mobile ? getComputedStyle(mobile).display : null,
      extraMaxHeight: extra ? getComputedStyle(extra).maxHeight : null,
    };
  });
  const overflow = metrics.scrollWidth > metrics.innerWidth + 2;
  const expectDesktop = width >= 768;
  const layoutOk = expectDesktop
    ? metrics.desktopDisplay !== 'none' && metrics.mobileDisplay === 'none'
    : metrics.desktopDisplay === 'none' && metrics.mobileDisplay !== 'none';
  const filtersNotFullscreen = expectDesktop || metrics.extraMaxHeight === 'none' || parseInt(metrics.extraMaxHeight || '0', 10) <= 320;
  const shot = join(OUT, `mobile-${width}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  results.push({ width, overflow, layoutOk, filtersNotFullscreen, ...metrics, screenshot: shot });
}

await browser.close();
writeFileSync(join(OUT, 'mobile-qa.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => (r.width <= 430 && r.overflow) || !r.layoutOk || !r.filtersNotFullscreen);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
if (failed.length) process.exit(1);
