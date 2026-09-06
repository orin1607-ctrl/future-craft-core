/**
 * Staging-only READ-ONLY audit: every אליהו אטיאס-related claim,
 * Inbox+Sent Gmail hits, and identifiers inside the surveyor PDF.
 * Never imports. Never updates documents. Never Production. Never mutates Gmail.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import zlib from 'node:zlib';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-eli-identity-audit-2026-09-06');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
if (existsSync(ART)) mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailboxMutated: false,
  realEmailSend: false,
  insertedDocument: false,
  documentsUpdated: false,
  claims: [],
  gmail: { inbox: [], sent: [] },
  documentsNamed0010002508: [],
  pdfText: '',
  pdfTokens: {},
  match: { decision: 'needs_review', reason: 'not_run', claimId: null },
  ui: {},
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
    const payload = jwtPayload(k);
    if (payload.ref === PROD_REF) throw new Error('service role is production');
    if (payload.ref && payload.ref !== STAGING_REF) throw new Error(`service role ref ${payload.ref}`);
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
    const payload = jwtPayload(fromEnv);
    if (payload.ref === STAGING_REF && payload.role === 'anon') return fromEnv;
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
function digits(v) {
  return String(v || '').replace(/\D/g, '');
}
function rowOf(c) {
  return c?.row_data && typeof c.row_data === 'object' ? c.row_data : {};
}
function claimView(c) {
  const rd = rowOf(c);
  return {
    id: c.id,
    client_name: c.client_name || rd.clientName || '',
    plate: c.plate || rd.plate || '',
    status: c.status || '',
    claimNum: rd.claimNum || '',
    eventDate: rd.eventDate || '',
    created_at: c.created_at || '',
    fileNum: rd.fileNum || rd.file_no || rd.fileNumber || rd.internalNum || '',
    surveyor: rd.surveyor || '',
    surveyorNum: rd.surveyorNum || rd.reportNumber || rd.surveyor_report_no || '',
    policyNum: rd.policyNum || '',
    insCompany: rd.insCompany || c.company_name || '',
    eventDesc: String(rd.eventDesc || '').slice(0, 200),
    sourceFileNo: rd.sourceFileNo || '',
    rowKeys: Object.keys(rd).sort(),
  };
}
function nameRelated(c) {
  const rd = rowOf(c);
  const hay = `${c.client_name || ''} ${rd.clientName || ''} ${rd.driverName || ''} ${c.id || ''}`;
  return /אטיאס|אליהו/.test(hay);
}
function tokenRelated(c) {
  const v = claimView(c);
  const hay = `${v.claimNum} ${v.plate} ${v.fileNum} ${v.id} ${JSON.stringify(rowOf(c))}`;
  return /1260010522488|63292-?003|63292003|0010002508|2241/.test(hay);
}

function isElihuAtiasPerson(c) {
  const rd = rowOf(c);
  const name = `${c.client_name || ''} ${rd.clientName || ''}`;
  return /אליהו/.test(name) && /אטיאס/.test(name);
}

function extractPdfCmapText(buf) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const streams = [];
  let pos = 0;
  const blob = data;
  while (true) {
    const i = blob.indexOf('stream', pos);
    if (i < 0) break;
    let j = i + 6;
    if (blob[j] === 0x0d) j += 1;
    if (blob[j] === 0x0a) j += 1;
    const k = blob.indexOf('endstream', j);
    if (k < 0) break;
    let raw = blob.subarray(j, k);
    if (raw.length >= 2 && raw[raw.length - 2] === 0x0d && raw[raw.length - 1] === 0x0a) raw = raw.subarray(0, -2);
    else if (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) raw = raw.subarray(0, -1);
    try {
      streams.push(zlib.inflateSync(raw));
    } catch {
      /* skip */
    }
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
        else if (esc === 'r') code = 13;
        else if (esc === 't') code = 9;
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
    if (m[1]) {
      cmap = cmaps[fontToCmap[m[1]] || ''] || {};
    } else if (m[2] != null) {
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
  const visual = parts.join('\n');
  const readable = parts.map((p) => p.split(/(\d+(?:[.,/:-]\d+)+|\d+)/).map((chunk, i) => (
    i % 2 === 1 || /^\d/.test(chunk) ? chunk : chunk.split('').reverse().join('')
  )).join('')).join('\n');
  return { visual, readable };
}

