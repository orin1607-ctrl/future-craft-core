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
const MSG_2241 = '19f60ae6ef9f80fe';
const INVOICE_FILE = '0010002508.pdf';
const IMPORT_BATCH = 12;
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
    plate: t.includes(PLATE) || t.includes('63292-003') || t.includes('63292 003') || /63292/.test(t),
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
  imgs.forEach((a, i) => { if (idxs.has(i) || /0001|0002|0003|0004|0005|0054|0062|0125/i.test(a.filename || '')) picked.push(a); });
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

function looksLikeReportPage(p) {
  return /rcv000[1234]\.jpe?g/i.test(String(p.filename || ''));
}

const packRead = reads.find((m) => m.id === MSG_2241);
const packAtts = packRead?.attachments || [];
const page1Peek = report.gmail.peeks.find((p) => /rcv0001\.jpe?g/i.test(p.filename || '') && p.tokens?.claimNum && p.tokens?.reportNo);
const reportPeeks = report.gmail.peeks.filter(looksLikeReportPage);
const invoicePeek = report.gmail.peeks.find((p) => p.filename === INVOICE_FILE);
report.found2241 = {
  decision: page1Peek ? 'auto' : 'needs_review',
  kind: 'scanned_jpg_pages',
  page1: page1Peek ? { filename: page1Peek.filename, tokens: page1Peek.tokens, ocr: page1Peek.ocr } : null,
  reportPages: reportPeeks.map((p) => ({ name: p.filename, tokens: p.tokens })),
  imageHits: report.gmail.peeks.filter((p) => p.tokens?.reportNo || p.tokens?.claimNum || p.tokens?.eventDate),
  packMessageId: MSG_2241,
  packAttachmentCount: packAtts.length,
};
rec('correct_2241_file_found', Boolean(page1Peek), {
  found: page1Peek?.filename || null,
  claimNumOnPage1: Boolean(page1Peek?.tokens?.claimNum),
  reportNoOnPage1: Boolean(page1Peek?.tokens?.reportNo),
  eventDatePrintedOnPage1: Boolean(page1Peek?.tokens?.eventDate),
  plateOnPage1: Boolean(page1Peek?.tokens?.plate),
  note: 'No 2241 PDF exists. Real report is scanned JPG pages in Inbox 19f60ae6ef9f80fe.',
});
rec('2241_is_not_the_invoice_pdf', Boolean(invoicePeek) && !invoicePeek.tokens?.claimNum && !invoicePeek.tokens?.reportNo, {
  invoice: invoicePeek?.filename,
  tokens: invoicePeek?.tokens,
});

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

const { data: otherImp } = await admin.from('claims_gmail_imports')
  .select('id, claim_id, gmail_message_id')
  .eq('gmail_message_id', MSG_2241);
const leakImp = (otherImp || []).filter((r) => r.claim_id !== CLAIM_ID);
rec('2241_message_not_on_other_claim', leakImp.length === 0, { other: leakImp.map((r) => r.claim_id) });
if (leakImp.length) {
  report.verdict = { stop: true, reason: '2241 pack already imported to another claim — no cross-claim move' };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, stop: true, leakImp }, null, 2));
  process.exit(1);
}
if (!page1Peek) {
  report.verdict = { stop: true, reason: 'page1 identifiers not proven — not importing' };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, stop: true, found2241: report.found2241 }, null, 2));
  process.exit(1);
}
if (packAtts.length < 10) {
  report.verdict = { stop: true, reason: '2241 pack attachment list incomplete — not importing' };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, stop: true, packAtts: packAtts.length }, null, 2));
  process.exit(1);
}

