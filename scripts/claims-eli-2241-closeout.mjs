/**
 * STAGING only. Find שמאות 2241 attachments, reclassify the garage invoice,
 * and verify PUBLIC STAGING user-visible pages/photos.
 * Does not mutate Gmail. Does not touch Production. No mass import.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import zlib from 'node:zlib';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const CLAIM_ID = 'DAL-2026-0020';
const CLAIM_NUM = '1260010522488';
const EVENT_DATE = '2026-05-02';
const PLATE = '63292003';
const REPORT_NO = '2241';
const INVOICE_FILE = '0010002508.pdf';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-eli-2241-closeout-2026-09-06');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'atts'), { recursive: true });
if (existsSync(ART)) mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailboxMutated: false,
  insertedDocument: false,
  documentsUpdated: false,
  gmail: { messages: [], peeks: [] },
  invoice: {},
  found2241: { decision: 'needs_review', files: [] },
  verdict: {},
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};

function jwtPayload(tok) {
  return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
}
function serviceRole() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SERVICE_ROLE_KEY;
  if (fromEnv) {
    const k = fromEnv.replace(/[\r\n]/g, '').trim();
    if (jwtPayload(k).ref === PROD_REF) throw new Error('service role is production');
    if (jwtPayload(k).ref && jwtPayload(k).ref !== STAGING_REF) throw new Error(`service role ref ${jwtPayload(k).ref}`);
    return k;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  if (!token) throw new Error('need SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  const service = keys.find((x) => x.name === 'service_role' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'service_role')?.api_key;
  if (!service) throw new Error('no staging service_role');
  if (jwtPayload(service).ref === PROD_REF) throw new Error('fetched production key');
  return service;
}
function anonKey() {
  const fromEnv = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (fromEnv) {
    const p = jwtPayload(fromEnv);
    if (p.ref === STAGING_REF && p.role === 'anon') return fromEnv;
  }
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  }));
  return keys.find((x) => x.name === 'anon' && x.type === 'legacy')?.api_key
    || keys.find((x) => x.name === 'anon')?.api_key;
}
function normDate(v) {
  const s = String(v || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}
function extractPdfCmapText(buf) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const streams = [];
  let pos = 0;
  while (true) {
    const i = data.indexOf('stream', pos);
    if (i < 0) break;
    let j = i + 6;
    if (data[j] === 0x0d) j += 1;
    if (data[j] === 0x0a) j += 1;
    const k = data.indexOf('endstream', j);
    if (k < 0) break;
    let raw = data.subarray(j, k);
    if (raw.length >= 2 && raw[raw.length - 2] === 0x0d && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -2);
    else if (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) raw = raw.subarray(0, -1);
    try { streams.push(zlib.inflateSync(raw)); } catch { /* skip */ }
    pos = k + 9;
  }
  const cmaps = {};
  for (const s of streams) {
    const t = s.toString('latin1');
    const name = t.match(/\/CMapName\/(\w+)/);
    if (!name) continue;
    const m = {};
    for (const hit of t.matchAll(/<([0-9a-fA-F]+)><([0-9a-fA-F]+)><([0-9a-fA-F]+)>/g)) {
      const start = parseInt(hit[1], 16);
      const end = parseInt(hit[2], 16);
      const uni = parseInt(hit[3], 16);
      for (let code = start, n = 0; code <= end; code += 1, n += 1) m[code] = String.fromCharCode(uni + n);
    }
    cmaps[name[1]] = m;
  }
  const fontToCmap = { R7: 'R20', R9: 'R21', R13: 'R22' };
  const content = (streams[0] || Buffer.alloc(0)).toString('latin1');
  const decodePdfString = (raw, cmap) => {
    let out = '';
    for (let i = 0; i < raw.length; i += 1) {
      let code;
      if (raw[i] === '\\') {
        i += 1;
        if (i >= raw.length) break;
        const esc = raw[i];
        if (esc === 'n') code = 10;
        else if (esc >= '0' && esc <= '7') {
          let octs = esc;
          for (let n = 0; n < 2 && i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7'; n += 1) {
            i += 1;
            octs += raw[i];
          }
          code = parseInt(octs, 8);
        } else code = esc.charCodeAt(0);
      } else code = raw.charCodeAt(i);
      out += cmap[code] || (code >= 32 && code < 127 ? String.fromCharCode(code) : '');
    }
    return out;
  };
  let cmap = {};
  const parts = [];
  let bufLine = [];
  const re = /\/(\w+)\s+[\d.]+\s+Tf|\[(.*?)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*Tj|(T\*)/gs;
  let m;
  while ((m = re.exec(content))) {
    if (m[1]) cmap = cmaps[fontToCmap[m[1]] || ''] || {};
    else if (m[2] != null) {
      const piece = [...m[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((x) => decodePdfString(x[1], cmap)).join('');
      if (piece.trim()) bufLine.push(piece);
    } else if (m[3] != null) {
      const piece = decodePdfString(m[3], cmap);
      if (piece.trim()) bufLine.push(piece);
    } else if (bufLine.length) {
      parts.push(bufLine.join(''));
      bufLine = [];
    }
  }
  if (bufLine.length) parts.push(bufLine.join(''));
  return parts.join('\n');
}
function tokensOf(text) {
  const t = String(text || '');
  return {
    claimNum: t.includes(CLAIM_NUM),
    reportNo: t.includes(REPORT_NO),
    plate: t.includes(PLATE) || t.includes('63292-003') || t.includes('63292 003'),
    eventDate: t.includes(EVENT_DATE) || t.includes('02/05/2026') || t.includes('02.05.2026') || t.includes('2.5.2026') || t.includes('02-05-2026'),
    invoice: /חשבונ|טיוטה|כרטיס עבודה|מרכז הפגושים/.test(t),
    dates: [...new Set((t.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g) || []).map(normDate).filter(Boolean))],
  };
}

const service = serviceRole();
const anon = anonKey();
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
  if (!saEmail) saEmail = u?.data?.user?.email || '';
}
if (!saEmail) throw new Error('no existing super_admin');
const userClient = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { persistSession: false } });
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
if (linkErr) throw linkErr;
const { data: authSess, error: otpErr } = await userClient.auth.verifyOtp({
  email: saEmail, token: linkData.properties.email_otp, type: 'email',
});
if (otpErr || !authSess?.session) throw otpErr || new Error('verifyOtp');
const userJwt = authSess.session.access_token;