const service = serviceRole();
const anon = anonKey();
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });

const { data: allClaims, error: claimsErr } = await admin.from('claims_records')
  .select('id, client_name, plate, status, company_name, row_data, created_at, updated_at, gmail_thread_id');
if (claimsErr) throw new Error(claimsErr.message);
function anyElihu(c) {
  const hay = `${c.client_name || ''} ${JSON.stringify(c.row_data || {})}`;
  return /אליהו/.test(hay);
}
const related = (allClaims || []).filter((c) => nameRelated(c) || tokenRelated(c) || anyElihu(c));
report.allAtiasOrElihu = (allClaims || []).filter((c) => /אטיאס|אליהו/.test(`${c.client_name || ''} ${JSON.stringify(c.row_data || {})}`)).map((c) => {
  const v = claimView(c);
  v.elihuInRow = /אליהו/.test(`${c.client_name || ''} ${JSON.stringify(c.row_data || {})}`);
  v.atiasInRow = /אטיאס/.test(`${c.client_name || ''} ${JSON.stringify(c.row_data || {})}`);
  v.elihuAtiasPerson = isElihuAtiasPerson(c);
  return v;
});
report.claims = related.map((c) => ({ ...claimView(c), elihuAtiasPerson: isElihuAtiasPerson(c) }));
report.elihuAtiasClaims = report.claims.filter((c) => c.elihuAtiasPerson);
report.adjacentAtiasNotElihu = report.claims.filter((c) => !c.elihuAtiasPerson && /אטיאס/.test(c.client_name || ''));
rec('claims_listed', related.length > 0, { count: related.length, ids: related.map((c) => c.id) });
rec('elihu_person_claims', report.elihuAtiasClaims.length === 1 && report.elihuAtiasClaims[0].id === 'DAL-2026-0020', {
  ids: report.elihuAtiasClaims.map((c) => c.id),
  adjacent: report.adjacentAtiasNotElihu.map((c) => `${c.id}:${c.client_name}`),
});

const relatedIds = related.map((c) => c.id);
const { data: allDocs } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, mime_type, source, gmail_message_id, byte_size, created_at, content_sha256')
  .in('claim_id', relatedIds.length ? relatedIds : ['__none__']);
const { data: namedPdf } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, mime_type, source, gmail_message_id, byte_size, created_at, content_sha256')
  .ilike('original_name', '%0010002508%');
report.documentsNamed0010002508 = namedPdf || [];
const { data: imports } = await admin.from('claims_gmail_imports')
  .select('id, claim_id, gmail_message_id, gmail_thread_id, subject, from_addr, sent_at, body_text, attachment_count')
  .in('claim_id', relatedIds.length ? relatedIds : ['__none__']);

for (const c of report.claims) {
  c.documents = (allDocs || []).filter((d) => d.claim_id === c.id).map((d) => ({
    id: d.id, name: d.original_name, kind: d.doc_kind, source: d.source, gmail: d.gmail_message_id, bytes: d.byte_size,
  }));
  c.mails = (imports || []).filter((m) => m.claim_id === c.id).map((m) => ({
    id: m.id,
    gmail_message_id: m.gmail_message_id,
    thread: m.gmail_thread_id,
    subject: m.subject,
    from: m.from_addr,
    sent_at: m.sent_at,
    attachments: m.attachment_count,
    body_excerpt: String(m.body_text || '').replace(/\s+/g, ' ').slice(0, 280),
  }));
}

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