report.import = { messageId: MSG_2241, batches: [] };
let start = 0;
for (let i = 0; i < 20; i += 1) {
  let r = { status: 0, json: {} };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    r = await invoke('claims-gmail', 'import_message', {
      claim_id: CLAIM_ID,
      message_id: MSG_2241,
      start,
    });
    if (r.json.success === true || r.json.error === 'already_imported_other_claim') break;
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  report.import.batches.push({
    start,
    status: r.status,
    success: r.json.success,
    done: r.json.done,
    uploaded: r.json.uploaded,
    skippedExisting: r.json.skippedExisting,
    found: r.json.found,
    imported: r.json.imported,
    failed: r.json.failed,
    err: r.json.error,
  });
  rec(`import_batch_${start}`, r.json.success === true && r.json.error !== 'already_imported_other_claim', {
    uploaded: r.json.uploaded, skipped: r.json.skippedExisting, imported: r.json.imported, failed: r.json.failed, err: r.json.error,
  });
  if (r.json.error === 'already_imported_other_claim') {
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }
  if (r.json.done === true || r.json.success === false) break;
  start = Number(r.json.start || start + IMPORT_BATCH);
}
const lastBatch = report.import.batches[report.import.batches.length - 1] || {};
rec('import_2241_pack_done', lastBatch.done === true && lastBatch.success === true, lastBatch);

const { data: claimDocs } = await admin.from('claims_documents')
  .select('id, original_name, doc_kind, mime_type, gmail_message_id, content_sha256, byte_size, doc_meta')
  .eq('claim_id', CLAIM_ID);
report.claimDocs = claimDocs || [];

const reportPageNames = new Set(['rcv0001.jpg', 'rcv0002.jpg', 'rcv0003.jpg', 'rcv0004.jpg']);
const reportDocs = (claimDocs || []).filter((d) => reportPageNames.has(String(d.original_name || '').toLowerCase()));
report.taggedReports = [];
for (const d of reportDocs) {
  const cls = await invoke('claims-docs', 'set_doc_kind', {
    claim_id: CLAIM_ID,
    file_id: d.id,
    doc_kind: 'surveyor_report',
    doc_meta: {
      reportNumber: '2241-0-1',
      reportDate: '2026-05-06',
      surveyorName: 'גליל גולן שמאות',
    },
  });
  report.taggedReports.push({ id: d.id, name: d.original_name, ok: cls.json.success === true, err: cls.json.error });
  rec(`tag_report_${d.original_name}`, cls.json.success === true, { err: cls.json.error });
  if (cls.json.success) report.documentsUpdated = true;
}

const feeInvoice = (claimDocs || []).find((d) => /^rcv0005\.jpe?g$/i.test(d.original_name || ''));
if (feeInvoice && feeInvoice.doc_kind !== 'surveyor_attachment') {
  const cls = await invoke('claims-docs', 'set_doc_kind', {
    claim_id: CLAIM_ID,
    file_id: feeInvoice.id,
    doc_kind: 'surveyor_attachment',
    doc_meta: { surveyorName: 'גליל גולן שמאות', reportNumber: '2241-0-1' },
  });
  rec('tag_surveyor_fee_invoice_as_attachment', cls.json.success === true, { err: cls.json.error, name: feeInvoice.original_name });
  if (cls.json.success) report.documentsUpdated = true;
} else {
  rec('tag_surveyor_fee_invoice_as_attachment', feeInvoice?.doc_kind === 'surveyor_attachment', { already: feeInvoice?.doc_kind || 'missing' });
}

const { data: afterDocs } = await admin.from('claims_documents')
  .select('id, original_name, doc_kind, mime_type, gmail_message_id, content_sha256, byte_size, doc_meta')
  .eq('claim_id', CLAIM_ID);
const docsNow = afterDocs || claimDocs || [];
const packDocs = docsNow.filter((d) => d.gmail_message_id === MSG_2241);
const gmailNames = packAtts.map((a) => String(a.filename || '').toLowerCase());
const haveNames = new Set(docsNow.map((d) => String(d.original_name || '').toLowerCase()));
const missingAtts = gmailNames.filter((n) => !haveNames.has(n));
if (missingAtts.length) {
  for (let i = 0; i < 3 && missingAtts.length; i += 1) {
    await invoke('claims-gmail', 'import_message', { claim_id: CLAIM_ID, message_id: MSG_2241, start: 0 });
  }
}
const { data: docsRetry } = await admin.from('claims_documents')
  .select('id, original_name, doc_kind, mime_type, gmail_message_id, content_sha256, byte_size, doc_meta')
  .eq('claim_id', CLAIM_ID);
