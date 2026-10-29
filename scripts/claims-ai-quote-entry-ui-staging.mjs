/**
 * Staging browser test of the claims chat buttons "הזנת הצעת מחיר" and "השלמת פרטי תיק", on the live
 * Staging site, through the screen only (click, type, attach, approve, reopen) — like a user.
 * node scripts/claims-ai-quote-entry-ui-staging.mjs        (E2E_BASE overrides the Staging site)
 *
 * Staging only. QA worker signed in by magic-link OTP (no password). Two fictitious QA claims; the owner's
 * quote text with the plate replaced by the QA claim's plate, so DAL-2026-0271 (plate 84488901) is not touched —
 * the script checks that it still has no quote at the end.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = process.env.E2E_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const QA_USER = 'qa.claims.worker.1788292403067@futurecraft.staging';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-ai-quote-entry-2026-10-29');
mkdirSync(OUT, { recursive: true });
const Q = { id: 'DAL-QA-QUOTE-0001', client: 'לקוח הצעת מחיר בדיקה', plate: '84-488-909', plateDigits: '84488909' };
const D = { id: 'DAL-QA-QUOTE-0002', client: 'לקוח השלמת פרטים בדיקה', plate: '73-019-41' };
const REAL = { id: 'DAL-2026-0271', plateDigits: '84488901' };
const DOCS_DIR = join(process.cwd(), 'docs/audit-reports/claims-ai-fill-from-docs-2026-10-28');
const DOC_FILES = ['driving-licence-third-party.png', 'vehicle-licence-third-party.png', 'insurance-third-party.png'].map((f) => join(DOCS_DIR, f));
if (!DOC_FILES.every(existsSync)) throw new Error('document images missing (run claims-ai-fill-from-docs-e2e-staging.mjs once)');
const QUOTE_TEXT = readFileSync(join(process.cwd(), 'scripts/fixtures/garage-quote-yoni.txt'), 'utf8').replaceAll(REAL.plateDigits, Q.plateDigits);

const checks = [];
const rec = (group, name, ok, extra = {}) => { checks.push({ group, name, ok: !!ok, ...extra }); console.log(`${ok ? 'PASS' : 'FAIL'} [${group}] ${name}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`); };

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(`https://${STAGING_REF}.supabase.co`, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const qaUserId = users.users.find((u) => u.email === QA_USER)?.id;

// ---- Fresh QA claims (no quotes, no documents, third-party details empty).
for (const c of [Q, D]) {
  if (!c.id.startsWith('DAL-QA-')) throw new Error('refused: not a QA id');
  const { data: q } = await admin.from('claim_quotes').select('id').eq('claim_id', c.id);
  if (q?.length) { await admin.from('claim_quote_versions').delete().eq('claim_id', c.id); await admin.from('claim_quotes').delete().eq('claim_id', c.id); }
  const { data: od } = await admin.from('claims_documents').select('storage_path').eq('claim_id', c.id);
  if (od?.length) { await admin.storage.from('claims-docs').remove(od.map((d) => d.storage_path)); await admin.from('claims_documents').delete().eq('claim_id', c.id); }
  await admin.from('claims_history').delete().eq('claim_id', c.id);
  const now = new Date().toISOString();
  await admin.from('claims_records').upsert({
    id: c.id, plate: c.plate, client_name: c.client, status: 'פתוח', company_name: 'QA ביטוח', assigned_to: qaUserId, assigned_to_name: 'QA', created_at: now, updated_at: now,
    row_data: { id: c.id, isQa: 'true', status: 'פתוח', clientName: c.client, plate: c.plate, carModel: 'QA', claimKind: 'תביעת צד ג׳', insCompany: 'QA ביטוח', eventDate: '2026-10-20', thirdInsCompany: c === D ? 'חברה קיימת בדיקה' : '', notes: 'תיק פיקטיבי לבדיקת דפדפן' },
  });
}
const realQuotesBefore = (await admin.from('claim_quotes').select('id').eq('claim_id', REAL.id)).data?.length ?? -1;

// ---- Sign in, open claims management.
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: QA_USER });
const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
const { data: auth } = await client.auth.verifyOtp({ email: QA_USER, token: link.properties.email_otp, type: 'email' });
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' })).newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
await page.goto(`${BASE}/?view=claims`, { waitUntil: 'networkidle', timeout: 60000 });
const deployed = await (await fetch(`${BASE}/STAGING-DEPLOY.txt?nc=${Date.now()}`)).text();
rec('אתר', 'האתר החי מציג את הגרסה שפורסמה', /deployed_ref=/.test(deployed), { deployed: deployed.trim() });

// ================= Quote entry =================
await page.click('[data-testid="claims-ai-open"]');
await page.waitForSelector('[data-testid="claims-ai-workspace"]');
const quoteBtn = await page.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 15000 }).catch(() => null);
const detailsBtn = await page.$('[data-testid="claims-ai-mode-details"]');
await page.locator('[data-testid="claims-ai-entry-modes"]').scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: join(OUT, '01-two-buttons.png') });
rec('כפתורים', 'שני הכפתורים מופיעים בצ׳אט הקיים', !!quoteBtn && !!detailsBtn, { quote: await quoteBtn?.innerText(), details: await detailsBtn?.innerText() });

await quoteBtn.click();
rec('כפתורים', 'לחיצה על "הזנת הצעת מחיר" מציגה הנחיה', (await page.innerText('[data-testid="claims-ai-mode-hint"]').catch(() => '')).includes('הצעת המחיר'));
await page.fill('[data-testid="claims-ai-input"]', QUOTE_TEXT);
await page.screenshot({ path: join(OUT, '02-quote-mode-pasted.png') });
const t0 = Date.now();
await page.click('[data-testid="claims-ai-send"]');
const confirm = await page.waitForSelector('[data-testid="claims-ai-confirm-btn"]', { timeout: 180000 }).catch(() => null);
const secs = Math.round((Date.now() - t0) / 1000);
const card = await page.locator('.claims-ai-msg, [data-testid="claims-ai-workspace"]').last().innerText().catch(() => '');
await page.screenshot({ path: join(OUT, '03-quote-preview.png'), fullPage: false });
rec('תצוגה', `תצוגה מקדימה הוצגה לאישור (${secs} שניות)`, !!confirm);
rec('שיוך', 'שויך לתיק הנכון לפי מספר הרכב שבהצעה', card.includes(Q.id) && card.includes(Q.client));
rec('תצוגה', 'הבדיקה מול הסיכומים שבהצעה: פחחות 15.5, מכונאות 6.5, 24 שעות, 5,390 ₪', ['✓ עבודות פחחות', '✓ עבודות מכונאות', '✓ סה״כ שעות', '✓ סכומים ידועים'].every((s) => card.includes(s)));
rec('תצוגה', 'צבע מופנה למחשבון הצבע, בלי מחיר ידני', card.includes('מחשבון הצבע'));
rec('תצוגה', '14 חלקי חילוף ללא מחיר', card.includes('חלקי חילוף (14)') && card.includes('מחיר להשלמה'));
const beforeApprove = (await admin.from('claim_quotes').select('id').eq('claim_id', Q.id)).data || [];
rec('אישור', 'לפני אישור — לא נשמרה הצעה', beforeApprove.length === 0);

// Full preview text into the report (it is long; the screenshot shows its top).
const allText = await page.innerText('[data-testid="claims-ai-workspace"]');
writeFileSync(join(OUT, 'quote-preview.txt'), allText.slice(allText.lastIndexOf('הזנת הצעת מחיר למחשבון — תיק')).slice(0, 6000));

if (confirm) await page.locator('[data-testid="claims-ai-confirm-btn"]').last().click();
await page.waitForSelector('text=הפעולה בוצעה במערכת ונשמרה בתיק', { timeout: 60000 }).catch(() => null);
await page.screenshot({ path: join(OUT, '04-quote-saved.png') });
const { data: saved } = await admin.from('claim_quotes').select('id, quote_no, version, status, total_amount, totals, data, created_by_name').eq('claim_id', Q.id);
const sq = (saved || [])[0];
const works = sq?.data?.works || [];
const parts = sq?.data?.parts || [];
rec('שמירה', 'אחרי אישור — נשמרה הצעה אחת בתיק הנכון', (saved || []).length === 1 && sq.version === 1, { quote_no: sq?.quote_no, version: sq?.version, by: sq?.created_by_name });
rec('שמירה', 'כל 18 סעיפי העבודה במחשבון', works.length === 18, { works: works.length });
rec('שמירה', 'כל 14 החלקים, כל אחד בנפרד, ללא מחיר', parts.length === 14 && parts.every((p) => !p.unitGross), { parts: parts.length });
rec('שמירה', 'קטגוריות המחשבון: פחחות, מכונאות, חשמל, פרונט, כיול ×2, רכב חשמלי, פנצ׳רמאכר, תקנה, רכב חלופי',
  ['body', 'mech', 'electric', 'alignment', 'ev', 'tire_repair', 'custom:תקנה', 'custom:רכב חלופי'].every((k) => works.some((w) => w.category === k)) && works.filter((w) => w.category === 'calibration').length === 2);
rec('שמירה', 'אין שורת צבע ידנית (צבע רק ממחשבון הצבע)', !works.some((w) => w.category === 'paint'));
rec('שמירה', 'חשמל 350 ₪ גלובלי (לא מוכפל בשעות)', works.some((w) => w.category === 'electric' && w.pricing === 'global' && w.globalPrice === 350));
rec('שמירה', 'סכומים במחשבון: פחחות 15.5×380, מכונאות 6.5×380', sq?.totals?.body === 5890 && sq?.totals?.mech === 2470, { body: sq?.totals?.body, mech: sq?.totals?.mech, extras: sq?.totals?.extras, total: sq?.total_amount });
const { data: hist } = await admin.from('claims_history').select('row_data').eq('claim_id', Q.id);
rec('תיעוד', 'נרשם בהיסטוריית התיק', (hist || []).some((h) => h.row_data?.type === 'quote_entry_from_chat'));

// Reopen the claim and the quote in the screen.
await page.click('[data-testid="claims-ai-close"]').catch(() => {});
await page.reload({ waitUntil: 'networkidle' });
await page.fill('[data-testid="claims-search"]', Q.client);
await page.click(`[data-testid="claim-row-${Q.id}"]`, { timeout: 30000 });
await page.click('[data-testid="claims-quote-btn"]', { timeout: 30000 });
await page.waitForSelector('[data-testid="cq-work-row"]', { timeout: 30000 }).catch(() => null);
const workRows = await page.locator('[data-testid="cq-work-row"]').count();
const partRows = await page.locator('[data-testid="cq-part-row"]').count();
// Line names sit in input boxes, so read the boxes' values, not the page text.
const editorText = (await page.$$eval('input', (els) => els.map((e) => e.value))).join(' | ');
await page.screenshot({ path: join(OUT, '05-quote-reopened.png') });
await page.mouse.wheel(0, 1500);
await page.screenshot({ path: join(OUT, '06-quote-reopened-parts.png') });
rec('פתיחה מחדש', 'פתיחת התיק מחדש — ההצעה במחשבון עם כל השורות', workRows >= 18 && partRows >= 14 && editorText.includes('מסרק הגה') && editorText.includes('כיוון פרונט'), { workRows, partRows });

// ================= Claim details =================
await page.goto(`${BASE}/?view=claims`, { waitUntil: 'networkidle' });
await page.click('[data-testid="claims-ai-open"]');
await page.click('[data-testid="claims-ai-mode-details"]');
await page.setInputFiles('[data-testid="claims-ai-file-input"]', DOC_FILES);
await page.fill('[data-testid="claims-ai-input"]', `תיכנס לתיק של ${D.client} ותשלים את פרטי צד ג׳ לפי המסמכים שצירפתי.`);
await page.click('[data-testid="claims-ai-send"]');
const confirm2 = await page.waitForSelector('[data-testid="claims-ai-confirm-btn"] >> nth=-1', { timeout: 180000 }).catch(() => null);
await page.screenshot({ path: join(OUT, '07-details-preview.png') });
const before2 = (await admin.from('claims_records').select('row_data').eq('id', D.id).single()).data.row_data;
rec('השלמת פרטים', 'כרטיס אישור הוצג ושום דבר לא נשמר לפני אישור', !!confirm2 && !before2.thirdParty);
if (confirm2) await page.locator('[data-testid="claims-ai-confirm-btn"]').last().click();
await page.waitForTimeout(8000);
await page.screenshot({ path: join(OUT, '08-details-saved.png') });
const after2 = (await admin.from('claims_records').select('row_data').eq('id', D.id).single()).data.row_data;
rec('השלמת פרטים', 'פרטי צד ג׳ נשמרו בשדות הנכונים', /דני/.test(after2.thirdParty || '') && after2.thirdLicense === '7654321' && /רוני/.test(after2.thirdOwner || '') && /מיכל/.test(after2.thirdInsured || ''));
rec('השלמת פרטים', 'ערך קיים לא נדרס', after2.thirdInsCompany === 'חברה קיימת בדיקה');

// ================= Safety =================
const realQuotesAfter = (await admin.from('claim_quotes').select('id').eq('claim_id', REAL.id)).data?.length ?? -1;
rec('בטיחות', 'DAL-2026-0271 (רכב 84488901) לא שונה — אין בו הצעה חדשה', realQuotesAfter === realQuotesBefore, { before: realQuotesBefore, after: realQuotesAfter });
await browser.close();

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, deployed: deployed.trim(), claims: [Q.id, D.id], checks }, null, 2));
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
