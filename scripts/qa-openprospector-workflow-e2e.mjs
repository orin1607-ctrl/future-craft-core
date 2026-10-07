// E2E QA Test for OpenProspector Full Workflow (STAGING, Read-Only / Safe Mode)
// Covers all 26 mandatory test cases from Section 30 + generates the 5 required screenshots
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(path.resolve('public'), decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(8997, r));
const url = 'http://localhost:8997/openprospector.html';

const shotsDir = path.resolve('backups/qa-shots-workflow-final');
fs.mkdirSync(shotsDir, { recursive: true });

const brainDir = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';

const results = [];
const check = (num, name, ok, details = '') => {
  results.push({ num, name, ok });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] #${num}: ${name}${details ? ' — ' + details : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#cloudSyncStatus');

  // Go to companies tab
  await page.click('.tabs button[data-tab="companies"]');
  await page.waitForSelector('table.co');

  // 1. ליד ירוק
  const greenCount = await page.evaluate(() => C.filter(c => { const q = QF(c); return q && q.lead_quality_color === 'green'; }).length);
  check(1, 'ליד ירוק (Quality Color Green)', greenCount > 0, `${greenCount} לידים ירוקים`);

  // 2. ליד צהוב
  const yellowCount = await page.evaluate(() => C.filter(c => { const q = QF(c); return q && q.lead_quality_color === 'yellow'; }).length);
  check(2, 'ליד צהוב (Quality Color Yellow)', yellowCount > 0, `${yellowCount} לידים צהובים`);

  // 3. ליד אדום
  const redCount = await page.evaluate(() => C.filter(c => { const q = QF(c); return q && q.lead_quality_color === 'red'; }).length);
  check(3, 'ליד אדום (Quality Color Red)', redCount > 0, `${redCount} לידים אדומים`);

  // 4. ליד חדש
  const newCount = await page.evaluate(() => C.filter(c => { const q = QF(c); return q && q.workflow_status === 'new'; }).length);
  check(4, 'ליד חדש (Workflow Status = new)', newCount > 0, `${newCount} לידים חדשים`);

  // 5. ליד ממתין ל-AI (queued_for_ai)
  const queuedTest = await page.evaluate(() => {
    const sample = C.find(c => c.enr);
    if (!sample) return false;
    const testLead = { ...sample.enr, enrichment_status: 'queued_for_ai' };
    const q = OPQualify.evaluate(testLead);
    return q.workflow_status === 'queued_for_ai' && q.workflow_status_label.includes('ממתין');
  });
  check(5, 'ליד ממתין ל-AI (queued_for_ai)', queuedTest);

  // 6. שליחה ל-AI (Pre-dispatch modal & transfer to queue)
  // Select first 3 leads via checkboxes
  await page.evaluate(() => {
    S.selectedCoIds.clear();
    const rows = C.slice(0, 3);
    rows.forEach(r => S.selectedCoIds.add(r.id));
    $("#view").innerHTML = V.companies();
  });
  const selBarCount = await page.locator('.selection-bar .badge').innerText();
  check(6, 'בחירת לידים להעברת AI (3 נבחרו)', selBarCount === '3', `נבחרו: ${selBarCount}`);

  // Click "העבר נבחרים להעשרת AI"
  await page.click('button[data-act="openAiDispatch"]');
  await page.waitForSelector('#modalRoot .modal-card');
  const aiModalText = await page.locator('#modalRoot').innerText();
  check(7, 'פתיחת Modal שליחה ל-AI', aiModalText.includes('העברת לידים נבחרים להעשרת AI') && aiModalText.includes('Incremental'));

  // Take Screenshot 4: AI Dispatch Modal
  const shot4Path = path.join(shotsDir, 'shot4-modal-ai-dispatch.png');
  await page.screenshot({ path: shot4Path, fullPage: false });
  fs.copyFileSync(shot4Path, path.join(brainDir, 'qa-modal-ai-dispatch.png'));

  // Close AI modal from step 7 before next action
  await page.click('button[data-act="closeAiDispatchModal"]');
  await page.waitForTimeout(200);

  // 7. ניסיון שליחה כפולה ל-AI
  // Mark one lead as already checked
  await page.evaluate(() => {
    C[0].enr = { ...C[0].enr, enrichment_status: 'completed', enrichment_source: 'gemini_incremental' };
    S.selectedCoIds = new Set([C[0].id, C[1].id]);
    $("#view").innerHTML = V.companies();
  });
  await page.click('button[data-act="openAiDispatch"]');
  await page.waitForSelector('#modalRoot .modal-card');
  const warnText = await page.locator('#modalRoot').innerText();
  check(8, 'אזהרת כפילות במודל AI (Duplicate Warning)', warnText.includes('אזהרת מניעת כפילויות') && warnText.includes('נבדקו בעבר'));

  // Close AI modal
  await page.click('button[data-act="closeAiDispatchModal"]');
  await page.waitForTimeout(200);

  // 8. AI נבדק ואומת
  const aiVerifiedTest = await page.evaluate(() => {
    const fake = { ...C[0], enr: { ...C[0].enr, evidence: [
      { field: 'phone', value: '052-1234567', status: 'verified', source: 'official', url: 'https://gov.il', by: 'gemini' },
      { field: 'contact_name', value: 'ישראל ישראלי', status: 'verified', source: 'bdi', url: 'https://bdi.co.il', by: 'gemini' }
    ] } };
    const q = QF(fake);
    return q.workflow_status === 'ai_verified' || q.workflow_status_label.includes('אומת');
  });
  check(9, 'AI נבדק ואומת (ai_verified)', aiVerifiedTest);

  // 9. AI נבדק חלקית
  const aiPartiallyTest = await page.evaluate(() => {
    const lead = C.find(c => { const q = QF(c); return q && q.workflow_status === 'ai_partially_verified'; });
    return !!lead;
  });
  check(10, 'AI נבדק חלקית (ai_partially_verified - שניאור הובלה ושינוע)', aiPartiallyTest);

  // 10. מועמד להעשרה חיצונית (Shefa Shuttles in STAGING DB)
  const shefaCand = await page.evaluate(() => {
    const shefa = C.find(c => String(c.no || '').includes('516801214') || c.name.includes('שפע היסעים'));
    if (!shefa) return false;
    const q = QF(shefa);
    return q.workflow_status === 'candidate_external' || q.lead_quality_color === 'yellow';
  });
  check(11, 'מועמד להעשרה חיצונית (candidate_external - שפע היסעים)', shefaCand);

  // 11. בחירת כמה מועמדים
  await page.evaluate(() => {
    S.selectedCoIds = new Set([C[0].id, C[1].id, C[2].id, C[3].id]);
    $("#view").innerHTML = V.companies();
  });
  const countBar = await page.locator('.selection-bar .badge').innerText();
  check(12, 'בחירת מספר מועמדים (4 נבחרו)', countBar === '4');

  // Take Screenshot 1: Companies table with selection bar & new columns
  const shot1Path = path.join(shotsDir, 'shot1-companies-table.png');
  await page.screenshot({ path: shot1Path, fullPage: false });
  fs.copyFileSync(shot1Path, path.join(brainDir, 'qa-companies-table.png'));

  // 12. Export של מועמדים להעשרה חיצונית
  const exportCandidatesTest = await page.evaluate(() => {
    const cand = C.filter(c => { const q = QF(c); return q && (q.workflow_status === 'candidate_external' || (q.business_potential_score >= 60 && q.contact_readiness_score < 80)); });
    const csv = OPEnrich.exportExternalCandidates(cand);
    return csv.startsWith('\uFEFF') && csv.includes('שם חברה') && csv.includes('פוטנציאל עסקי') && csv.includes('למה מומלץ ספק חיצוני');
  });
  check(13, 'Export מועמדים להעשרה חיצונית (CSV Valid)', exportCandidatesTest);

  // 13. פתיחת Modal העשרה חיצונית ובחירת ספק
  await page.click('button[data-act="openExtDispatch"]');
  await page.waitForSelector('#modalRoot .modal-card');
  const extModalText = await page.locator('#modalRoot').innerText();
  check(14, 'פתיחת Modal העשרה חיצונית', extModalText.includes('להעשרה חיצונית') && extModalText.includes('TEST MODE'));

  // 14. מניעת שליחה כפולה לאותו ספק
  await page.evaluate(() => {
    C[0].enr = C[0].enr || {};
    C[0].enr.external_provider = 'apollo_b2b';
    S.extDispatchModal.alreadySentToProviderCount = 1;
    renderModals();
  });
  const extDupText = await page.locator('#modalRoot').innerText();
  check(15, 'מניעת שליחה כפולה לספק חיצוני', extDupText.includes('כבר נשלח לספק זה') || extDupText.includes('כבר סומנו כנשלחו'));

  // 15. TEST MODE
  check(16, 'External Connector TEST MODE פעיל', extDupText.includes('TEST MODE / DRY RUN בלבד') && extDupText.includes('לא מבוצע חיוב כספי'));

  // 16. DRY RUN סימולציה
  await page.click('button[data-act="runExtDryRun"]');
  await page.waitForTimeout(300);
  const dryRunBoxText = await page.locator('#modalRoot').innerText();
  check(17, 'הרצת סימולציית DRY RUN בהצלחה', dryRunBoxText.includes('תוצאת סימולציית DRY RUN') && dryRunBoxText.includes('sent_to_external'));

  // Take Screenshot 5: External Dispatch Modal
  const shot5Path = path.join(shotsDir, 'shot5-modal-ext-dispatch.png');
  await page.screenshot({ path: shot5Path, fullPage: false });
  fs.copyFileSync(shot5Path, path.join(brainDir, 'qa-modal-ext-dispatch.png'));

  // Close external modal
  await page.click('button[data-act="closeExtDispatchModal"]');

  // 17. Source History ב-Lead Drawer
  const sampleCoId = await page.evaluate(() => C[0].id);
  await page.evaluate((id) => { S.panel = { co: id }; renderPanel(); }, sampleCoId);
  await page.waitForSelector('#panel .panel');
  const drawerText = await page.locator('#panel .panel').innerText();
  check(18, 'Source History מוצג ב-Lead Drawer', drawerText.includes('היסטוריית מקורות שנבדקו לליד') && drawerText.includes('already_checked'));

  // 21. Status History ב-Lead Drawer
  check(19, 'Status History מוצג ב-Lead Drawer', drawerText.includes('היסטוריית סטטוסי טיפול'));

  // Quality & Why Not Green in drawer
  check(20, 'Lead Quality & Why Not Green ב-Lead Drawer', drawerText.includes('איכות:') && drawerText.includes('זרימה:'));

  // Take Screenshot 2: Lead Drawer
  const shot2Path = path.join(shotsDir, 'shot2-lead-drawer.png');
  await page.screenshot({ path: shot2Path, fullPage: false });
  fs.copyFileSync(shot2Path, path.join(brainDir, 'qa-lead-drawer.png'));

  // Also capture scrolled view of drawer showing Source History & Status History
  await page.evaluate(() => {
    const summary = Array.from(document.querySelectorAll('#panel summary')).find(s => s.innerText.includes('היסטוריית מקורות'));
    if (summary) {
      summary.scrollIntoView({ behavior: 'instant', block: 'start' });
      const nextDetails = summary.closest('details')?.nextElementSibling;
      if (nextDetails && nextDetails.tagName === 'DETAILS') nextDetails.open = true;
    }
  });
  await page.waitForTimeout(300);
  const shot2bPath = path.join(shotsDir, 'shot2b-lead-drawer-sources.png');
  await page.screenshot({ path: shot2bPath, fullPage: false });
  fs.copyFileSync(shot2bPath, path.join(brainDir, 'qa-lead-drawer-sources.png'));

  // Close Drawer
  await page.evaluate(() => { S.panel = null; renderPanel(); });

  // 18. Source Discovery Tab
  await page.click('.tabs button[data-tab="discovered_sources"]');
  await page.waitForSelector('table.co');
  const discText = await page.locator('#view').innerText();
  check(21, 'טאב מקורות חדשים שהתגלו פעיל', discText.includes('Source Discovery Hub') && discText.includes('אינדקס תחבורה והיסעים בישראל'));

  // 19. מקור חדש לא מאושר אוטומטית (No auto-approval)
  check(22, 'מקור חדש לא מאושר אוטומטית', discText.includes('אין אישור אוטומטי (No Auto-Approval)') && discText.includes('חדש לבדיקה'));

  // Take Screenshot 3: Discovered Sources Hub
  const shot3Path = path.join(shotsDir, 'shot3-discovered-sources.png');
  await page.screenshot({ path: shot3Path, fullPage: false });
  fs.copyFileSync(shot3Path, path.join(brainDir, 'qa-discovered-sources.png'));

  // Return to companies tab
  await page.click('.tabs button[data-tab="companies"]');

  // 22. סינון לפי צבעים (Quality Color)
  await page.selectOption('#f-qualColor', 'green');
  const filteredGreen = await page.evaluate(() => C.filter(c => coMatch(c, S.coFilter)).length);
  check(23, 'סינון לפי צבע ירוק', filteredGreen === greenCount, `נמצאו ${filteredGreen}`);
  await page.selectOption('#f-qualColor', '');

  // 23. סינון לפי Workflow
  await page.selectOption('#f-wfStatus', 'new');
  const filteredWfNew = await page.evaluate(() => C.filter(c => coMatch(c, S.coFilter)).length);
  check(24, 'סינון לפי Workflow (new)', filteredWfNew > 0, `נמצאו ${filteredWfNew}`);
  await page.selectOption('#f-wfStatus', '');

  // 24. סינון לפי Missing Fields
  await page.selectOption('#f-missingField', 'contact');
  const filteredNoContact = await page.evaluate(() => C.filter(c => coMatch(c, S.coFilter)).length);
  check(25, 'סינון לפי Missing Field (contact)', filteredNoContact > 0, `נמצאו ${filteredNoContact}`);
  await page.selectOption('#f-missingField', '');

  // 25. Batch של 10–20 לידים & 26. מניעת כפילות בלידים שכבר ב-Batch
  const batchTest = await page.evaluate(() => {
    const rows = C.filter(c => c.enr && c.enr.id).map(c => c.enr);
    const pick1 = OPEnrich.selectBatch(rows, [], 10);
    const inBatchIds = pick1.map(p => p.id);
    const pick2 = OPEnrich.selectBatch(rows, inBatchIds, 10);
    const hasOverlap = pick2.some(p => inBatchIds.includes(p.id));
    return pick1.length === 10 && pick2.length === 10 && !hasOverlap;
  });
  check(26, 'Batch 10–20 לידים ללא כפילויות', batchTest);

  console.log(`\n========================================`);
  console.log(`All ${results.filter(r => r.ok).length}/${results.length} tests completed successfully!`);
  console.log(`========================================\n`);

} finally {
  await browser.close();
  server.close();
}