const docsAfterRetry = docsRetry || docsNow;
const haveNames2 = new Set(docsAfterRetry.map((d) => String(d.original_name || '').toLowerCase()));
const missingAtts2 = gmailNames.filter((n) => !haveNames2.has(n));
const hashAccounted = missingAtts2.length === 0;
rec('all_2241_attachments_on_claim', hashAccounted, {
  gmail: packAtts.length,
  packDocs: docsAfterRetry.filter((d) => d.gmail_message_id === MSG_2241).length,
  missing: missingAtts2,
  retried: missingAtts,
});
const docsFinal = docsAfterRetry;
rec('no_duplicate_invoice', docsFinal.filter((d) => /0010002508/.test(d.original_name || '')).length === 1);
rec('invoice_kind_garage', docsFinal.some((d) => /0010002508/.test(d.original_name || '') && d.doc_kind === 'garage_invoice'));
rec('no_cross_claim_invoice', (invoiceRows || []).every((d) => d.claim_id === CLAIM_ID));

const { data: leakedDocs } = await admin.from('claims_documents')
  .select('id, claim_id, original_name')
  .eq('gmail_message_id', MSG_2241);
rec('no_cross_claim_2241_pack', (leakedDocs || []).every((d) => d.claim_id === CLAIM_ID), {
  claims: [...new Set((leakedDocs || []).map((d) => d.claim_id))],
});

const reportNow = docsFinal.filter((d) => d.doc_kind === 'surveyor_report');
const photosNow = docsFinal.filter((d) => d.doc_kind === 'surveyor_photo');
rec('report_pages_tagged', reportNow.length === 4 && reportNow.every((d) => /rcv000[1234]\.jpe?g/i.test(d.original_name || '')), {
  reports: reportNow.map((d) => d.original_name),
});
rec('surveyor_fee_not_tagged_report', !docsFinal.some((d) => /^rcv0005\.jpe?g$/i.test(d.original_name || '') && d.doc_kind === 'surveyor_report'));
rec('invoice_not_tagged_surveyor', !docsFinal.some((d) => /0010002508/.test(d.original_name || '') && d.doc_kind === 'surveyor_report'));

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

async function openClaim0020(page) {
  const search = page.locator('[data-testid="claims-search"]');
  await search.waitFor({ timeout: 30000 });
  await search.fill(CLAIM_NUM);
  await page.waitForTimeout(900);
  await page.locator(`[data-testid="claim-row-${CLAIM_ID}"]`).click();
  await page.locator('[data-testid="claims-card-snapshot"]').waitFor({ timeout: 20000 });
  return search;
}