async function gmailInvoke(action, body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${userJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const queries = [
  { box: 'inbox', q: 'in:inbox 1260010522488 newer_than:365d' },
  { box: 'inbox', q: 'in:inbox 63292-003 newer_than:365d' },
  { box: 'inbox', q: 'in:inbox "שמאות 2241" newer_than:365d' },
  { box: 'sent', q: 'in:sent 1260010522488 newer_than:365d' },
  { box: 'sent', q: 'in:sent 63292-003 newer_than:365d' },
  { box: 'sent', q: 'in:sent "שמאות 2241" newer_than:365d' },
];
const authClaim = related.find((c) => c.id === 'DAL-2026-0020')?.id || related[0]?.id;
const gmailByBox = { inbox: new Map(), sent: new Map() };
for (const q of queries) {
  const r = await gmailInvoke('list_messages', { claim_id: authClaim, q: q.q });
  const messages = Array.isArray(r.json.messages) ? r.json.messages : [];
  for (const m of messages) {
    gmailByBox[q.box].set(m.id, {
      id: m.id,
      threadId: m.threadId,
      from: m.from,
      subject: m.subject,
      date: m.date,
      snippet: String(m.snippet || '').slice(0, 220),
      query: q.q,
    });
  }
  rec(`gmail_${q.box}_q`, r.json.success !== false, {
    status: r.status,
    q: q.q,
    count: messages.length,
    err: r.json.error,
  });
}
report.gmail.inbox = [...gmailByBox.inbox.values()];
report.gmail.sent = [...gmailByBox.sent.values()];
report.gmail.eliThread = [...report.gmail.inbox, ...report.gmail.sent].filter((m) =>
  /1260010522488|63292-003|שמאות\s*2241/.test(`${m.subject || ''} ${m.snippet || ''}`));
rec('gmail_inbox_listed', report.gmail.inbox.length > 0, { count: report.gmail.inbox.length });
rec('gmail_sent_listed', report.gmail.sent.length > 0, { count: report.gmail.sent.length });

report.gmail.reads = [];
const readIds = [...new Set(report.gmail.eliThread.map((m) => m.id))];
for (const messageId of readIds.slice(0, 12)) {
  const r = await gmailInvoke('read_message', { claim_id: authClaim, message_id: messageId });
  const msg = r.json.message || {};
  const row = {
    id: msg.id || messageId,
    box: (Array.isArray(msg.labelIds) && msg.labelIds.includes('SENT')) ? 'Sent' : 'Inbox',
    subject: msg.subject || '',
    date: msg.date || '',
    from: msg.from || '',
    threadId: msg.threadId || '',
    attachments: (msg.attachments || []).map((a) => ({ filename: a.filename, mime: a.mime, size: a.size })),
    bodyExcerpt: String(msg.bodyText || '').replace(/\s+/g, ' ').slice(0, 400),
  };
  report.gmail.reads.push(row);
}
rec('gmail_eli_thread_read', report.gmail.reads.length > 0, {
  count: report.gmail.reads.length,
  attachments: report.gmail.reads.flatMap((m) => m.attachments.map((a) => `${m.id}:${a.filename}`)),
});

const { data: allSurveyorDocs } = await admin.from('claims_documents')
  .select('id, claim_id, original_name, doc_kind, source, gmail_message_id, byte_size, created_at')
  .eq('doc_kind', 'surveyor_report');
report.allSurveyorReports = allSurveyorDocs || [];
rec('all_surveyor_reports_listed', true, {
  count: (allSurveyorDocs || []).length,
  rows: (allSurveyorDocs || []).map((d) => `${d.claim_id}:${d.original_name}`),
});

const pdfRow = (namedPdf || [])[0] || (allDocs || []).find((d) => /0010002508/.test(d.original_name || ''));
rec('pdf_row_found', !!pdfRow, {
  claim_id: pdfRow?.claim_id || null,
  name: pdfRow?.original_name || null,
  kind: pdfRow?.doc_kind || null,
  count: (namedPdf || []).length,
});

if (pdfRow) {
  const signed = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${userJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'signed_url', claim_id: pdfRow.claim_id, file_id: pdfRow.id }),
  }).then((r) => r.json()).catch(() => ({}));
  rec('pdf_signed_url', !!signed.url, { host: signed.url ? new URL(signed.url).host : '', err: signed.error });
  if (signed.url) {
    const buf = Buffer.from(await fetch(signed.url).then((r) => r.arrayBuffer()));
    writeFileSync(join(OUT, '0010002508.pdf'), buf);
    const extracted = extractPdfCmapText(buf);
    const text = `${extracted.readable}\n${extracted.visual}`;
    report.pdfText = extracted.readable.replace(/\s+/g, ' ').slice(0, 4000);
    report.pdfVisual = extracted.visual.replace(/\s+/g, ' ').slice(0, 1500);
    const tokens = {
      claimNums: [...new Set((text.match(/12600\d{7}|1260010522488/g) || []))],
      fileNums: [...new Set((text.match(/63292[-\s]?003/g) || []))],
      reportNums: [...new Set((text.match(/(?:^|[^\d])(2241)(?:[^\d]|$)/g) || []).map(() => '2241').filter(Boolean))],
      plates: [...new Set((text.match(/63292003/g) || []))],
      dates: [...new Set((text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g) || []).map(normDate).filter(Boolean))],
      garageInvoice: /חשבונית|טיוטה|כרטיס עבודה|מרכז הפגושים|מוסך/.test(extracted.readable),
      rawExcerpt: extracted.readable.replace(/\s+/g, ' ').slice(0, 800),
    };
    if (!tokens.reportNums.length && /2241/.test(text)) tokens.reportNums = ['2241'];
    report.pdfTokens = tokens;
    report.pdfClassification = tokens.garageInvoice
      ? 'garage_invoice_draft'
      : (tokens.reportNums.includes('2241') ? 'surveyor_report_2241' : 'unknown_pdf');
    rec('pdf_text_extracted', extracted.readable.length > 20, {
      chars: extracted.readable.length,
      classification: report.pdfClassification,
      tokens,
    });
    rec('pdf_is_not_surveyor_report_2241', report.pdfClassification === 'garage_invoice_draft', {
      classification: report.pdfClassification,
    });
  }
}

