/**
 * Staging UI check: the claims AI chat screen fills third-party details from attached licences.
 * Start the local build first (its .env targets Staging): npx vite --port 8080
 * then: node scripts/claims-ai-fill-from-docs-ui-staging.mjs      (E2E_BASE overrides http://localhost:8080)
 *
 * Staging only, one fictitious QA claim (DAL-QA-FILL-7305), QA worker signed in by magic-link OTP (no password).
 * Uses the document images written by claims-ai-fill-from-docs-e2e-staging.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = process.env.E2E_BASE || 'http://localhost:8080';
const QA_USER = 'qa.claims.worker.1788292403067@futurecraft.staging';
const QA_ID = 'DAL-QA-FILL-7305';
const CLIENT = 'לקוח מסך בדיקה';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-ai-fill-from-docs-2026-10-28');
const FILES = ['driving-licence-third-party.png', 'vehicle-licence-third-party.png', 'insurance-third-party.png'].map((f) => join(OUT, f));
if (!FILES.every(existsSync)) throw new Error('run claims-ai-fill-from-docs-e2e-staging.mjs first (document images)');
if (!QA_ID.startsWith('DAL-QA-')) throw new Error('refused: not a QA id');

const checks = [];
const rec = (name, ok, extra = {}) => { checks.push({ name, ok: !!ok, ...extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`); };

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const URL_BASE = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(URL_BASE, service, { auth: { persistSession: false } });
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const qaUserId = users.users.find((u) => u.email === QA_USER)?.id;

// Fresh QA claim: third-party details empty, insurer of the third party already set (must not be overwritten).
const { data: oldDocs } = await admin.from('claims_documents').select('storage_path').eq('claim_id', QA_ID);
if (oldDocs?.length) { await admin.storage.from('claims-docs').remove(oldDocs.map((d) => d.storage_path)); await admin.from('claims_documents').delete().eq('claim_id', QA_ID); }
await admin.from('claims_history').delete().eq('claim_id', QA_ID);
const now = new Date().toISOString();
await admin.from('claims_records').upsert({
  id: QA_ID, plate: '73-019-35', client_name: CLIENT, status: 'פתוח', company_name: 'QA ביטוח', assigned_to: qaUserId, assigned_to_name: 'QA',
  created_at: now, updated_at: now,
  row_data: { id: QA_ID, isQa: 'true', status: 'פתוח', clientName: CLIENT, plate: '73-019-35', claimKind: 'תביעת צד ג׳', insCompany: 'QA ביטוח', eventDate: '2026-10-20', thirdInsCompany: 'חברה קיימת בדיקה', notes: 'תיק פיקטיבי — בדיקת מסך' },
});

const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: QA_USER });
const client = createClient(URL_BASE, anonKey, { auth: { persistSession: false } });
const { data: auth } = await client.auth.verifyOtp({ email: QA_USER, token: link.properties.email_otp, type: 'email' });

const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: 'he-IL' })).newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate((s) => localStorage.setItem(`sb-usfeoerkpcafxxlyuldl-auth-token`, JSON.stringify(s)), auth.session);
await page.goto(`${BASE}/?view=claims`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 60000 });

// 1. General claims chat: attach the three documents and ask in plain Hebrew.
await page.click('[data-testid="claims-ai-open"]');
await page.waitForSelector('[data-testid="claims-ai-workspace"]');
await page.setInputFiles('[data-testid="claims-ai-file-input"]', FILES);
await page.fill('[data-testid="claims-ai-input"]', `תיכנס לתיק של ${CLIENT} ותשלים את כל פרטי צד ג׳ לפי המסמכים שצירפתי.`);
await page.click('[data-testid="claims-ai-send"]');
const confirm = await page.waitForSelector('[data-testid="claims-ai-confirm-btn"]', { timeout: 180000 }).catch(() => null);
await page.screenshot({ path: join(OUT, 'ui-01-approval-card.png'), fullPage: false });
rec('כרטיס אישור מוצג בצ׳אט הקיים', !!confirm);
const cardText = await page.locator('[data-testid="claims-ai-workspace"]').innerText();
rec('הכרטיס מציג תיק, לקוח, מה יתווסף, סתירה וחסרים', cardText.includes(QA_ID) && cardText.includes(CLIENT) && cardText.includes('יתווסף לתיק') && cardText.includes('סותר מידע קיים') && cardText.includes('עדיין חסר'));
const beforeApprove = (await admin.from('claims_records').select('row_data').eq('id', QA_ID).single()).data.row_data;
rec('לפני לחיצה על אישור — שום שדה לא נשמר', !beforeApprove.thirdParty && !beforeApprove.thirdPlate);

// 2. Approve in the screen.
if (confirm) await confirm.click();
await page.waitForSelector('text=הפעולה בוצעה במערכת ונשמרה בתיק', { timeout: 60000 }).catch(() => null);
await page.screenshot({ path: join(OUT, 'ui-02-approved.png') });
const saved = (await admin.from('claims_records').select('row_data').eq('id', QA_ID).single()).data.row_data;
rec('אחרי אישור — פרטי צד ג׳ נשמרו', /דני/.test(saved.thirdParty || '') && saved.thirdPlate?.replace(/\D/g, '') === '5512367' && /רוני/.test(saved.thirdOwner || ''));
rec('אחרי אישור — הערך הקיים לא נדרס', saved.thirdInsCompany === 'חברה קיימת בדיקה');

// 3. Reopen the claim in the claims screen and read the third-party fields in the edit form.
await page.click('[data-testid="claims-ai-close"]');
await page.reload({ waitUntil: 'networkidle' });
await page.fill('[data-testid="claims-search"]', CLIENT);
await page.click(`[data-testid="claim-row-${QA_ID}"]`, { timeout: 30000 });
await page.click('[data-testid="claims-edit-btn"]', { timeout: 30000 });
await page.waitForSelector('[data-testid="intake-section-third"]', { timeout: 30000 }).catch(() => null);
const val = (id) => page.inputValue(`#${id}`).catch(() => '');
const form = { driver: await val('in_tdrv'), id: await val('in_tid'), license: await val('in_tlic'), owner: await val('in_town'), plate: await val('in_tplate'), insured: await val('in_tinsd'), insurer: await val('in_tins'), policy: await val('in_tpol') };
await page.locator('[data-testid="intake-section-third"]').scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: join(OUT, 'ui-03-claim-form-third-party.png') });
rec('פתיחת התיק מחדש — הטופס מציג את הנתונים שנשמרו', /דני/.test(form.driver) && form.license === '7654321' && /רוני/.test(form.owner) && /מיכל/.test(form.insured) && form.insurer === 'חברה קיימת בדיקה', form);

const { data: docs } = await admin.from('claims_documents').select('doc_meta').eq('claim_id', QA_ID);
rec('המסמכים נשמרו בתיק', (docs || []).length === 3, { titles: (docs || []).map((d) => d.doc_meta?.staff_title) });
await browser.close();

const r = (await admin.from('claims_records').select('row_data').eq('id', QA_ID).single()).data.row_data;
if (!process.env.KEEP) await admin.from('claims_records').update({ row_data: { ...r, deletedAt: new Date().toISOString() } }).eq('id', QA_ID);
writeFileSync(join(OUT, 'ui-report.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, target: STAGING_REF, checks }, null, 2));
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