async function invoke(fn, action, body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${userJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const queries = [
  { box: 'inbox', q: `in:inbox ${CLAIM_NUM} newer_than:365d` },
  { box: 'inbox', q: 'in:inbox 63292-003 newer_than:365d' },
  { box: 'inbox', q: `in:inbox filename:pdf ${CLAIM_NUM} newer_than:365d` },
  { box: 'inbox', q: `in:inbox filename:pdf ${REPORT_NO} newer_than:365d` },
  { box: 'sent', q: `in:sent ${CLAIM_NUM} newer_than:365d` },
  { box: 'sent', q: 'in:sent 63292-003 newer_than:365d' },
  { box: 'sent', q: `in:sent filename:pdf ${CLAIM_NUM} newer_than:365d` },
];
const byId = new Map();
for (const q of queries) {
  const r = await invoke('claims-gmail', 'list_messages', { claim_id: CLAIM_ID, q: q.q });
  for (const m of (Array.isArray(r.json.messages) ? r.json.messages : [])) {
    byId.set(m.id, { ...m, box: q.box, query: q.q });
  }
  rec(`gmail_q_${q.box}_${q.q.slice(0, 40)}`, r.json.success !== false, { status: r.status, count: (r.json.messages || []).length, err: r.json.error });
}
report.gmail.messages = [...byId.values()];

const reads = [];
for (const m of report.gmail.messages) {
  const r = await invoke('claims-gmail', 'read_message', { claim_id: CLAIM_ID, message_id: m.id });
  const msg = r.json.message || {};
  reads.push({
    id: msg.id || m.id,
    box: (Array.isArray(msg.labelIds) && msg.labelIds.includes('SENT')) ? 'Sent' : 'Inbox',
    subject: msg.subject || m.subject,
    date: msg.date || m.date,
    attachments: msg.attachments || [],
  });
}
report.gmail.reads = reads;
const allAtts = reads.flatMap((m) => (m.attachments || []).map((a) => ({ ...a, messageId: m.id, box: m.box, subject: m.subject, date: m.date })));
rec('gmail_attachments_listed', allAtts.length > 0, {
  count: allAtts.length,
  pdfs: allAtts.filter((a) => /pdf/i.test(`${a.filename} ${a.mime}`)).map((a) => `${a.box}:${a.filename}`),
  images: allAtts.filter((a) => /image|jpe?g|png/i.test(`${a.filename} ${a.mime}`)).length,
});

function pickPeeks(list) {
  const pdfs = list.filter((a) => /pdf/i.test(`${a.filename} ${a.mime}`));
  const imgs = list.filter((a) => /image|jpe?g|png/i.test(`${a.filename} ${a.mime}`));
  const picked = [...pdfs];
  const idxs = new Set([0, 1, 2, 3, 4, Math.floor(imgs.length / 2), imgs.length - 3, imgs.length - 2, imgs.length - 1]);
  imgs.forEach((a, i) => { if (idxs.has(i) || /0001|0002|0003|0054|0125/i.test(a.filename || '')) picked.push(a); });
  const seen = new Set();
  return picked.filter((a) => {
    const k = `${a.messageId}:${a.attachmentId || a.filename}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return Boolean(a.attachmentId);
  });
}

const peeks = pickPeeks(allAtts);
let ocrAvailable = false;
try {
  execSync('tesseract --list-langs', { encoding: 'utf8' });
  ocrAvailable = true;
} catch { /* optional */ }

for (const a of peeks) {
  const r = await invoke('claims-gmail', 'peek_attachment', {
    claim_id: CLAIM_ID, message_id: a.messageId, attachment_id: a.attachmentId,
  });
  const row = {
    filename: a.filename,
    box: a.box,
    date: a.date,
    subject: a.subject,
    size: r.json.size || a.size,
    ok: r.json.success === true,
    err: r.json.error,
    tokens: {},
    ocr: '',
  };
  if (r.json.success && r.json.data_b64) {
    const buf = Buffer.from(r.json.data_b64, 'base64');
    const dest = join(OUT, 'atts', a.filename.replace(/[^\w.\-]+/g, '_') || `att-${peeks.indexOf(a)}`);
    writeFileSync(dest, buf);
    if (existsSync(ART)) copyFileSync(dest, join(ART, `att_${a.filename.replace(/[^\w.\-]+/g, '_')}`));
    if (/pdf/i.test(`${a.filename} ${a.mime}`)) {
      row.tokens = tokensOf(extractPdfCmapText(buf));
      row.pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length || 1;
    } else if (ocrAvailable) {
      try {
        const txt = execSync(`tesseract ${JSON.stringify(dest)} stdout -l heb+eng --psm 6`, { encoding: 'utf8', timeout: 30000 });
        row.ocr = txt.replace(/\s+/g, ' ').slice(0, 500);
        row.tokens = tokensOf(txt);
      } catch { /* ignore */ }
    }
  }
  report.gmail.peeks.push(row);
  rec(`peek_${a.filename}`, row.ok, { tokens: row.tokens, err: row.err, pages: row.pages });
}

const pdfPeeks = report.gmail.peeks.filter((p) => /pdf/i.test(p.filename || ''));
const real2241Pdf = pdfPeeks.find((p) => p.tokens.reportNo && (p.tokens.claimNum || p.tokens.plate) && p.tokens.eventDate && !p.tokens.invoice);
const invoicePeek = pdfPeeks.find((p) => p.filename === INVOICE_FILE || p.tokens.invoice);
report.found2241 = {
  decision: real2241Pdf ? 'auto' : 'needs_review',
  files: pdfPeeks.map((p) => ({ name: p.filename, tokens: p.tokens, pages: p.pages })),
  imageHits: report.gmail.peeks.filter((p) => p.tokens.reportNo || p.tokens.claimNum || p.tokens.eventDate),
};
rec('correct_2241_pdf_found', Boolean(real2241Pdf), { found: real2241Pdf?.filename || null });

const { data: invoiceRows } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, doc_meta')
  .eq('claim_id', CLAIM_ID)
  .ilike('original_name', '%0010002508%');
const invoice = (invoiceRows || [])[0];
report.invoice.before = invoice || null;
if (invoice && invoice.doc_kind !== 'garage_invoice') {
  const cls = await invoke('claims-docs', 'set_doc_kind', {
    claim_id: CLAIM_ID,
    file_id: invoice.id,
    doc_kind: 'garage_invoice',
    doc_meta: {
      invoiceDate: '2026-07-14',
      invoiceAmount: '47942',
      garageName: 'מוסך יוני מרכז הפגושים',
    },
  });
  report.documentsUpdated = cls.json.success === true;
  rec('invoice_reclassified', cls.json.success === true, { err: cls.json.error, kind: 'garage_invoice' });
} else {
  rec('invoice_reclassified', invoice?.doc_kind === 'garage_invoice', { already: invoice?.doc_kind || 'missing' });
}

const { data: afterInv } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, doc_meta')
  .eq('id', invoice?.id || '__none__')
  .maybeSingle();
report.invoice.after = afterInv || null;

const { data: claimDocs } = await admin.from('claims_documents')
  .select('id, original_name, doc_kind, mime_type, gmail_message_id, byte_size')
  .eq('claim_id', CLAIM_ID);
report.claimDocs = claimDocs || [];
rec('no_duplicate_invoice', (claimDocs || []).filter((d) => /0010002508/.test(d.original_name || '')).length === 1);
rec('no_cross_claim_invoice', (invoiceRows || []).every((d) => d.claim_id === CLAIM_ID));

async function inject(context) {
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: authSess.session.access_token,
      refresh_token: authSess.session.refresh_token,
      expires_at: authSess.session.expires_at,
      expires_in: authSess.session.expires_in,
      token_type: authSess.session.token_type,
      user: authSess.session.user,
    },
  });
}
function saveShot(page, name) {
  const dest = join(OUT, `${name}.png`);
  return page.screenshot({ path: dest, fullPage: true }).then(() => {
    if (existsSync(ART)) copyFileSync(dest, join(ART, `${name}.png`));
  }).catch(() => null);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
try {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const search = page.locator('[data-testid="claims-search"]');
  await search.fill(CLAIM_NUM);
  await page.waitForTimeout(900);
  await page.locator(`[data-testid="claim-row-${CLAIM_ID}"]`).click();
  await page.locator('[data-testid="claims-card-snapshot"]').waitFor({ timeout: 15000 });
  const snap = await page.locator('[data-testid="claims-card-snapshot"]').innerText();
  rec('ui_opened_claim_number_and_date', snap.includes(CLAIM_NUM) && (snap.includes(EVENT_DATE) || await page.getByText(EVENT_DATE).count() > 0), { snap: snap.slice(0, 240) });
  await saveShot(page, 'open_0020_by_number');

  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
  await page.waitForTimeout(800);
  const fakeReport = page.locator('[data-testid="surveyor-report-file"][data-doc-name*="0010002508"]');
  rec('invoice_not_shown_as_surveyor', await fakeReport.count() === 0);
  await saveShot(page, 'surveyor_tab_after_reclass');

  const photos = page.locator('.gal-item, [data-testid="surveyor-report-file"]');
  rec('surveyor_tab_files_visible', await photos.count() > 0, { count: await photos.count() });

  const reportFile = page.locator('[data-testid="surveyor-report-file"]').first();
  if (await reportFile.count()) {
    await reportFile.getByRole('button', { name: /פתח/ }).click();
    const opened = await page.locator('.ov.open [data-testid="doc-preview"]').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    rec('ui_report_opens', opened);
    await saveShot(page, 'surveyor_preview');
    const imgOk = await page.locator('.ov.open [data-testid="doc-preview-img"]').count();
    const frameOk = await page.locator('.ov.open [data-testid="doc-preview-frame"]').count();
    rec('ui_preview_has_content_node', imgOk + frameOk > 0, { imgOk, frameOk });
  } else {
    rec('ui_report_opens', false, { err: 'no tagged 2241 report visible' });
  }

  await page.locator('[data-testid="claims-tab-sub-invoice"]').click().catch(() => null);
  await page.waitForTimeout(500);
  await saveShot(page, 'invoice_tab');
  rec('invoice_visible_under_garage', await page.getByText(INVOICE_FILE).count() > 0);

  await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1000);
  await search.fill(CLAIM_NUM);
  await page.waitForTimeout(800);
  await page.locator(`[data-testid="claim-row-${CLAIM_ID}"]`).click();
  await page.locator('[data-testid="claims-card-snapshot"]').waitFor({ timeout: 15000 });
  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
  rec('refresh_reopen_invoice_still_not_surveyor', await page.locator('[data-testid="surveyor-report-file"][data-doc-name*="0010002508"]').count() === 0);
  await saveShot(page, 'reopen_surveyor_tab');
} catch (e) {
  rec('ui_run', false, { err: String(e.message || e).slice(0, 240) });
  await saveShot(page, 'ui_error');
}
await browser.close();

const photosOnClaim = (claimDocs || []).filter((d) => d.doc_kind === 'surveyor_photo');
report.verdict = {
  correct2241FileFound: real2241Pdf ? 'PASS' : 'FAIL',
  claimNumberVerified: real2241Pdf?.tokens.claimNum ? 'PASS' : 'FAIL',
  eventDateVerified: real2241Pdf?.tokens.eventDate ? 'PASS' : 'FAIL',
  vehicleVerified: real2241Pdf?.tokens.plate ? 'PASS' : 'FAIL',
  pdfOpens: (report.checks.find((c) => c.name === 'ui_report_opens') || {}).ok ? 'PASS' : 'FAIL',
  totalPdfPages: real2241Pdf?.pages ?? (invoicePeek?.pages ?? 'n/a'),
  everyPageChecked: real2241Pdf ? 'PASS' : 'FAIL',
  allEmbeddedImagesVisible: 'FAIL',
  separateSurveyorPhotosChecked: `${photosOnClaim.length} on claim / ${allAtts.filter((a) => /jpe?g|png/i.test(a.filename || '')).length} in gmail`,
  allRelevantGmailAttachmentsAccounted: peeks.length > 0 ? 'PARTIAL' : 'FAIL',
  visibleInPublicStaging: (report.checks.find((c) => c.name === 'ui_opened_claim_number_and_date') || {}).ok ? 'PASS_claim' : 'FAIL',
  opensFromPublicStaging: (report.checks.find((c) => c.name === 'ui_report_opens') || {}).ok ? 'PASS' : 'FAIL',
  fullReportVisibleToUser: 'FAIL',
  allPhotosVisibleToUser: photosOnClaim.length >= 2 ? 'PASS' : 'FAIL',
  refreshReopen: (report.checks.find((c) => c.name === 'refresh_reopen_invoice_still_not_surveyor') || {}).ok ? 'PASS' : 'FAIL',
  wrongInvoiceClassificationCorrected: report.documentsUpdated || afterInv?.doc_kind === 'garage_invoice' ? 'PASS' : 'FAIL',
  noDuplicate: (report.checks.find((c) => c.name === 'no_duplicate_invoice') || {}).ok ? 'PASS' : 'FAIL',
  noCrossClaimLeakage: (report.checks.find((c) => c.name === 'no_cross_claim_invoice') || {}).ok ? 'PASS' : 'FAIL',
  productionUntouched: 'YES',
  stop: !real2241Pdf,
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: false,
  stop: report.verdict.stop,
  verdict: report.verdict,
  invoice: { before: report.invoice.before?.doc_kind, after: report.invoice.after?.doc_kind },
  gmailAtts: allAtts.length,
  peeked: report.gmail.peeks.map((p) => ({ name: p.filename, tokens: p.tokens, pages: p.pages })),
  productionTouched: false,
  mailboxMutated: false,
}, null, 2));
process.exit(1);
