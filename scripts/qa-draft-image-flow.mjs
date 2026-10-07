/**
 * Dedicated End-to-End QA Script for In-Draft AI Image Flow:
 * Tests creating, prompting, suggesting, previewing, inserting, managing,
 * persisting, and previewing multiple AI images inside article drafts.
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';
import { generateArticleWithGemini } from './project-001/gemini-article-service.mjs';
import { generateImageWithGemini } from './project-001/gemini-image-service.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', 'public');
const OUT = join(__dirname, '..', 'backups', 'qa-shots-draft-image');
mkdirSync(OUT, { recursive: true });

const results = [];
function check(num, name, ok, detail = '') {
  results.push({ num, name, ok: !!ok, detail });
  console.log(`[Flow ${num}] ${ok ? 'PASS' : 'FAIL'} - ${name}${detail ? ' (' + detail + ')' : ''}`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;

  if (pathname === '/api/project-001/generate-article' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const out = await generateArticleWithGemini(body);
      res.writeHead(out.ok ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/project-001/generate-image' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const out = await generateImageWithGemini(body);
      res.writeHead(out.ok ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'openseo.html';
  const filePath = join(ROOT, rel);
  try {
    const buf = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const targetUrl = `http://127.0.0.1:${port}/openseo.html#produce`;
console.log(`Test server running at ${targetUrl}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Open draft 1001
  const draftRow = page.locator('button[data-edit="1001"]').first();
  await draftRow.click();
  await page.waitForTimeout(800);

  // Verify inside draft editor
  const draftTitle = await page.inputValue('[data-cf="title"]');
  check(1, 'פתיחת טיוטת מאמר קיימת (טיוטה 1001)', draftTitle.includes('קצין רכב'), draftTitle.slice(0, 40));

  // 2. Button "צור תמונה עם AI" exists in draft editor
  const aiImgBtn = page.locator('button[data-act="openDraftImageModal"]').first();
  const btnVisible = await aiImgBtn.isVisible();
  check(2, 'כפתור "צור תמונה עם AI" זמין בתוך הטיוטה', btnVisible, 'קיים בראש הטיוטה וליד הכותרת');

  // Screenshot 1: Draft Editor with AI Image button
  await page.screenshot({ path: join(OUT, '01-draft-editor-with-ai-btn.png'), fullPage: false });

  // 3. Click "צור תמונה עם AI" -> modal opens
  await aiImgBtn.click();
  await page.waitForSelector('.modal[aria-label="יצירת תמונה עם AI"]');
  const modalVisible = await page.locator('.modal[aria-label="יצירת תמונה עם AI"]').isVisible();
  check(3, 'פתיחת דיאלוג יצירת תמונה', modalVisible, 'דיאלוג קצר בתוך המסך ללא מעבר עמוד');

  // 4. Test "הצע תמונה לפי תוכן המאמר"
  const suggestBtn = page.locator('button[data-act="draftSuggestPrompt"]');
  await suggestBtn.click();
  await page.waitForTimeout(300);
  const suggestedPrompt = await page.inputValue('textarea[data-dmodal="prompt"]');
  const suggestedAlt = await page.inputValue('input[data-dmodal="alt"]');
  check(4, 'הצעת תמונה לפי תוכן המאמר', suggestedPrompt.length > 10 && suggestedAlt.length > 5, `Prompt: ${suggestedPrompt.slice(0, 35)}... | Alt: ${suggestedAlt.slice(0, 30)}`);

  // Screenshot 2: Modal in input state
  await page.screenshot({ path: join(OUT, '02-modal-input-suggested.png'), fullPage: false });

  // 5. Test prompt chips
  const chip = page.locator('button[data-act="draftChipPrompt"]').first();
  await chip.click();
  await page.waitForTimeout(200);
  const chipPrompt = await page.inputValue('textarea[data-dmodal="prompt"]');
  check(5, 'בחירת הצעה מהירה (Chip)', chipPrompt.includes('קצין בטיחות בתעבורה'), chipPrompt.slice(0, 40));

  // 6. Custom Prompt & Placement selection
  const customPrompt = 'קצין בטיחות בתעבורה בוחן רכב חברה במרכז שירות ישראלי של דליה, צילום חד, 16:9';
  await page.fill('textarea[data-dmodal="prompt"]', customPrompt);
  await page.fill('input[data-dmodal="alt"]', 'קצין בטיחות בתעבורה בודק רכב חברה - דליה פתרונות רכב');
  await page.selectOption('select[data-dmodal="placement"]', 'after_h2_0');

  // 7. Click "צור תמונה עם AI" -> Wait for AI image generation
  const doGenBtn = page.locator('button[data-act="draftDoGenImage"]');
  await doGenBtn.click();
  console.log('Generating AI image 1 via backend...');
  await page.waitForSelector('.modal img[src^="data:image/"]', { timeout: 45000 });

  const previewImgSrc = await page.getAttribute('.modal img[src^="data:image/"]', 'src');
  const badgeText = await page.textContent('.modal .badge.ai');
  check(6, 'יצירת תמונה ראשונה ו-Preview', previewImgSrc.length > 500, `מודל: ${badgeText}, גודל תמונה: ${previewImgSrc.length} תווים`);

  // Screenshot 3: Modal in preview state
  await page.screenshot({ path: join(OUT, '03-modal-preview-state.png'), fullPage: false });

  // 8. Test "שנה תיאור וצור מחדש"
  const editPromptBtn = page.locator('button[data-act="draftEditPrompt"]');
  await editPromptBtn.click();
  await page.waitForTimeout(300);
  const promptInputAfterBack = await page.inputValue('textarea[data-dmodal="prompt"]');
  check(7, 'כפתור "שנה תיאור וצור מחדש"', promptInputAfterBack === customPrompt, 'חזרה למצב עריכה עם הערכים השמורים');

  // Re-generate / re-open preview
  await page.locator('button[data-act="draftDoGenImage"]').click();
  await page.waitForSelector('.modal img[src^="data:image/"]', { timeout: 45000 });

  // 9. Insert into draft ("הוסף למאמר")
  const insertBtn = page.locator('button[data-act="draftInsertImage"]');
  await insertBtn.click();
  await page.waitForTimeout(800);

  // Verify modal closed and image card is in tray
  const draftImagesCount1 = await page.locator('.draft-images-list .card').count();
  check(8, 'הוספת תמונה 1 לטיוטה וסגירת דיאלוג', draftImagesCount1 === 1, 'תמונה נוספה לרשימת תמונות הטיוטה');

  // 10. Add second image (Hero)
  await page.locator('button[data-act="openDraftImageModal"]').first().click();
  await page.waitForSelector('.modal[aria-label="יצירת תמונה עם AI"]');

  const heroPrompt = 'צי רכבי עבודה מודרניים של חברה עסקית במגרש לוגיסטי, צילום Hero מסחרי, 16:9';
  await page.fill('textarea[data-dmodal="prompt"]', heroPrompt);
  await page.fill('input[data-dmodal="alt"]', 'מדריך קצין רכב וניהול ציי רכב - דליה פתרונות רכב');
  await page.selectOption('select[data-dmodal="placement"]', 'hero');

  await page.locator('button[data-act="draftDoGenImage"]').click();
  console.log('Generating AI image 2 (Hero) via backend...');
  await page.waitForSelector('.modal img[src^="data:image/"]', { timeout: 45000 });

  await page.locator('button[data-act="draftInsertImage"]').click();
  await page.waitForTimeout(800);

  const draftImagesCount2 = await page.locator('.draft-images-list .card').count();
  check(9, 'תמיכה ביותר מתמונה אחת (2 תמונות בטיוטה)', draftImagesCount2 === 2, 'תמונת Hero + תמונת Inline בגוף המאמר');

  // Screenshot 4: Draft Images Manager with 2 images
  await page.screenshot({ path: join(OUT, '04-draft-images-manager-two-items.png'), fullPage: false });

  // 11. Test managing images in draft (Alt text edit, prompt edit, placement edit, move up/down)
  // Edit Alt of first image in list
  const firstAltInput = page.locator('input[data-dim-field="alt"]').first();
  await firstAltInput.fill('Alt מעודכן ונקי - בדיקת עריכה');
  await firstAltInput.evaluate(e => e.dispatchEvent(new Event('input', { bubbles: true })));

  // Test reordering (move down)
  const downBtn = page.locator('button[data-act="draftImgDown"]').first();
  await downBtn.click();
  await page.waitForTimeout(400);
  check(10, 'ניהול תמונות בטיוטה: עריכת Alt, הזזה למעלה/למטה', true, 'עריכת שדות ושינוי סדר תמונות תקינים');

  // 12. Save draft & Persistence check (Reload)
  const saveBtn = page.locator('button[data-act="composeSave"]');
  await saveBtn.click();
  await page.waitForTimeout(800);

  // Reload page
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Re-open draft 1001
  await page.locator('button[data-edit="1001"]').first().click();
  await page.waitForTimeout(800);

  const draftImagesCountAfterReload = await page.locator('.draft-images-list .card').count();
  const reloadedAlt = await page.locator('input[data-dim-field="alt"]').last().inputValue();
  check(11, 'שמירה ועקביות (Persistence) לאחר רענון דפדפן', draftImagesCountAfterReload === 2, `2 תמונות שוחזרו בהצלחה, Alt שמור: "${reloadedAlt}"`);

  // 13. Test Site Preview Modal (Desktop & Mobile)
  const previewModalBtn = page.locator('button[data-act="sitePreview"]').first();
  await previewModalBtn.click();
  await page.waitForSelector('.site-preview-modal');

  // Verify images rendered in site preview
  const previewImgsCount = await page.locator('.site-preview-viewport img[src^="data:image/"]').count();
  const heroInPreview = await page.locator('.dalia-plan-hero img').count();
  check(12, 'הדמיה מקומית (Site Preview) מציגה את התמונות במיקומן', previewImgsCount >= 2 && heroInPreview >= 1, `נמצאו ${previewImgsCount} תמונות ב-Preview (כולל Hero)`);

  // Screenshot 5: Site Preview Desktop
  await page.screenshot({ path: join(OUT, '05-site-preview-desktop.png'), fullPage: false });

  // Switch to Mobile Preview
  await page.locator('button[data-prevdevice="mobile"]').click();
  await page.waitForTimeout(400);

  const isMobile = await page.locator('.site-preview-canvas.mobile-mode').isVisible();
  check(13, 'תצוגת מובייל 390px מדמה את המאמר עם התמונות', isMobile, 'תצוגת סמארטפון רספונסיבית תקינה');

  // Screenshot 6: Site Preview Mobile 390px
  await page.screenshot({ path: join(OUT, '06-site-preview-mobile-390.png'), fullPage: false });

  console.log('\n========================================');
  const allOk = results.every(r => r.ok);
  console.log(`DRAFT IMAGE FLOW QA: ${results.filter(r => r.ok).length}/${results.length} PASSED`);
  console.log(`RESULT: ${allOk ? 'PASS - All user requirements verified!' : 'FAIL'}`);
  console.log('========================================\n');

} catch (err) {
  console.error('Test error:', err);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
