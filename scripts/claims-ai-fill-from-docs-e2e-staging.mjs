/**
 * Staging E2E: the claims AI chat fills claim details from attached documents.
 * node scripts/claims-ai-fill-from-docs-e2e-staging.mjs        (KEEP=1 leaves the QA claims active afterwards)
 *
 * Staging only. Signs in as the QA claims worker (no password, magic-link OTP via service role) and talks to the
 * deployed help-ai-chat exactly like the chat screen does (same body, same approval call). Every claim and
 * document is fictitious (DAL-QA-FILL-*, isQa = 'true'); real claims are only read, to prove they did not change.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const QA_USER = 'qa.claims.worker.1788292403067@futurecraft.staging';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-ai-fill-from-docs-2026-10-28');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = { at: new Date().toISOString(), target: STAGING_REF, productionTouched: false, user: QA_USER, checks: [], ok: false };
function rec(group, name, ok, extra = {}) {
  report.checks.push({ group, name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${group}] ${name}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`);
}

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const URL_BASE = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(URL_BASE, service, { auth: { autoRefreshToken: false, persistSession: false } });

// ---- Fictitious documents, rendered as images (the chat sends photos of licences).
const DOCS = {
  driving: {
    name: 'driving-licence-third-party.png',
    html: ['מדינת ישראל', 'רישיון נהיגה', '1. בדיקתי', '2. דני', '3. 01.01.1985', '4a. 01.01.2020 &nbsp; 4b. 01.01.2030', '4d. 000000018', '5. 7654321', '9. B'],
  },
  vehicle: {
    name: 'vehicle-licence-third-party.png',
    html: ['מדינת ישראל — משרד התחבורה', 'רישיון רכב', 'מספר רכב: 55-123-67', 'תוצר: מאזדה', 'דגם: 3', 'שנת ייצור: 2019', 'שם הבעלים: רוני בעלים', 'ת.ז. בעלים: 000000026'],
  },
  insurance: {
    name: 'insurance-third-party.png',
    html: ['תעודת ביטוח חובה', 'חברת הביטוח: ביטוח בדיקה בע״מ', 'מספר פוליסה: 99-887766', 'שם המבוטח: מיכל מבוטחת', 'מספר רכב: 55-123-67'],
  },
};
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 760, height: 520 } });
for (const d of Object.values(DOCS)) {
  await page.setContent(`<html dir="rtl"><body style="font:28px Arial;background:#fff;padding:30px">${d.html.map((l) => `<div style="margin:6px 0">${l}</div>`).join('')}</body></html>`);
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(join(OUT, d.name), png);
  d.base64 = png.toString('base64');
  d.bytes = png;
}
await browser.close();
const att = (...list) => list.map((d) => ({ name: d.name, mime_type: 'image/png', byte_size: d.bytes.length, data_base64: d.base64 }));

// ---- QA claims (reset to a known state on every run).
const { data: qaUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const qaUserId = (qaUsers?.users || []).find((u) => u.email === QA_USER)?.id;
if (!qaUserId) throw new Error('QA user not found');
// The "not allowed" claim belongs to another worker. (On Staging an unassigned claim is open to every claims
// worker — claims_can_work_claim allows assigned_to IS NULL — so an unassigned claim is not a forbidden one.)
const otherUserId = (qaUsers?.users || []).find((u) => u.id !== qaUserId && /qa\./i.test(u.email || ''))?.id
  || (qaUsers?.users || []).find((u) => u.id !== qaUserId)?.id;
if (!otherUserId) throw new Error('no second user for the permission check');
const QA = {
  A: { id: 'DAL-QA-FILL-7301', client: 'לקוח השלמה בדיקה', plate: '73-019-28', mine: true, extra: { thirdInsCompany: 'חברה קיימת בדיקה' } },
  B1: { id: 'DAL-QA-FILL-7302', client: 'לקוח כפול בדיקה', plate: '73-019-31', mine: true },
  B2: { id: 'DAL-QA-FILL-7303', client: 'לקוח כפול בדיקה', plate: '73-019-32', mine: true },
  C: { id: 'DAL-QA-FILL-7304', client: 'לקוח תיק פתוח בדיקה', plate: '73-019-29', mine: true },
  F: { id: 'DAL-QA-FILL-7399', client: 'לקוח לא משויך בדיקה', plate: '73-019-99', mine: false },
};
for (const q of Object.values(QA)) if (!q.id.startsWith('DAL-QA-')) throw new Error('refused: not a QA id');
const nowIso = new Date().toISOString();
for (const q of Object.values(QA)) {
  const { data: oldDocs } = await admin.from('claims_documents').select('id, storage_path').eq('claim_id', q.id);
  if (oldDocs?.length) {
    await admin.storage.from('claims-docs').remove(oldDocs.map((d) => d.storage_path));
    await admin.from('claims_documents').delete().eq('claim_id', q.id);
  }
  await admin.from('claims_history').delete().eq('claim_id', q.id);
  const rowData = {
    id: q.id, isQa: 'true', source: 'qa', status: 'פתוח', clientName: q.client, plate: q.plate, carModel: 'QA',
    claimKind: 'תביעת צד ג׳', insCompany: 'QA ביטוח', claimNum: `QA-CLM-${q.id.slice(-4)}`, eventDate: '2026-10-20',
    notes: 'תיק פיקטיבי לבדיקת השלמת פרטים ממסמכים', thirdParty: '', thirdPlate: '', ...(q.extra || {}),
  };
  const row = {
    id: q.id, plate: q.plate, client_name: q.client, status: 'פתוח', company_name: 'QA ביטוח', row_data: rowData,
    assigned_to: q.mine ? qaUserId : otherUserId, assigned_to_name: q.mine ? 'QA' : 'עובד אחר (בדיקה)', created_by: null, created_at: nowIso, updated_at: nowIso,
  };
  const { error } = await admin.from('claims_records').upsert(row);
  if (error) throw new Error(`setup ${q.id}: ${error.message}`);
}
const claimRow = async (id) => (await admin.from('claims_records').select('row_data, updated_at').eq('id', id).single()).data;
const docsOf = async (id) => (await admin.from('claims_documents').select('id, original_name, doc_meta, content_sha256').eq('claim_id', id)).data || [];

// Real claims: fingerprint before, compared at the end.
const realPrint = async () => {
  const { data } = await admin.from('claims_records').select('id, updated_at').not('id', 'like', 'DAL-QA-%').order('id');
  return JSON.stringify(data || []);
};
const realBefore = await realPrint();

// ---- Sign in as the QA worker.
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: QA_USER });
if (linkErr) throw linkErr;
const client = createClient(URL_BASE, anonKey, { auth: { persistSession: false } });
const { data: auth, error: otpErr } = await client.auth.verifyOtp({ email: QA_USER, token: linkData.properties.email_otp, type: 'email' });
if (otpErr || !auth.session) throw otpErr || new Error('verifyOtp');
const token = auth.session.access_token;

async function chat(messages, { claimId = '', attachments = [] } = {}) {
  const res = await fetch(`${URL_BASE}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
    body: JSON.stringify({ messages, claim_id: claimId || undefined, module: 'claims', attachments }),
  });
  const raw = await res.text();
  const out = { status: res.status, text: '', pending: null, tools: [] };
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
    try {
      const j = JSON.parse(line.slice(6));
      out.text += j.choices?.[0]?.delta?.content || '';
      if (j.pending_action) out.pending = j.pending_action;
      if (j.tools_used) out.tools = j.tools_used;
    } catch { /* not json */ }
  }
  if (!out.text && !out.pending) out.text = raw.slice(0, 400);
  return out;
}
/** The model may answer with a question first; ask once more, plainly, before failing. */
async function chatForPending(text, opts, nudge = 'כן, תכין את כרטיס האישור עכשיו לפי המסמכים שצירפתי.') {
  let r = await chat([{ role: 'user', content: text }], opts);
  if (!r.pending) r = await chat([{ role: 'user', content: text }, { role: 'assistant', content: r.text }, { role: 'user', content: nudge }], opts);
  return r;
}
async function approve(pending, claimId = '') {
  const res = await fetch(`${URL_BASE}/functions/v1/help-ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
    body: JSON.stringify({ action: 'execute_pending_action', pending_action: pending, claim_id: claimId || undefined }),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const changeOf = (p, field) => (p?.parameters?.changes || []).find((c) => c.field === field);
const transcript = [];
const log = (step, r) => transcript.push({ step, status: r.status, text: r.text, tools: r.tools, pending: r.pending ? { action_type: r.pending.action_type, summary: r.pending.summary, claim_id: r.pending.parameters?.claim_id, changes: r.pending.parameters?.changes, files: (r.pending.parameters?.files || []).map((f) => f.title) } : null });

// ================= 1. Find by file number + read licences + preview before saving =================
const before1 = await claimRow(QA.A.id);
const r1 = await chatForPending('תמצא את תיק תביעה מספר 7301 ותשלים את כל פרטי צד ג׳ לפי המסמכים שצירפתי.', { attachments: att(DOCS.driving, DOCS.vehicle, DOCS.insurance) });
log('1-file-number', r1);
const p1 = r1.pending;
rec('איתור', 'איתור לפי מספר תיק (7301)', p1?.parameters?.claim_id === QA.A.id, { claim: p1?.parameters?.claim_id, tools: r1.tools });
rec('קריאה', 'שם הנהג נקרא מרישיון הנהיגה', /דני/.test(changeOf(p1, 'thirdParty')?.after || '') && /בדיקתי/.test(changeOf(p1, 'thirdParty')?.after || ''), { value: changeOf(p1, 'thirdParty')?.after });
rec('קריאה', 'ת.ז. הנהג (לא ת.ז. בעל הרכב)', digits(changeOf(p1, 'thirdId')?.after).replace(/^0+/, '') === '18', { value: changeOf(p1, 'thirdId')?.after });
rec('קריאה', 'מספר רישיון נהיגה', digits(changeOf(p1, 'thirdLicense')?.after) === '7654321');
rec('קריאה', 'מספר רכב צד ג׳ מרישיון הרכב', digits(changeOf(p1, 'thirdPlate')?.after) === '5512367');
rec('קריאה', 'יצרן ודגם', /מאזדה/.test(changeOf(p1, 'thirdMakeModel')?.after || ''), { value: changeOf(p1, 'thirdMakeModel')?.after });
rec('קריאה', 'בעל הרכב נפרד מהנהג', /רוני/.test(changeOf(p1, 'thirdOwner')?.after || ''), { value: changeOf(p1, 'thirdOwner')?.after });
rec('קריאה', 'המבוטח נפרד מהנהג ומבעל הרכב', /מיכל/.test(changeOf(p1, 'thirdInsured')?.after || ''), { value: changeOf(p1, 'thirdInsured')?.after });
rec('קריאה', 'מספר פוליסה', digits(changeOf(p1, 'thirdPolicy')?.after) === '99887766');
rec('אי-דריסה', 'חברת ביטוח קיימת לא בכרטיס השמירה', !changeOf(p1, 'thirdInsCompany'));
const s1 = String(p1?.summary || '');
rec('תצוגה', 'הכרטיס מציג תיק ושם לקוח', s1.includes(QA.A.id) && s1.includes(QA.A.client));
rec('תצוגה', 'הכרטיס מציג מה יתווסף', s1.includes('יתווסף לתיק'));
rec('תצוגה', 'הכרטיס מציג סתירה מול מידע קיים', s1.includes('סותר מידע קיים') && s1.includes('חברה קיימת בדיקה'));
rec('תצוגה', 'הכרטיס מציג מה עדיין חסר', s1.includes('עדיין חסר'));
rec('תצוגה', 'הכרטיס מציג אילו מסמכים יישמרו', (p1?.parameters?.files || []).length === 3, { files: (p1?.parameters?.files || []).map((f) => f.title) });
const mid1 = await claimRow(QA.A.id);
rec('אישור', 'לפני אישור — דבר לא נשמר בתיק', JSON.stringify(mid1.row_data) === JSON.stringify(before1.row_data) && (await docsOf(QA.A.id)).length === 0);

// ================= 2. Approve, reopen, verify fields, history, audit, documents =================
const e1 = p1 ? await approve(p1) : { success: false };
rec('שמירה', 'אישור המשתמש מבצע את העדכון', e1.success === true, { message: e1.message });
const after1 = (await claimRow(QA.A.id)).row_data;
for (const c of p1?.parameters?.changes || []) rec('שמירה', `נשמר בשדה הנכון: ${c.label}`, String(after1[c.field] ?? '') === c.after);
rec('שמירה', 'שם הנהג נשמר גם בשדה של טופס ההודעה (thirdDriver)', after1.thirdDriver === after1.thirdParty && !!after1.thirdParty);
rec('אי-דריסה', 'חברת ביטוח צד ג׳ הקיימת נשארה', after1.thirdInsCompany === 'חברה קיימת בדיקה');
rec('אי-דריסה', 'שאר פרטי התיק לא השתנו', ['clientName', 'plate', 'notes', 'insCompany', 'claimNum', 'eventDate', 'status'].every((k) => after1[k] === before1.row_data[k]));
const { data: hist1 } = await admin.from('claims_history').select('row_data').eq('claim_id', QA.A.id);
const fieldHist = (hist1 || []).filter((h) => h.row_data?.action === 'עדכון פרטי תיק');
rec('תיעוד', 'היסטוריה: רשומה לכל שדה עם ערך קודם וחדש ומי עדכן', fieldHist.length === (p1?.parameters?.changes || []).length && fieldHist.every((h) => 'valueBefore' in h.row_data && h.row_data.valueAfter && h.row_data.by && h.row_data.at));
const { data: audit1 } = await admin.from('claims_ai_audit_log').select('status, user_id, state_before, state_after, created_at').eq('claim_id', QA.A.id).eq('action_type', 'fill_claim_from_documents').order('created_at');
const exec1 = (audit1 || []).find((a) => a.status === 'executed');
rec('תיעוד', 'יומן AI: מי, מתי, ערך קודם וחדש', !!exec1 && exec1.user_id === qaUserId && !!exec1.state_before && !!exec1.state_after && !!exec1.created_at);
const docs1 = await docsOf(QA.A.id);
rec('מסמכים', 'שלושת המסמכים נשמרו בתיק הנכון', docs1.length === 3, { titles: docs1.map((d) => d.doc_meta?.staff_title) });
rec('מסמכים', 'סווגו כמסמכי צד ג׳ (לא כמסמכי המבוטח)', docs1.every((d) => /^צד ג׳/.test(d.doc_meta?.staff_title || '') && d.doc_meta?.staff_type === 'other'));
const e1b = await approve(p1);
rec('מסמכים', 'אישור כפול לא יוצר כפילויות', (await docsOf(QA.A.id)).length === 3, { message: e1b.message });

// ================= 3. Find by plate + "what is still missing" =================
const r3 = await chat([{ role: 'user', content: `תמצא את התביעה של רכב ${QA.A.plate} ותגיד לי אילו פרטים עדיין חסרים בתיק.` }]);
log('3-plate-missing', r3);
rec('איתור', 'איתור לפי מספר רכב', r3.text.includes('7301') && r3.tools.some((t) => t.tool === 'get_claim_missing_fields' && t.outcome === 'ok'), { tools: r3.tools });
rec('חסרים', 'התשובה מונה פרטים חסרים (טלפון / כתובת צד ג׳)', /טלפון|כתובת/.test(r3.text));

// ================= 4. Find by client name, conflict, then an explicit request to replace =================
const r4 = await chat([{ role: 'user', content: `תיכנס לתיק של ${QA.A.client} ותוסיף את פרטי חברת הביטוח של צד ג׳ מהמסמך.` }], { attachments: att(DOCS.insurance) });
log('4-name-conflict', r4);
const after4 = (await claimRow(QA.A.id)).row_data;
rec('איתור', 'איתור לפי שם לקוח', r4.text.includes('7301') || r4.pending?.parameters?.claim_id === QA.A.id, { tools: r4.tools });
rec('אי-דריסה', 'מידע סותר לא הוחלף בלי בקשה מפורשת', after4.thirdInsCompany === 'חברה קיימת בדיקה' && !changeOf(r4.pending, 'thirdInsCompany'));
const r4b = await chatForPending(`תיכנס לתיק של ${QA.A.client}. אני מאשר במפורש להחליף את חברת הביטוח של צד ג׳ לערך שבמסמך המצורף.`, { attachments: att(DOCS.insurance) }, 'כן, תחליף את חברת הביטוח של צד ג׳ לפי המסמך.');
log('4b-override', r4b);
const ov = changeOf(r4b.pending, 'thirdInsCompany');
rec('סתירה', 'בקשה מפורשת לשדה מכינה החלפה עם הערך הקודם', ov?.before === 'חברה קיימת בדיקה' && /ביטוח בדיקה/.test(ov?.after || ''));
if (r4b.pending) await approve(r4b.pending);
const after4b = (await claimRow(QA.A.id)).row_data;
rec('סתירה', 'אחרי אישור — הוחלף ונרשם בהיסטוריה', /ביטוח בדיקה/.test(after4b.thirdInsCompany || '') && !!(await admin.from('claims_history').select('row_data').eq('claim_id', QA.A.id)).data?.some((h) => h.row_data?.valueBefore === 'חברה קיימת בדיקה'));
rec('מסמכים', 'מסמך שכבר בתיק לא נשמר שוב', (await docsOf(QA.A.id)).length === 3);

// ================= 5. Several matching claims → no update, list for choice =================
const b1 = await claimRow(QA.B1.id); const b2 = await claimRow(QA.B2.id);
const r5 = await chat([{ role: 'user', content: `תיכנס לתיק של ${QA.B1.client} ותשלים את פרטי צד ג׳ לפי המסמכים.` }], { attachments: att(DOCS.driving, DOCS.vehicle) });
log('5-ambiguous', r5);
rec('איתור', 'כמה תיקים מתאימים — מוצגים לבחירה', r5.text.includes('7302') && r5.text.includes('7303') && !r5.pending);
rec('איתור', 'אף תיק לא עודכן', JSON.stringify((await claimRow(QA.B1.id)).row_data) === JSON.stringify(b1.row_data) && JSON.stringify((await claimRow(QA.B2.id)).row_data) === JSON.stringify(b2.row_data));

// ================= 6. Permissions: a claim the user may not work on =================
const f0 = await claimRow(QA.F.id);
const r6 = await chat([{ role: 'user', content: `תשלים את פרטי צד ג׳ בתיק ${QA.F.id} לפי המסמכים שצירפתי.` }], { attachments: att(DOCS.driving) });
log('6-forbidden', r6);
rec('הרשאות', 'תיק לא מורשה — אין כרטיס עדכון', !r6.pending || r6.pending.parameters?.claim_id !== QA.F.id);
const forged = await approve({ preview_id: 'P-DOCFILL-forged', summary: 'forged', tool_name: 'preview_fill_claim_from_documents', action_type: 'fill_claim_from_documents', parameters: { claim_id: QA.F.id, changes: [{ field: 'thirdParty', label: 'צד ג׳ – שם הנהג', before: '', after: 'ניסיון עקיפה' }], files: att(DOCS.driving).map((f) => ({ ...f, title: 'צד ג׳ — רישיון נהיגה' })) } });
const forgedSave = await approve({ preview_id: 'P-SAVE-forged', summary: 'forged', tool_name: 'preview_save_attachment_to_claim', action_type: 'save_attachment_to_claim', parameters: { claim_id: QA.F.id, files: att(DOCS.driving), description: 'x' } });
rec('הרשאות', 'כרטיס מזויף לתיק לא מורשה נדחה בשרת', forged.success !== true && forgedSave.success !== true, { forged: forged.message, forgedSave: forgedSave.message });
rec('הרשאות', 'התיק הלא מורשה לא השתנה ואין בו מסמכים', JSON.stringify((await claimRow(QA.F.id)).row_data) === JSON.stringify(f0.row_data) && (await docsOf(QA.F.id)).length === 0);

// ================= 7. Inside an open claim: files uploaded on send, then filled =================
async function staffUpload(claimId, d) {
  const form = new FormData();
  form.set('action', 'staff_upload'); form.set('claim_id', claimId);
  form.set('file', new Blob([d.bytes], { type: 'image/png' }), d.name);
  form.set('doc_kind', 'surveyor_photo'); form.set('staff_type', 'damage_photos'); form.set('staff_title', d.name);
  const res = await fetch(`${URL_BASE}/functions/v1/claims-docs`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: anonKey }, body: form });
  return (await res.json()).file_id;
}
const fidV = await staffUpload(QA.C.id, DOCS.vehicle);
const fidD = await staffUpload(QA.C.id, DOCS.driving);
const attC = att(DOCS.vehicle, DOCS.driving).map((a, i) => ({ ...a, file_id: [fidV, fidD][i] }));
const r7 = await chatForPending('שלחתי עכשיו רישיון רכב ורישיון נהיגה. תעדכן את פרטי צד ג׳ בתיק.', { claimId: QA.C.id, attachments: attC });
log('7-open-claim', r7);
rec('תיק פתוח', 'כרטיס לתיק הפתוח בלבד', r7.pending?.parameters?.claim_id === QA.C.id);
if (r7.pending) await approve(r7.pending, QA.C.id);
const afterC = (await claimRow(QA.C.id)).row_data;
rec('תיק פתוח', 'פרטי צד ג׳ נשמרו בתיק הפתוח', digits(afterC.thirdPlate) === '5512367' && /דני/.test(afterC.thirdParty || ''));
rec('מסמכים', 'המסמכים משויכים לתיק הנכון ללא כפילות', (await docsOf(QA.C.id)).length === 2 && (await docsOf(QA.A.id)).length === 3);

// ================= Real claims untouched =================
rec('בטיחות', 'תיקים אמיתיים לא השתנו', (await realPrint()) === realBefore);

if (!process.env.KEEP) {
  for (const q of Object.values(QA)) {
    const r = await claimRow(q.id);
    await admin.from('claims_records').update({ row_data: { ...r.row_data, deletedAt: new Date().toISOString() } }).eq('id', q.id);
  }
}
report.ok = report.checks.every((c) => c.ok);
report.passed = report.checks.filter((c) => c.ok).length;
report.failed = report.checks.filter((c) => !c.ok).length;
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, transcript }, null, 2));
console.log(`\n${report.passed} passed, ${report.failed} failed → ${join(OUT, 'report.json')}`);
process.exit(report.ok ? 0 : 1);