const pdfDates = (report.pdfTokens.dates || []).filter(Boolean);
const pdfClaimHits = (report.pdfTokens.claimNums || []);
const pdfFileHits = (report.pdfTokens.fileNums || []);
const pdfPlates = (report.pdfTokens.plates || []);
const mailHay = [
  ...report.gmail.inbox,
  ...report.gmail.sent,
  ...report.gmail.reads,
  ...(report.claims.flatMap((c) => c.mails || [])),
].map((m) => `${m.subject || ''} ${m.bodyExcerpt || ''} ${m.snippet || ''}`).join('\n');
report.mailTokens = {
  claimNums: [...new Set((mailHay.match(/1260010522488/g) || []))],
  fileNums: [...new Set((mailHay.match(/63292-003/g) || []))],
  reportNums: [...new Set((mailHay.match(/2241/g) || []))],
  dates: [...new Set((mailHay.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g) || []).map(normDate).filter(Boolean))],
};
const candidates = report.claims.filter((c) => {
  const numHit = (
    (c.claimNum && pdfClaimHits.includes(c.claimNum))
    || (c.fileNum && pdfFileHits.some((f) => digits(f) === digits(c.fileNum)))
  );
  const dateHit = c.eventDate && pdfDates.includes(normDate(c.eventDate));
  return numHit && dateHit;
});
const numberFromPdf = report.claims.filter((c) =>
  (c.claimNum && pdfClaimHits.includes(c.claimNum))
  || (c.fileNum && pdfFileHits.some((f) => digits(f) === digits(c.fileNum)))
  || (c.plate && pdfPlates.includes(digits(c.plate))));
const numberFromMail = report.claims.filter((c) =>
  c.claimNum && report.mailTokens.claimNums.includes(c.claimNum));

if (candidates.length === 1) {
  report.match = {
    decision: 'auto',
    reason: 'unique claim number + event date match inside the PDF',
    claimId: candidates[0].id,
    claimNum: candidates[0].claimNum,
    eventDate: candidates[0].eventDate,
    plate: candidates[0].plate,
  };
} else if (candidates.length > 1) {
  report.match = { decision: 'needs_review', reason: 'two_or_more_number_and_date_matches', claimId: null, ids: candidates.map((c) => c.id) };
} else {
  report.match = {
    decision: 'needs_review',
    reason: 'pdf_number_or_date_do_not_match_claim',
    claimId: null,
    pdfDates,
    pdfClaimHits,
    pdfPlates,
    mailClaimNums: report.mailTokens.claimNums,
    mailOnlyClaim: numberFromMail.length === 1 ? numberFromMail[0].id : null,
    pdfPlateClaims: numberFromPdf.map((c) => c.id),
    classification: report.pdfClassification || null,
  };
}
rec('match_unique_number_and_date', report.match.decision === 'auto', { match: report.match });
rec('no_name_only_match', report.match.reason !== 'name_only', { detail: report.match.reason });