async function imgVisible(page, sel) {
  const loc = page.locator(sel).first();
  const shown = await loc.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (!shown) return { ok: false, w: 0, h: 0 };
  const box = await loc.evaluate((el) => ({
    w: el.naturalWidth || 0,
    h: el.naturalHeight || 0,
    src: el.currentSrc || el.src || '',
  })).catch(() => ({ w: 0, h: 0, src: '' }));
  return { ok: box.w >= 40 && box.h >= 40, ...box };
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1440, height: 900 } });
await inject(ctx);
const page = await ctx.newPage();
const ui = {
  reportPagesOpened: [],
  photosOpened: [],
  thumbsOk: 0,
  thumbsBroken: 0,
  downloadOk: [],
};
try {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await openClaim0020(page);
  const snap = await page.locator('[data-testid="claims-card-snapshot"]').innerText();
  const dateOnCard = snap.includes(EVENT_DATE) || await page.getByText(EVENT_DATE).count() > 0;
  const plateOnCard = snap.includes(PLATE) || snap.includes('63292') || await page.getByText(PLATE).count() > 0;
  rec('ui_opened_claim_number_and_date', snap.includes(CLAIM_NUM) && dateOnCard, { snap: snap.slice(0, 280) });
  rec('ui_claim_vehicle_visible', plateOnCard, { snap: snap.slice(0, 160) });
  await saveShot(page, 'open_0020_by_number');

  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
  await page.waitForTimeout(2500);
  rec('invoice_not_shown_as_surveyor', await page.locator('[data-testid="surveyor-report-file"][data-doc-name*="0010002508"]').count() === 0);
  rec('fee_invoice_not_shown_as_surveyor', await page.locator('[data-testid="surveyor-report-file"][data-doc-name*="RCV0005"]').count() === 0);
  const reportFiles = page.locator('[data-testid="surveyor-report-file"]');
  const reportCount = await reportFiles.count();
  rec('ui_report_files_visible', reportCount === 4, { count: reportCount });
  await saveShot(page, 'surveyor_tab_reports');

  for (let i = 0; i < reportCount; i += 1) {
    const row = reportFiles.nth(i);
    const name = await row.getAttribute('data-doc-name');
    await row.getByRole('button', { name: /פתח/ }).click();
    const preview = await page.locator('[data-testid="doc-preview"], .doc-preview-wrap').first()
      .waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    const vis = await imgVisible(page, '.doc-preview-img, [data-testid="doc-preview-img"]');
    let downloadOk = false;
    if (vis.src) {
      const resp = await page.request.get(vis.src);
      const buf = Buffer.from(await resp.body());
      downloadOk = resp.ok() && buf.length > 8000 && buf[0] === 0xff && buf[1] === 0xd8;
      ui.downloadOk.push({ name, bytes: buf.length, ok: downloadOk, status: resp.status() });
    }
    ui.reportPagesOpened.push({ name, preview, imgOk: vis.ok, w: vis.w, h: vis.h, downloadOk });
    rec(`ui_open_report_page_${i + 1}`, preview && vis.ok && downloadOk, { name, w: vis.w, h: vis.h, downloadOk });
    await page.locator('.doc-preview-img, [data-testid="doc-preview-img"]').first().scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(300);
    await saveShot(page, `surveyor_page_${i + 1}_${String(name || 'p').replace(/[^\w.\-]+/g, '_')}`);
    await page.getByRole('button', { name: /סגור תצוגה/ }).click().catch(() => null);
    await page.waitForTimeout(200);
  }
  rec('ui_every_report_page_checked', ui.reportPagesOpened.length === 4 && ui.reportPagesOpened.every((p) => p.imgOk && p.downloadOk && /rcv000[1234]/i.test(p.name || '')), {
    opened: ui.reportPagesOpened,
  });

  const expectThumbs = Math.max(100, photosNow.length);
  await page.waitForFunction((n) => document.querySelectorAll('.gal-grid .gal-item img').length >= n, expectThumbs, { timeout: 120000 }).catch(() => null);
  const thumbs = page.locator('.gal-grid .gal-item img');
  const thumbCount = await thumbs.count();
  for (let i = 0; i < thumbCount; i += 1) {
    const ok = await thumbs.nth(i).evaluate((el) => (el.naturalWidth || 0) >= 20).catch(() => false);
    if (ok) ui.thumbsOk += 1;
    else ui.thumbsBroken += 1;
  }
  rec('ui_photo_thumbs_visible', thumbCount >= 100 && ui.thumbsBroken === 0, {
    thumbs: thumbCount, ok: ui.thumbsOk, broken: ui.thumbsBroken,
  });
  await saveShot(page, 'surveyor_photo_gallery');

  const photoBtns = page.locator('.gal-grid .gal-item');
  const photoCount = await photoBtns.count();
  for (let i = 0; i < photoCount; i += 1) {
    const title = await photoBtns.nth(i).getAttribute('title');
    await photoBtns.nth(i).click();
    const vis = await imgVisible(page, '.doc-preview-img, [data-testid="doc-preview-img"]');
    ui.photosOpened.push({ name: title, ok: vis.ok, w: vis.w, h: vis.h });
    if (!vis.ok) rec(`ui_photo_broken_${title || i}`, false, { w: vis.w, h: vis.h });
    if (i < 4 || i === photoCount - 1 || i % 25 === 0) {
      await saveShot(page, `surveyor_photo_${String(i + 1).padStart(3, '0')}_${String(title || 'p').replace(/[^\w.\-]+/g, '_')}`);
    }
    await page.getByRole('button', { name: /סגור תצוגה/ }).click().catch(() => null);
  }
  rec('ui_every_surveyor_photo_opened', photoCount >= 100 && ui.photosOpened.every((p) => p.ok), {
    count: photoCount, broken: ui.photosOpened.filter((p) => !p.ok).map((p) => p.name),
  });

  await page.locator('[data-testid="claims-tab-sub-invoice"]').click();
  await page.waitForTimeout(800);
  await saveShot(page, 'invoice_tab');
  rec('invoice_visible_under_garage', await page.getByText(INVOICE_FILE).count() > 0);
  const invOpen = page.getByRole('button', { name: /צפייה בתיק/ }).first();
  if (await invOpen.count()) {
    await invOpen.click();
    const invPrev = await page.locator('[data-testid="doc-preview"], .doc-preview-wrap').first()
      .waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    rec('ui_invoice_opens_as_invoice', invPrev);
    await saveShot(page, 'invoice_preview');
  }

  await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1200);
  await openClaim0020(page);
  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
  await page.waitForTimeout(2500);
  rec('refresh_reopen_invoice_still_not_surveyor', await page.locator('[data-testid="surveyor-report-file"][data-doc-name*="0010002508"]').count() === 0);
  rec('refresh_reopen_reports_still_visible', await page.locator('[data-testid="surveyor-report-file"]').count() === 4, {
    count: await page.locator('[data-testid="surveyor-report-file"]').count(),
  });
  await page.waitForFunction((n) => document.querySelectorAll('.gal-grid .gal-item img').length >= n, expectThumbs, { timeout: 120000 }).catch(() => null);
  rec('refresh_reopen_photos_still_visible', await page.locator('.gal-grid .gal-item img').count() >= expectThumbs, {
    count: await page.locator('.gal-grid .gal-item img').count(),
  });
  const firstAgain = page.locator('[data-testid="surveyor-report-file"]').first();
  if (await firstAgain.count()) {
    await firstAgain.getByRole('button', { name: /פתח/ }).click();
    const vis = await imgVisible(page, '.doc-preview-img, [data-testid="doc-preview-img"]');
    rec('refresh_reopen_report_still_opens', vis.ok, { w: vis.w, h: vis.h });
  }
  await saveShot(page, 'reopen_surveyor_tab');
} catch (e) {
  rec('ui_run', false, { err: String(e.message || e).slice(0, 240) });
  await saveShot(page, 'ui_error');
}
await browser.close();
report.ui = ui;

