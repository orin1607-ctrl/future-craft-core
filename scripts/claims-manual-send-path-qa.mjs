/**
 * Diagnose real Claims manual send vs self-test. Staging only. Then one real UI send_claim.
 * node scripts/claims-manual-send-path-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const TO = 'yoni19111977@gmail.com';
const OUT = join(process.cwd(), 'docs/audit-reports/claims-manual-send-path-2026-09-01');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const report = { at: new Date().toISOString(), staging: STAGING_REF, productionTouched: false, checks: [], payloads: [], send: null };
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && extra.note ? ' · ' + extra.note : ''}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: recent } = await admin.from('claims_gmail_outbox')
  .select('id, claim_id, kind, status, to_addr, cc_addr, subject, sender, gmail_message_id, gmail_thread_id, file_names, created_at, sent_at')
  .order('created_at', { ascending: false })
  .limit(20);
writeFileSync(join(OUT, 'outbox-recent.json'), JSON.stringify(recent, null, 2));
report.outbox = recent;
const selfTests = (recent || []).filter((r) => String(r.kind || '').includes('self_test'));
const claimSends = (recent || []).filter((r) => r.kind === 'claim_send');
rec('recent-self-test-count', true, { n: selfTests.length, rows: selfTests.map((r) => ({ id: r.id, to: r.to_addr, subject: r.subject, status: r.status, at: r.created_at })) });
rec('recent-claim-send-count', true, { n: claimSends.length, rows: claimSends.map((r) => ({ id: r.id, claim: r.claim_id, to: r.to_addr, subject: r.subject, status: r.status, msgid: r.gmail_message_id, at: r.created_at })) });

const deployTxt = (await fetch(`${PUBLIC}/STAGING-DEPLOY.txt?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())).trim();
const html = await fetch(`${PUBLIC}/claims?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
const bundle = (html.match(/assets\/index-[^"'\\\s>]+\.js/) || [])[0];
const js = bundle ? await fetch(`${PUBLIC}/${bundle}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()) : '';
rec('public-bundle', /67561af|feat\/incident-alerts-staging/.test(deployTxt), { deployTxt, bundle });
rec('bundle-has-send_claim', js.includes('send_claim'));
rec('bundle-has-confirm-true', /["']send_claim["']/.test(js) && /confirm:\s*!0|confirm:\s*true|"confirm":true/.test(js));
rec('bundle-mail-confirm-send', js.includes('mail-confirm-send'));
rec('bundle-no-self-test-button', !/send_self_test/.test(js) || !/data-testid":"gmail-self-test/.test(js));
rec('bundle-dir-ltr', js.includes('dir:"ltr"') || js.includes('dir: "ltr"') || js.includes('dir=\\"ltr\\"') || /dir:\s*"ltr"/.test(js) || js.includes('dir:\'ltr\'') || js.includes("dir:\"ltr\""));

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(3);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;
const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });

const { data: docs18 } = await admin.from('claims_documents').select('id, original_name, byte_size, claim_id').eq('claim_id', 'DAL-2026-0018').limit(20);
const { data: docs19 } = await admin.from('claims_documents').select('id, original_name, byte_size, claim_id').eq('claim_id', 'DAL-2026-0019').limit(20);
report.docs = { 'DAL-2026-0018': docs18, 'DAL-2026-0019': docs19 };
const CLAIM = (docs18 && docs18.length) ? 'DAL-2026-0018' : ((docs19 && docs19.length) ? 'DAL-2026-0019' : 'DAL-2026-0018');
rec('picked-test-claim', true, { CLAIM, files: (CLAIM === 'DAL-2026-0018' ? docs18 : docs19)?.map((f) => f.original_name) });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: `sb-${STAGING_REF}-auth-token`,
  value: {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  },
});
const page = await ctx.newPage();
page.on('request', (req) => {
  if (req.url().includes('/functions/v1/claims-gmail') && req.method() === 'POST') {
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { body = { raw: req.postData() }; }
    report.payloads.push({
      action: body.action,
      confirm: body.confirm === true,
      to: body.to,
      cc: body.cc,
      subject: body.subject,
      body: String(body.body || '').slice(0, 180),
      file_ids: body.file_ids,
      claim_id: body.claim_id,
      idempotency_key: body.idempotency_key ? 'present' : 'missing',
    });
  }
});
const sendResponses = [];
page.on('response', async (res) => {
  if (res.url().includes('/functions/v1/claims-gmail') && res.request().method() === 'POST') {
    const json = await res.json().catch(() => ({}));
    let body = {};
    try { body = JSON.parse(res.request().postData() || '{}'); } catch { /* */ }
    sendResponses.push({ action: body.action, status: res.status(), json });
  }
});