const wrong = (namedPdf || []).filter((d) => report.match.claimId && d.claim_id !== report.match.claimId);
rec('pdf_already_on_matched_claim', report.match.decision === 'auto' && (namedPdf || []).every((d) => d.claim_id === report.match.claimId), {
  storedOn: (namedPdf || []).map((d) => d.claim_id),
  matched: report.match.claimId,
  wrong,
});

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
  await page.waitForTimeout(2000);
  const search = page.locator('[data-testid="claims-search"]');
  await search.fill('אטיאס');
  await page.waitForTimeout(800);
  await page.locator('[data-testid="dash-all"]').click().catch(() => null);
  await page.waitForTimeout(800);
  await saveShot(page, 'list_search_atias');
  await search.fill('אליהו אטיאס');
  await page.waitForTimeout(1200);
  await page.locator('table').first().scrollIntoViewIfNeeded().catch(() => null);
  const nameRows = await page.locator('[data-testid^="claim-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  report.ui.nameSearchRows = nameRows;
  rec('ui_multiple_or_listed_by_name', nameRows.length >= 1, { rows: nameRows });
  await saveShot(page, 'list_search_by_name');

  const inspectClaim = report.claims.find((c) => c.claimNum === '1260010522488')
    || report.elihuAtiasClaims[0]
    || null;
  const targetId = inspectClaim?.id || null;
  const targetClaim = inspectClaim;
  if (targetClaim?.claimNum) {
    await search.fill(String(targetClaim.claimNum));
    await page.waitForTimeout(1000);
  }
  if (targetId) {
    const row = page.locator(`[data-testid="claim-row-${targetId}"]`);
    rec('ui_row_by_claim_number', await row.count() > 0, { targetId, claimNum: targetClaim?.claimNum });
    if (await row.count()) await row.click();
    await page.locator('[data-testid="claims-card-snapshot"]').waitFor({ timeout: 15000 });
    const snap = await page.locator('[data-testid="claims-card-snapshot"]').innerText();
    rec('ui_opened_claim_number', targetClaim ? snap.includes(String(targetClaim.claimNum)) : false, { snap: snap.slice(0, 240) });
    rec('ui_opened_event_date', targetClaim?.eventDate ? snap.includes(targetClaim.eventDate) || (await page.getByText(targetClaim.eventDate).count()) > 0 : false);
    await saveShot(page, 'open_claim_by_number');

    await page.locator('[data-testid="claims-tab-group-docs"]').click();
    await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
    const fileRow = page.locator('[data-testid="surveyor-report-file"][data-doc-name*="0010002508"]').first();
    const visible = await fileRow.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    rec('ui_file_visible_on_claim_0020', visible, { note: 'file present; not a proven surveyor-report match' });
    rec('ui_report_visible_on_matched_claim', false, { err: 'match not proven by number+date inside the report' });
    await saveShot(page, 'matched_claim_surveyor');
    if (visible) {
      await fileRow.getByRole('button', { name: 'פתח בתיק' }).click();
      const opened = await page.locator('.ov.open [data-testid="doc-preview"]').first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
      const previewName = opened ? ((await page.locator('.ov.open [data-testid="doc-preview-name"]').first().innerText().catch(() => '')) || '') : '';
      rec('ui_report_opens', opened && /0010002508/.test(previewName), { previewName });
      await saveShot(page, 'matched_claim_preview');
    } else {
      rec('ui_report_opens', false, { err: 'not visible on this claim' });
    }

    await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1200);
    await search.fill(String(targetClaim.claimNum));
    await page.waitForTimeout(800);
    await page.locator(`[data-testid="claim-row-${targetId}"]`).click();
    await page.locator('[data-testid="claims-card-snapshot"]').waitFor({ timeout: 15000 });
    await page.locator('[data-testid="claims-tab-group-docs"]').click();
    await page.locator('[data-testid="claims-tab-sub-surveyor"]').click();
    const again = await page.locator('[data-testid="surveyor-report-file"][data-doc-name*="0010002508"]').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    rec('ui_refresh_reopen', again);
    await saveShot(page, 'reopen_matched_claim_surveyor');
  } else {
    rec('ui_row_by_claim_number', false, { err: 'no candidate claim' });
    rec('ui_report_visible_on_matched_claim', false);
    rec('ui_report_opens', false);
    rec('ui_refresh_reopen', false);
  }
  const pdfPath = join(OUT, '0010002508.pdf');
  if (existsSync(pdfPath)) {
    const pdfPage = await ctx.newPage();
    await pdfPage.goto(`file://${pdfPath}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await pdfPage.waitForTimeout(1500);
    await saveShot(pdfPage, 'pdf_contents_0010002508');
    await pdfPage.close();
  }
} catch (e) {
  rec('ui_run', false, { err: String(e.message || e).slice(0, 240) });
  await saveShot(page, 'ui_error');
}
await browser.close();

const inspect = report.claims.find((c) => c.claimNum === '1260010522488');
const pdfOn0020 = (namedPdf || []).every((d) => d.claim_id === 'DAL-2026-0020') && (namedPdf || []).length === 1;
const dateMatch = inspect && (report.pdfTokens.dates || []).includes(normDate(inspect.eventDate));
const claimNumInPdf = (report.pdfTokens.claimNums || []).includes('1260010522488');
const claimNumInMail = (report.mailTokens?.claimNums || []).includes('1260010522488');
report.verdict = {
  correctClaimVerified: 'FAIL',
  claimNumberMatches: claimNumInPdf ? 'PASS' : (claimNumInMail ? 'FAIL_pdf_missing_mail_has_it' : 'FAIL'),
  dateMatches: dateMatch ? 'PASS' : 'FAIL',
  correctReportVisible: 'FAIL',
  reportOpens: (report.checks.find((c) => c.name === 'ui_report_opens') || {}).ok ? 'PASS' : 'FAIL',
  reportContentsMatchClaim: (claimNumInPdf && dateMatch) ? 'PASS' : 'FAIL',
  refreshReopen: (report.checks.find((c) => c.name === 'ui_refresh_reopen') || {}).ok ? 'PASS' : 'FAIL',
  noDuplicate: pdfOn0020 ? 'PASS' : 'FAIL',
  noWrongClaimAttachment: pdfOn0020 ? 'PASS_same_plate_claim_but_wrong_doc_type' : 'FAIL',
  publicStagingVerified: (report.checks.find((c) => c.name === 'ui_opened_claim_number') || {}).ok ? 'PASS_opened_0020' : 'FAIL',
  productionUntouched: 'YES',
  stop: true,
  why: '0010002508.pdf is a garage invoice draft dated 14/07/2026 for plate 63292003. It does not contain claim 1260010522488, file 63292-003, surveyor 2241, or event date 2026-05-02. Mail subject has those numbers; the attachment body does not. Not binding. Not deleting.',
};
report.wrongAttachmentNote = {
  file: '0010002508.pdf',
  storedOn: 'DAL-2026-0020',
  storedKind: 'surveyor_report',
  createdAt: (namedPdf || [])[0]?.created_at || null,
  whyWrong: 'Prior agent imported a garage invoice (טיוטה חשבונית עיסקה / מוסך יוני מרכז הפגושים) as surveyor_report. PDF date 14/07/2026 ≠ claim event 2026-05-02. No claim/file/2241 inside the PDF.',
  actuallyBelongs: 'Plate 63292003 and the Sent-mail subject 1260010522488 point at DAL-2026-0020, but this file is not דוח שמאות 2241. Do not move. Do not duplicate. Do not delete.',
  actionTaken: 'none',
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

report.ok = report.match.decision === 'auto'
  && report.verdict.reportContentsMatchClaim === 'PASS'
  && report.checks.filter((c) => [
    'match_unique_number_and_date',
    'pdf_already_on_matched_claim',
    'ui_opened_claim_number',
    'ui_opened_event_date',
    'ui_report_visible_on_matched_claim',
    'ui_report_opens',
    'ui_refresh_reopen',
  ].includes(c.name)).every((c) => c.ok);

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  stop: true,
  verdict: report.verdict,
  elihuAtiasClaims: report.elihuAtiasClaims,
  adjacentAtiasNotElihu: report.adjacentAtiasNotElihu,
  match: report.match,
  pdfClassification: report.pdfClassification,
  pdfTokens: report.pdfTokens,
  mailTokens: report.mailTokens,
  pdfOn: (namedPdf || []).map((d) => `${d.claim_id}:${d.original_name}:${d.doc_kind}`),
  gmailEli: (report.gmail.eliThread || []).map((m) => `${m.date} | ${m.subject}`),
  gmailAttachments: (report.gmail.reads || []).flatMap((m) => m.attachments.map((a) => `${m.box}:${a.filename}`)),
  wrongAttachmentNote: report.wrongAttachmentNote,
  productionTouched: false,
}, null, 2));
if (!report.ok) process.exit(1);