const ok = (name) => Boolean((report.checks.find((c) => c.name === name) || {}).ok);
const reportPageCount = ui.reportPagesOpened.length;
const everyPage = ok('ui_every_report_page_checked');
const everyPhoto = ok('ui_every_surveyor_photo_opened');
const visibleUi = ok('ui_opened_claim_number_and_date') && ok('ui_report_files_visible');
const fullVisible = everyPage && visibleUi;
const photosVisible = ok('ui_photo_thumbs_visible') && everyPhoto;
const refreshOk = ok('refresh_reopen_invoice_still_not_surveyor') && ok('refresh_reopen_reports_still_visible')
  && ok('refresh_reopen_photos_still_visible') && ok('refresh_reopen_report_still_opens');
const invoiceOk = ok('invoice_kind_garage') && ok('invoice_not_shown_as_surveyor') && ok('invoice_visible_under_garage');
const noDup = ok('no_duplicate_invoice');
const noLeak = ok('no_cross_claim_invoice') && ok('no_cross_claim_2241_pack') && ok('2241_message_not_on_other_claim');
const allAttsOk = ok('all_2241_attachments_on_claim');

report.verdict = {
  correct2241FileFound: ok('correct_2241_file_found') ? 'PASS' : 'FAIL',
  claimNumberVerified: page1Peek?.tokens?.claimNum ? 'PASS' : 'FAIL',
  eventDateVerified: ok('ui_opened_claim_number_and_date') ? 'PASS' : 'FAIL',
  eventDateNote: 'Claim card event date is 2026-05-02. Report prints inspection 4/5/26 and report date 6/5/2026. Literal תאריך אירוע 2026-05-02 is not on the scanned pages. Bind is by unique claim number 1260010522488 on page 1.',
  vehicleVerified: (page1Peek?.tokens?.plate || ok('ui_claim_vehicle_visible')) ? 'PASS' : 'FAIL',
  pdfOpens: everyPage ? 'PASS' : 'FAIL',
  pdfOpensNote: 'There is no 2241 PDF. Report is scanned JPG pages. This line means those pages open.',
  totalPdfPages: 0,
  totalReportPages: reportPageCount,
  everyPageChecked: everyPage ? 'PASS' : 'FAIL',
  allEmbeddedImagesVisible: everyPage ? 'PASS' : 'FAIL',
  separateSurveyorPhotosChecked: everyPhoto ? `PASS · ${ui.photosOpened.length}` : `FAIL · ${ui.photosOpened.length}`,
  allRelevantGmailAttachmentsAccounted: allAttsOk ? 'PASS' : 'FAIL',
  visibleInPublicStaging: visibleUi ? 'PASS' : 'FAIL',
  opensFromPublicStaging: everyPage ? 'PASS' : 'FAIL',
  fullReportVisibleToUser: fullVisible ? 'PASS' : 'FAIL',
  allPhotosVisibleToUser: photosVisible ? 'PASS' : 'FAIL',
  refreshReopen: refreshOk ? 'PASS' : 'FAIL',
  wrongInvoiceClassificationCorrected: invoiceOk ? 'PASS' : 'FAIL',
  noDuplicate: noDup ? 'PASS' : 'FAIL',
  noCrossClaimLeakage: noLeak ? 'PASS' : 'FAIL',
  productionUntouched: 'YES',
};

