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

const service = serviceRole();
const anon = anonKey();
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { persistSession: false } });

const { data: allClaims, error: claimsErr } = await admin.from('claims_records')
  .select('id, client_name, plate, status, company_name, row_data, created_at, updated_at, gmail_thread_id');
if (claimsErr) throw new Error(claimsErr.message);
const related = (allClaims || []).filter((c) => nameRelated(c) || tokenRelated(c));
report.claims = related.map(claimView);
rec('claims_listed', related.length > 0, { count: related.length, ids: related.map((c) => c.id) });

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
  { box: 'inbox', q: 'in:inbox (אטיאס OR 63292-003 OR 1260010522488 OR 0010002508 OR "שמאות 2241") newer_than:365d' },
  { box: 'sent', q: 'in:sent (אטיאס OR 63292-003 OR 1260010522488 OR 0010002508 OR "שמאות 2241") newer_than:365d' },
];
const authClaim = related.find((c) => c.id === 'DAL-2026-0020')?.id || related[0]?.id;
for (const q of queries) {
  const r = await gmailInvoke('list_messages', { claim_id: authClaim, q: q.q });
  const messages = Array.isArray(r.json.messages) ? r.json.messages : [];
  report.gmail[q.box] = messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    from: m.from,
    subject: m.subject,
    date: m.date,
    snippet: String(m.snippet || '').slice(0, 220),
  }));
  rec(`gmail_${q.box}_listed`, r.json.success !== false, {
    status: r.status,
    count: messages.length,
    err: r.json.error,
  });
}

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
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'signed_url', claim_id: pdfRow.claim_id, file_id: pdfRow.id }),
  }).then((r) => r.json()).catch(() => ({}));
  rec('pdf_signed_url', !!signed.url, { host: signed.url ? new URL(signed.url).host : '', err: signed.error });
  if (signed.url) {
    const buf = Buffer.from(await fetch(signed.url).then((r) => r.arrayBuffer()));
    writeFileSync(join(OUT, '0010002508.pdf'), buf);
    let text = '';
    try {
      const mod = await import('pdf-parse');
      const pdfParse = mod.default || mod;
      const parsed = await pdfParse(buf);
      text = String(parsed?.text || '');
    } catch {
      const raw = buf.toString('latin1');
      const chunks = [];
      const re = /\(([^()]{3,180})\)/g;
      let m;
      while ((m = re.exec(raw))) chunks.push(m[1]);
      text = `${chunks.join(' ')}\n${raw.replace(/[^\x09\x0a\x0d\x20-\x7e\u0590-\u05FF]/g, ' ')}`;
    }
    report.pdfText = text.replace(/\s+/g, ' ').slice(0, 4000);
    const tokens = {
      claimNums: [...new Set((text.match(/12600\d{7}|1260010522488/g) || []))],
      fileNums: [...new Set((text.match(/63292[-\s]?003/g) || []))],
      reportNums: [...new Set((text.match(/2241/g) || []))],
      plates: [...new Set((text.match(/63292003|63292-?003/g) || []))],
      dates: [...new Set((text.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g) || []).map(normDate).filter(Boolean))],
      rawExcerpt: text.replace(/\s+/g, ' ').slice(0, 800),
    };
    report.pdfTokens = tokens;
    rec('pdf_text_extracted', text.length > 20, { chars: text.length, tokens });
  }
}

const pdfDates = (report.pdfTokens.dates || []).filter(Boolean);
const pdfClaimHits = (report.pdfTokens.claimNums || []);
const pdfFileHits = (report.pdfTokens.fileNums || []);
const candidates = report.claims.filter((c) => {
  const numHit = (
    (c.claimNum && (pdfClaimHits.includes(c.claimNum) || String(c.claimNum).includes('1260010522488')))
    || (c.claimNum && /63292-?003/.test(c.claimNum) && pdfFileHits.length)
    || (c.fileNum && pdfFileHits.some((f) => digits(f) === digits(c.fileNum)))
  );
  const dateHit = c.eventDate && pdfDates.includes(normDate(c.eventDate));
  return numHit && dateHit;
});
const numberOnly = report.claims.filter((c) => {
  return (c.claimNum && (pdfClaimHits.includes(c.claimNum) || /1260010522488|63292-?003/.test(c.claimNum)))
    || (c.fileNum && /63292-?003/.test(c.fileNum));
});

if (candidates.length === 1) {
  report.match = {
    decision: 'auto',
    reason: 'unique claim number + event date match PDF/mail tokens',
    claimId: candidates[0].id,
    claimNum: candidates[0].claimNum,
    eventDate: candidates[0].eventDate,
    plate: candidates[0].plate,
  };
} else if (candidates.length > 1) {
  report.match = { decision: 'needs_review', reason: 'two_or_more_number_and_date_matches', claimId: null, ids: candidates.map((c) => c.id) };
} else if (numberOnly.length === 1 && !pdfDates.length) {
  report.match = { decision: 'needs_review', reason: 'number_unique_but_pdf_date_missing', claimId: numberOnly[0].id, claimNum: numberOnly[0].claimNum, eventDate: numberOnly[0].eventDate };
} else if (numberOnly.length === 1 && pdfDates.length && !pdfDates.includes(normDate(numberOnly[0].eventDate))) {
  report.match = {
    decision: 'needs_review',
    reason: 'number_matches_but_date_does_not',
    claimId: null,
    numberClaim: numberOnly[0].id,
    claimDate: numberOnly[0].eventDate,
    pdfDates,
  };
} else {
  report.match = { decision: 'needs_review', reason: 'no_unique_number_and_date_match', claimId: null, numberOnly: numberOnly.map((c) => c.id) };
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
  await search.fill('אליהו אטיאס');
  await page.waitForTimeout(1200);
  const nameRows = await page.locator('[data-testid^="claim-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  report.ui.nameSearchRows = nameRows;
  rec('ui_multiple_or_listed_by_name', nameRows.length >= 1, { rows: nameRows });
  await saveShot(page, 'list_search_by_name');

  const targetId = report.match.claimId || (numberOnly[0] && numberOnly[0].id) || null;
  const targetClaim = report.claims.find((c) => c.id === targetId);
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
    rec('ui_report_visible_on_matched_claim', visible && report.match.decision === 'auto');
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

    if (report.match.decision === 'auto') {
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
      rec('ui_refresh_reopen', false, { err: 'no unique match — not claiming PASS' });
    }
  } else {
    rec('ui_row_by_claim_number', false, { err: 'no candidate claim' });
    rec('ui_report_visible_on_matched_claim', false);
    rec('ui_report_opens', false);
    rec('ui_refresh_reopen', false);
  }
} catch (e) {
  rec('ui_run', false, { err: String(e.message || e).slice(0, 240) });
  await saveShot(page, 'ui_error');
}
await browser.close();

report.ok = report.match.decision === 'auto'
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
  claims: report.claims.map((c) => ({ id: c.id, claimNum: c.claimNum, eventDate: c.eventDate, plate: c.plate, docs: c.documents?.length, mails: c.mails?.length })),
  match: report.match,
  pdfOn: (namedPdf || []).map((d) => `${d.claim_id}:${d.original_name}:${d.doc_kind}`),
  gmailInbox: report.gmail.inbox.length,
  gmailSent: report.gmail.sent.length,
  productionTouched: false,
}, null, 2));
if (!report.ok) process.exit(1);
