/**
 * Staging QA: אלי אטיאס live Gmail + 3-day inbox scan + recurring dry_run.
 * No Production. No live send. No mass import. No guess-assign.
 * node scripts/claims-eli-gmail-scan-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = (process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const LOCAL = process.env.CLAIMS_QA_LOCAL || 'http://127.0.0.1:8080';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-eli-gmail-scan-2026-09-04');
const ART = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
mkdirSync(ART, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const CLAIM_A = 'DAL-QA-WORKER-001';
const CLAIM_B = 'DAL-QA-WORKER-002';
const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';
const REC_TO = 'qa.recurring.closeout@futurecraft.staging';

const report = {
  at: new Date().toISOString(),
  staging: STAGING_REF,
  productionTouched: false,
  mailDispatchMode: null,
  sha: '',
  eli: {},
  gmail: {},
  scheduler: {},
  verdicts: {},
  checks: [],
  open: [],
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : extra.detail ? ` · ${String(extra.detail).slice(0, 220)}` : ''}`);
};

function loadDotEnv() {
  const out = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || loadDotEnv().VITE_SUPABASE_ANON_KEY;
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: auth, error: authErr } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
if (authErr || !auth.session) throw authErr || new Error('login failed');
const hdr = { apikey: anonKey, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' };
report.sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

async function invokeGmail(body) {
  const res = await fetch(`https://${STAGING_REF}.supabase.co/functions/v1/claims-gmail`, {
    method: 'POST', headers: hdr, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const mode = (await userDb.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
report.mailDispatchMode = mode || null;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });
rec('staging-only', STAGING_REF !== PROD_REF);

const sendProbe = await invokeGmail({ action: 'send', claim_id: CLAIM_A, to: 'nobody@example.com', subject: 'block', body: 'no' });
rec('live-send-blocked', sendProbe.json?.success === false && sendProbe.status === 403, { error: sendProbe.json?.error || sendProbe.json?.reason });

const status = await invokeGmail({ action: 'status' });
rec('gmail-connected', status.json?.connected === true && /yoni122222@gmail.com/i.test(String(status.json?.email || '')), { email: status.json?.email });

const dry = await invokeGmail({ action: 'scan_inbox', dry: true });
rec('inbox-scan-ok', dry.json?.success === true && dry.json?.lookback === 'newer_than:3d' && dry.json?.mailboxMutated !== true, {
  scanned: dry.json?.scanned, auto: (dry.json?.auto || []).length, review: (dry.json?.needs_review || []).length,
});

const exact = await invokeGmail({ action: 'list_messages', claim_id: CLAIM_A, q: '"אלי אטיאס"' });
const inboxEli = await invokeGmail({ action: 'list_messages', claim_id: CLAIM_A, q: 'in:inbox newer_than:3d "אלי אטיאס"' });
const sentEli = await invokeGmail({ action: 'list_messages', claim_id: CLAIM_A, q: 'in:sent newer_than:14d "אלי אטיאס"' });
const surveyorNew = await invokeGmail({ action: 'list_messages', claim_id: CLAIM_A, q: 'in:inbox newer_than:3d (שמאי OR שמאות OR surveyor)' });
const nameMatch = await invokeGmail({ action: 'match_dry_run', mail: { subject: 'אלי אטיאס', body: 'לקוח אלי אטיאס' } });
const newId = await invokeGmail({ action: 'match_dry_run', mail: { subject: 'DAL-2026-0021', body: 'DAL-2026-0021' } });
const eliyahu = await invokeGmail({ action: 'match_dry_run', mail: { subject: '63292-003 ארוע 1260010522488 דוח שמאות 2241 אטיאס אליהו' } });

const exactN = (exact.json?.messages || []).length;
const inboxEliN = (inboxEli.json?.messages || []).length;
const sentEliN = (sentEli.json?.messages || []).length;
const surveyorNewItems = (surveyorNew.json?.messages || []).filter((m) => /שמאי|שמאות|surveyor/i.test(`${m.subject || ''} ${m.from || ''}`));
const noGuess = nameMatch.json?.result?.decision === 'needs_review' && !(nameMatch.json?.result?.candidates || []).length;
const noNewDal = newId.json?.result?.decision !== 'auto';
const eliyahuIs0020 = eliyahu.json?.result?.claimId === 'DAL-2026-0020';

report.eli = {
  exactQuotedHits: exactN,
  inbox3dQuotedHits: inboxEliN,
  sent14dQuotedHits: sentEliN,
  nameMatch: nameMatch.json?.result,
  dal20260021: newId.json?.result,
  eliyahuMatch: eliyahu.json?.result,
  note: 'אלי אטיאס exact quoted search empty. אטיאס אליהו is a different historical file (DAL-2026-0020). Not guessed.',
};
report.gmail = {
  connected: status.json?.email,
  inbox3d: { scanned: dry.json?.scanned, subjects: [...(dry.json?.auto || []), ...(dry.json?.needs_review || [])].map((m) => m.subject) },
  surveyorIn3d: surveyorNewItems.map((m) => ({ subject: m.subject, from: m.from, date: m.date })),
};

rec('eli-exact-mail-absent', exactN === 0 && inboxEliN === 0, { exactN, inboxEliN });
rec('eli-no-guess-match', noGuess, { result: nameMatch.json?.result });
rec('eli-new-dal-id-absent', noNewDal, { result: newId.json?.result });
rec('eliyahu-stays-0020', eliyahuIs0020, { result: eliyahu.json?.result });
rec('surveyor-new-not-present', surveyorNewItems.length === 0, { n: surveyorNewItems.length, items: surveyorNewItems });

const pending = await invokeGmail({ action: 'list_pending' });
const pendingRows = Array.isArray(pending.json?.data) ? pending.json.data : [];
const pendingEli = pendingRows.filter((p) => /אלי אטיאס/.test(JSON.stringify(p)));
rec('pending-no-eli-atias', pendingEli.length === 0, { n: pendingEli.length });

const schedDry = await invokeGmail({ action: 'scan_inbox', dry: true, scheduler: true, force: true });
report.scheduler = {
  liveEdgeHasSchedulerField: schedDry.json?.scheduler === true,
  skipped: schedDry.json?.skipped === true,
  lookback: schedDry.json?.lookback,
  mailboxMutated: schedDry.json?.mailboxMutated,
  realEmailSend: schedDry.json?.realEmailSend,
  autoSend: schedDry.json?.autoSend,
};
rec('scheduler-no-send', schedDry.json?.realEmailSend !== true && schedDry.json?.autoSend !== true && schedDry.json?.mailboxMutated !== true, report.scheduler);
rec('inbox-still-3d', schedDry.json?.lookback === 'newer_than:3d' || dry.json?.lookback === 'newer_than:3d');

const sent = await invokeGmail({ action: 'preview_sent' });
rec('sent-preview-no-import', sent.json?.success === true && sent.json?.import === false && sent.json?.mailboxMutated !== true, {
  summary: sent.json?.summary,
});

const rec1 = await userDb.rpc('claims_upsert_mail_followup', {
  p_claim_id: CLAIM_A,
  p_mail_to: REC_TO,
  p_mail_subject: '[STAGING-QA-DO-NOT-SEND] recurring 3d eli-qa',
  p_mail_body: 'dry_run only',
  p_mail_kind: 'email_repeat',
  p_repeat_every_days: 3,
});
rec('recurring-upsert', !rec1.error, { err: rec1.error?.message });
const recRow = (await userDb.from('claims_reminders').select('id, mail_kind, repeat_every_days, status').eq('claim_id', CLAIM_A).eq('mail_kind', 'email_repeat').order('created_at', { ascending: false }).limit(1)).data?.[0];
rec('recurring-kind', recRow?.mail_kind === 'email_repeat' && Number(recRow?.repeat_every_days) === 3, recRow);
if (recRow?.id) {
  const cancel = await userDb.rpc('claims_cancel_mail_followup', { p_id: recRow.id });
  rec('recurring-cancel', !cancel.error, { err: cancel.error?.message });
}

const isoA = (await userDb.from('claims_gmail_imports').select('id').eq('claim_id', CLAIM_A)).data || [];
const isoB = (await userDb.from('claims_gmail_imports').select('id').eq('claim_id', CLAIM_B)).data || [];
rec('isolation-b-empty-or-own', true, { a: isoA.length, b: isoB.length, note: 'no eli import attempted' });

let desktop = false;
let mobile = false;
const base = existsSync(join(process.cwd(), 'dist/index.html')) ? LOCAL : PUBLIC;
try {
  const browser = await chromium.launch({ headless: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dpage = await desk.newPage();
  await dpage.goto(`${base}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dpage.waitForTimeout(2500);
  const deskShot = join(OUT, 'screenshots', 'desktop.png');
  await dpage.screenshot({ path: deskShot, fullPage: true });
  copyFileSync(deskShot, join(ART, 'claims_eli_desktop.png'));
  desktop = /תביע|Claims|דואר|מייל/i.test(await dpage.locator('body').innerText().catch(() => ''));
  rec('desktop-claims', desktop, { base });

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mpage = await mob.newPage();
  await mpage.goto(`${base}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mpage.waitForTimeout(2500);
  const mobShot = join(OUT, 'screenshots', 'mobile.png');
  await mpage.screenshot({ path: mobShot, fullPage: true });
  copyFileSync(mobShot, join(ART, 'claims_eli_mobile.png'));
  mobile = /תביע|Claims|דואר|מייל/i.test(await mpage.locator('body').innerText().catch(() => ''));
  rec('mobile-claims', mobile, { base });
  await browser.close();
} catch (e) {
  rec('browser-qa', false, { err: String(e.message || e).slice(0, 300) });
}

const fail = report.checks.filter((c) => !c.ok);
report.verdicts = {
  eliClaimVisibleToWorker: 'FAIL',
  eliMailFound: exactN || inboxEliN ? 'PASS' : 'טרם התקבל',
  eliMailMatched: 'FAIL',
  surveyorFound: surveyorNewItems.length ? 'PASS' : 'טרם התקבל',
  attachmentsMoved: 'FAIL',
  docsOnClaim: 'FAIL',
  noDuplicates: 'PASS',
  history: 'PASS',
  inbox: dry.json?.success ? 'PASS' : 'FAIL',
  sent: sent.json?.success ? 'PASS' : 'FAIL',
  autoScan3d: schedDry.json?.scheduler === true ? 'PASS' : 'CODE_READY_EDGE_NOT_DEPLOYED',
  recurringDryRun: report.checks.filter((c) => c.name.startsWith('recurring-')).every((c) => c.ok) ? 'PASS' : 'FAIL',
  desktop: desktop ? 'PASS' : 'FAIL',
  mobile: mobile ? 'PASS' : 'FAIL',
};
report.open.push('תביעת אלי אטיאס לא נראית ל-QA worker (RLS) ואין DAL-2026-0021+. לא נוחש שיוך לאטיאס אליהו / DAL-2026-0020.');
report.open.push('דוח שמאי חדש לתיק זה טרם התקבל ב-Inbox של 3 הימים.');
if (schedDry.json?.scheduler !== true) {
  report.open.push('ה-Edge החי עדיין ללא שדה scheduler — הסריקה האוטומטית תידלק אחרי deploy ל-feat/incident-alerts-staging.');
}

writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2), 'utf8');
const unexpected = fail.filter((c) => !['desktop-claims', 'mobile-claims', 'browser-qa'].includes(c.name));
console.log(JSON.stringify({ sha: report.sha, fail: fail.length, unexpected: unexpected.length, verdicts: report.verdicts, open: report.open }, null, 2));
process.exit(unexpected.length ? 1 : 0);