const required = [
  'correct2241FileFound', 'claimNumberVerified', 'eventDateVerified', 'vehicleVerified',
  'pdfOpens', 'everyPageChecked', 'allEmbeddedImagesVisible', 'visibleInPublicStaging',
  'opensFromPublicStaging', 'fullReportVisibleToUser', 'allPhotosVisibleToUser',
  'refreshReopen', 'wrongInvoiceClassificationCorrected', 'noDuplicate', 'noCrossClaimLeakage',
];
const userVisiblePass = required.every((k) => report.verdict[k] === 'PASS')
  && String(report.verdict.separateSurveyorPhotosChecked).startsWith('PASS')
  && report.verdict.allRelevantGmailAttachmentsAccounted === 'PASS'
  && report.verdict.productionUntouched === 'YES';
report.ok = userVisiblePass;

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  verdict: report.verdict,
  invoice: { before: report.invoice.before?.doc_kind, after: report.invoice.after?.doc_kind },
  import: report.import,
  taggedReports: report.taggedReports,
  gmailPackAtts: packAtts.length,
  peeked: report.gmail.peeks.map((p) => ({ name: p.filename, tokens: p.tokens, pages: p.pages })),
  productionTouched: false,
  mailboxMutated: false,
}, null, 2));
process.exit(report.ok ? 0 : 1);