await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(1800);
await page.getByText(CLAIM).first().click({ timeout: 15000 });
await page.waitForTimeout(1000);
rec('opened-claim', await page.locator('[data-testid="claims-send-mail"]').count() > 0, { CLAIM });
await page.locator('[data-testid="claims-send-mail"]').click();
await page.waitForTimeout(800);
rec('mail-modal-title', await page.getByText('שליחת תיק במייל').count() > 0);
rec('no-self-test-copy-in-modal', await page.getByText('שליחת TEST').count() === 0);

await page.locator('[data-testid="mail-to"]').fill(TO);
const toAfter = await page.locator('[data-testid="mail-to"]').inputValue();
rec('to-unchanged', toAfter === TO, { toAfter });

const fileBox = page.locator('[data-testid^="mail-file-"]').first();
if (await fileBox.count()) {
  await fileBox.check();
  await page.waitForTimeout(600);
}
await page.waitForTimeout(400);
const subjectBefore = await page.locator('[data-testid="mail-subj"]').inputValue();
rec('subject-from-ui', subjectBefore.length > 0, { subjectBefore });

await page.locator('[data-testid="mail-preview-btn"]').click();
await page.waitForTimeout(1800);
rec('preview-visible', await page.locator('[data-testid="mail-preview"]').count() > 0);
const previewTo = await page.locator('[data-testid="mail-preview"]').innerText();
rec('preview-shows-to', previewTo.includes(TO), { previewTo: previewTo.slice(0, 400) });
const toAfterPreview = await page.locator('[data-testid="mail-to"]').inputValue();
rec('to-same-after-preview', toAfterPreview === TO, { toAfterPreview });

const sendBtn = page.locator('[data-testid="mail-send-btn"]');
rec('send-enabled', await sendBtn.isEnabled());
await sendBtn.click();
await page.waitForTimeout(500);
await page.locator('[data-testid="mail-ack"]').check();
await page.locator('[data-testid="mail-confirm-send"]').click();
await page.waitForTimeout(10000);

const sendClaimPayloads = report.payloads.filter((p) => p.action === 'send_claim');
const selfTestPayloads = report.payloads.filter((p) => p.action === 'send_self_test' || p.action === 'reply_self_test');
rec('action-was-send_claim', sendClaimPayloads.length >= 1, { sendClaimPayloads, selfTestPayloads });
rec('never-called-self-test', selfTestPayloads.length === 0);
rec('confirm-true', sendClaimPayloads.some((p) => p.confirm === true), sendClaimPayloads[0] || {});
rec('payload-to', sendClaimPayloads.some((p) => String(p.to).toLowerCase() === TO), sendClaimPayloads[0] || {});
rec('payload-has-attachment', Array.isArray(sendClaimPayloads[0]?.file_ids) && sendClaimPayloads[0].file_ids.length > 0, { file_ids: sendClaimPayloads[0]?.file_ids });

const sent = sendResponses.find((s) => s.action === 'send_claim' && s.json?.success === true);
report.send = sent?.json || sendResponses.filter((s) => s.action === 'send_claim').pop()?.json || null;
rec('gmail-success', Boolean(sent?.json?.success && sent.json.gmail_message_id), report.send);
rec('ui-does-not-fake-success', !(await page.getByText('נשלח · msgid').count()) || Boolean(sent?.json?.gmail_message_id));

if (sent?.json?.gmail_message_id) {
  const { data: outbox } = await admin.from('claims_gmail_outbox').select('*').eq('gmail_message_id', sent.json.gmail_message_id);
  rec('outbox-claim-send', (outbox || []).length === 1 && outbox[0].kind === 'claim_send', outbox?.[0] ? { kind: outbox[0].kind, to: outbox[0].to_addr, files: outbox[0].file_names } : {});
  const { data: hist } = await admin.from('claims_history').select('id, row_data').eq('claim_id', CLAIM).order('created_at', { ascending: false }).limit(6);
  rec('history', (hist || []).some((h) => String(h.row_data?.gmail_message_id || '') === sent.json.gmail_message_id));
  const { data: comm } = await admin.from('claims_comm_log').select('id, row_data').eq('claim_id', CLAIM).order('created_at', { ascending: false }).limit(6);
  rec('comm', (comm || []).some((h) => String(h.row_data?.gmail_message_id || '') === sent.json.gmail_message_id));
}

await page.screenshot({ path: join(OUT, 'after-manual-send.png') });
await browser.close();

writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  ok: report.checks.filter((c) => c.ok === false && !String(c.name).startsWith('recent-')).length === 0,
  fail: report.checks.filter((c) => c.ok === false).map((c) => c.name),
  claim: CLAIM,
  action: sendClaimPayloads[0]?.action,
  confirm: sendClaimPayloads[0]?.confirm,
  to: report.send?.to,
  subject: report.send?.subject,
  files: report.send?.files,
  messageId: report.send?.gmail_message_id,
  threadId: report.send?.gmail_thread_id,
  outboxClaimSends: claimSends.length,
  outboxSelfTests: selfTests.length,
}, null, 2));
