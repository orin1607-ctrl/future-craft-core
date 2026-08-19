/**
 * Viewport QA for Security Center mobile cards. No Production. No secrets.
 * node scripts/qa-security-center-mobile.mjs
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const OUT = join(process.cwd(), 'docs/audit-reports/security-identity-mobile-oren-car');
mkdirSync(OUT, { recursive: true });

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Security Center mobile fixture</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, sans-serif; background: #f6f7fb; color: #111; }
  .page { padding: 12px; max-width: 100%; overflow-x: hidden; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sum { background: #fff; border-radius: 16px; padding: 10px; box-shadow: 0 1px 4px #0001; min-width: 0; }
  .sum p { margin: 0; font-size: 11px; color: #666; }
  .sum b { display: block; font-size: 22px; margin-top: 4px; }
  .warn { border: 2px solid #f59e0b; background: #fffbeb; border-radius: 16px; padding: 10px; margin: 10px 0; }
  .event { background: #fff; border-radius: 16px; padding: 12px; margin: 10px 0; width: 100%; text-align: right; box-shadow: 0 1px 4px #0001; }
  .event.attention { border: 2px solid #f59e0b; }
  .badge { display: inline-block; font-size: 11px; font-weight: 700; background: #fef3c7; color: #92400e; border-radius: 999px; padding: 2px 8px; }
  .muted { color: #666; font-size: 12px; }
  input, button { width: 100%; padding: 10px; border-radius: 12px; border: 2px solid #ddd; margin: 6px 0; }
  .desktop-only { display: none; }
  table { width: 100%; border-collapse: collapse; background: #fff; }
  th, td { padding: 8px; text-align: right; border-top: 1px solid #eee; font-size: 13px; }
  @media (min-width: 768px) {
    .mobile-only { display: none; }
    .desktop-only { display: block; }
    .cards { grid-template-columns: repeat(5, 1fr); }
  }
</style>
</head>
<body>
<div class="page">
  <h1>מרכז בקרה ואבטחה</h1>
  <div class="warn"><b>גישה לא מזוהה</b><div class="muted">2 אירועים ללא שיוך אמין</div></div>
  <div class="cards">
    <div class="sum"><p>פעילים עכשיו</p><b>1</b></div>
    <div class="sum"><p>גישה לא מזוהה</p><b>2</b></div>
    <div class="sum"><p>GitHub</p><b>2</b></div>
    <div class="sum"><p>VPS</p><b>3</b></div>
  </div>
  <input placeholder="חיפוש חשבון, פעולה, IP, כלי..."/>
  <div class="event mobile-only">
    <div class="muted">19/08/2026 13:22</div>
    <div><b>GitHub</b></div>
    <div>מי: GitHub — orin1607-ctrl</div>
    <div>סוג/כלי: אדם · GitHub user</div>
    <div>פעולה: Push</div>
    <div>תוצאה: הצליח</div>
    <div>זמן פעילות: משך פעילות: לא זמין</div>
  </div>
  <div class="event attention mobile-only">
    <span class="badge">לא מזוהה</span>
    <div class="muted">19/08/2026 13:05</div>
    <div><b>Hostinger / VPS</b></div>
    <div>מי: root</div>
    <div>סוג/כלי: SSH · לא מזוהה</div>
    <div>פעולה: כניסת SSH</div>
    <div>תוצאה: הצליח</div>
    <div>זמן פעילות: משך פעילות: לא זמין</div>
  </div>
  <div class="desktop-only">
    <table>
      <thead><tr><th>תאריך</th><th>מקור</th><th>חשבון</th><th>כלי</th><th>פעולה</th><th>תוצאה</th></tr></thead>
      <tbody>
        <tr><td>19/08/2026 13:22</td><td>GitHub</td><td>GitHub — orin1607-ctrl</td><td>אדם</td><td>Push</td><td>הצליח</td></tr>
        <tr><td>19/08/2026 13:05</td><td>VPS</td><td>root</td><td>לא מזוהה</td><td>כניסת SSH</td><td>הצליח</td></tr>
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
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      desktopDisplay: desktop ? getComputedStyle(desktop).display : null,
      mobileDisplay: mobile ? getComputedStyle(mobile).display : null,
    };
  });
  const overflow = metrics.scrollWidth > metrics.innerWidth + 2;
  const expectDesktop = width >= 768;
  const layoutOk = expectDesktop
    ? metrics.desktopDisplay !== 'none' && metrics.mobileDisplay === 'none'
    : metrics.desktopDisplay === 'none' && metrics.mobileDisplay !== 'none';
  const shot = join(OUT, `mobile-${width}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  results.push({ width, overflow, layoutOk, ...metrics, screenshot: shot });
}

await browser.close();
writeFileSync(join(OUT, 'mobile-qa.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => (r.width <= 430 && r.overflow) || !r.layoutOk);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
if (failed.length) process.exit(1);
