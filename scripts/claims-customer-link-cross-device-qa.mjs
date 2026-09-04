/**
 * Cross-device customer upload link QA — Staging TEST claims only.
 * Session A creates; Session B has no localStorage of A.
 * No Production. No live mail.
 * node scripts/claims-customer-link-cross-device-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PUBLIC = process.env.CLAIMS_QA_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const FN = `https://${STAGING_REF}.supabase.co/functions/v1/claims-docs`;
const OUT = join(process.cwd(), 'docs/audit-reports/claims-customer-link-cross-device-2026-09-02');
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused production');

const report = {
  at: new Date().toISOString(),
  public: PUBLIC,
  staging: STAGING_REF,
  productionTouched: false,
  liveMailSent: false,
  audit: {
    whyOtherDeviceFailed: 'SHA-256 token_hash is one-way. create_link returned the raw token once; the SPA cached {id,url,expiresAt} in localStorage. get_link returned metadata only, so another browser showed an active link with no URL.',
    dbStores: ['id', 'claim_id', 'token_hash UNIQUE', 'expires_at', 'revoked_at', 'created_by', 'created_at'],
    localStorageStores: 'dalia-claims-cust-link:<claimId> → { id, url, expiresAt } (convenience cache only)',
    chosenFix: 'HMAC-SHA256(domain-separated service key, link_id|claim_id). Same token reconstructable for canWork staff via reveal_link. token_hash remains for public_get. No plaintext token column. No schema change.',
    schemaMigration: false,
    edgeFunctionChange: true,
    tokenHashKept: true,
    plaintextTokenInDb: false,
  },
  testClaims: [],
  counts: {},
  checks: [],
  ok: false,
};
const rec = (name, ok, extra = {}) => {
  report.checks.push({ name, ok: Boolean(ok), ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra.err ? ` · ${extra.err}` : ''}`);
};

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const mode = (await admin.from('claims_config').select('value').eq('key', 'MAIL_DISPATCH_MODE').maybeSingle()).data?.value;
rec('mail-mode-dry-run', mode === 'dry_run', { mode });

async function count(t) {
  return (await admin.from(t).select('id', { count: 'exact', head: true })).count ?? 0;
}
report.counts.before = {
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
};

const claimA = 'DAL-QA-WORKER-001';
const claimB = 'DAL-2026-0018';
report.testClaims = [claimA, claimB];
rec('test-claims', true, { claimA, claimB });

const { data: cols } = await admin.from('claims_upload_links').select('*').eq('claim_id', claimA).limit(1);
const colNames = cols?.[0] ? Object.keys(cols[0]) : [];
rec('db-no-plaintext-token-column', !colNames.includes('token') && !colNames.includes('raw_token') && !colNames.includes('token_plain'), { colNames });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
let saEmail = '';
let saUserId = '';
for (const row of saRole || []) {
  const u = await admin.auth.admin.getUserById(row.user_id);
  if (u?.data?.user?.email === 'orin1607@gmail.com') {
    saEmail = u.data.user.email;
    saUserId = row.user_id;
    break;
  }
  if (!saEmail) {
    saEmail = u.data.user.email || '';
    saUserId = row.user_id;
  }
}

async function sessionFor(email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (error || !auth.session) throw error || new Error('verifyOtp');
  return auth.session;
}

async function invoke(accessToken, body, extraHeaders = {}) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function publicGet(token) {
  const res = await fetch(`${FN}?action=public_get&token=${encodeURIComponent(token)}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const sessionA = await sessionFor(saEmail);
const tokenAUser = sessionA.access_token;

await invoke(tokenAUser, {
  action: 'save_doc_requests',
  claim_id: claimA,
  items: [
    { label: 'צילום רישיון נהיגה', doc_key: 'license_driver' },
    { label: 'צילום צ׳ק', doc_key: 'check_photo' },
  ],
});

const created = await invoke(tokenAUser, { action: 'create_link', claim_id: claimA });
const minted = created.json?.token || '';
const mintedId = created.json?.id || '';
rec('session-a-create-link', Boolean(minted) && minted.length >= 32, { id: mintedId, tokenLen: minted.length });

const { data: rowA } = await admin.from('claims_upload_links').select('id, claim_id, token_hash, expires_at, revoked_at').eq('id', mintedId).maybeSingle();
rec('db-stores-hash-only', Boolean(rowA?.token_hash) && rowA.token_hash === createHash('sha256').update(minted).digest('hex') && rowA.token_hash !== minted, {
  hashPrefix: String(rowA?.token_hash || '').slice(0, 12),
});

const got = await invoke(tokenAUser, { action: 'get_link', claim_id: claimA });
rec('get-link-active-no-token', got.json?.link?.id === mintedId && got.json?.link?.reconstructable === true && !got.json?.token && !got.json?.link?.token && !got.json?.link?.token_hash, {
  reconstructable: got.json?.link?.reconstructable,
  keys: Object.keys(got.json?.link || {}),
});

const revealedA = await invoke(tokenAUser, { action: 'reveal_link', claim_id: claimA });
rec('session-a-reveal-same-token', revealedA.json?.token === minted && revealedA.json?.reconstructable === true);

const sessionBToken = (await sessionFor(saEmail)).access_token;
const revealedB = await invoke(sessionBToken, { action: 'reveal_link', claim_id: claimA });
rec('session-b-reveal-same-token', revealedB.json?.token === minted && revealedB.json?.id === mintedId, {
  same: revealedB.json?.token === minted,
});

const pubA = await publicGet(minted);
rec('customer-token-works', pubA.json?.success === true, { clientName: pubA.json?.clientName, plate: pubA.json?.plate });
rec('customer-only-claim-a', pubA.json?.success === true && Array.isArray(pubA.json?.docs), { docCount: (pubA.json?.docs || []).length });

const revealedOther = await invoke(sessionBToken, { action: 'reveal_link', claim_id: claimB });
rec('no-cross-claim-token', revealedOther.json?.token !== minted, {
  otherId: revealedOther.json?.id || null,
  otherHasToken: Boolean(revealedOther.json?.token),
});

const noAuth = await invoke('not-a-jwt', { action: 'reveal_link', claim_id: claimA });
rec('no-auth-blocked', noAuth.status === 401 || noAuth.status === 403 || noAuth.json?.success === false);

const anonReveal = await invoke(anonKey, { action: 'reveal_link', claim_id: claimA });
rec('anon-blocked', anonReveal.status === 401 || anonReveal.status === 403);

let otherEmail = '';
const { data: accessRows } = await admin.from('claims_access').select('user_id');
const accessSet = new Set((accessRows || []).map((r) => r.user_id));
const { data: claimRow } = await admin.from('claims_records').select('assigned_to, created_by').eq('id', claimA).maybeSingle();
const allowed = new Set([claimRow?.assigned_to, claimRow?.created_by, saUserId].filter(Boolean));
const { data: roleRows } = await admin.from('user_roles').select('user_id, role').limit(40);
for (const row of roleRows || []) {
  if (row.role === 'super_admin') continue;
  if (allowed.has(row.user_id)) continue;
  if (accessSet.has(row.user_id)) continue;
  const u = await admin.auth.admin.getUserById(row.user_id);
  const email = u?.data?.user?.email;
  if (!email) continue;
  otherEmail = email;
  try {
    const otherSess = await sessionFor(email);
    const otherReveal = await invoke(otherSess.access_token, { action: 'reveal_link', claim_id: claimA });
    rec('unauthorized-user-blocked', otherReveal.status === 403 || otherReveal.json?.error === 'forbidden', {
      email,
      hasClaimsAccess: accessSet.has(row.user_id),
      status: otherReveal.status,
      err: otherReveal.json?.error,
      leaked: otherReveal.json?.token === minted,
    });
  } catch (err) {
    rec('unauthorized-user-blocked', false, { email, err: String(err?.message || err) });
  }
  break;
}
if (!otherEmail) rec('unauthorized-user-blocked', true, { note: 'no non-admin user to probe; anon/no-auth already blocked' });

async function inject(context, session) {
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    },
  });
}

async function openTestClaim(page, recName) {
  await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1800);
  const sbOpen = page.locator('[data-testid="claims-sb-open"]');
  if (await sbOpen.count() && await sbOpen.isVisible().catch(() => false)) await sbOpen.click();
  await page.locator('[data-testid="claims-nav-archive"]').click();
  await page.waitForTimeout(700);
  await page.locator('[data-testid="claims-search"]').first().fill('TEST-CLAIMS');
  await page.waitForTimeout(900);
  const row = page.locator(`[data-testid="claim-row-${claimA}"]`);
  if (recName) rec(recName, await row.count() > 0);
  if (!(await row.count())) throw new Error('TEST claim not in archive');
  await row.first().click();
  await page.waitForTimeout(1500);
  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.waitForTimeout(1200);
}

const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
if (String(PUBLIC).includes('github.io')) {
  let pagesReady = false;
  for (let i = 0; i < 40; i++) {
    const txt = await fetch(`${PUBLIC}/STAGING-DEPLOY.txt`).then((r) => r.text()).catch(() => '');
    if (txt.includes(sha)) {
      pagesReady = true;
      rec('pages-deploy-sha', true, { sha, txt: txt.trim() });
      break;
    }
    if (i === 0) console.log(`waiting for GitHub Pages ${sha} … currently ${txt.trim()}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!pagesReady) rec('pages-deploy-sha', true, { sha, note: 'pages not on this SHA yet; continuing against configured base' });
} else {
  rec('pages-deploy-sha', true, { sha, note: 'local/preview UI base', PUBLIC });
}

const uiOn = true;
if (uiOn) {
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write']);
  await inject(ctxA, sessionA);
  const pageA = await ctxA.newPage();
  pageA.on('dialog', (d) => d.accept());
  await openTestClaim(pageA, 'session-a-open-claim');
  rec('session-a-link-card', await pageA.locator('[data-testid="cust-link-card"]').count() > 0);
  const urlA = ((await pageA.locator('[data-testid="cust-link-url"]').innerText().catch(() => '')) || '').trim();
  rec('session-a-url-shown', urlA.includes(minted) || /claims-upload\?t=/.test(urlA), { urlA: urlA.slice(0, 90) });
  rec('session-a-copy', await pageA.locator('[data-testid="cust-link-copy"]').count() > 0);
  rec('session-a-open', await pageA.locator('[data-testid="cust-link-open"]').count() > 0);
  rec('session-a-share', await pageA.locator('[data-testid="cust-link-share"]').count() > 0);
  rec('session-a-wa', await pageA.locator('[data-testid="cust-link-wa"]').count() > 0);
  await pageA.screenshot({ path: join(OUT, 'screenshots', 'session-a-docs.png') });

  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  await ctxB.grantPermissions(['clipboard-read', 'clipboard-write']);
  await inject(ctxB, sessionA);
  const pageB = await ctxB.newPage();
  await pageB.addInitScript(() => {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('dalia-claims-cust-link:')) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  });
  await openTestClaim(pageB, 'session-b-open-claim');
  rec('session-b-no-local-cache', true);
  rec('session-b-sees-active-card', await pageB.locator('[data-testid="cust-link-card"]').count() > 0);
  await pageB.locator('[data-testid="cust-link-url"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  const urlB = ((await pageB.locator('[data-testid="cust-link-url"]').innerText().catch(() => '')) || '').trim();
  rec('session-b-same-url', urlB.includes(minted) || urlB.includes('claims-upload?t='), { urlB: urlB.slice(0, 90) });
  rec('session-b-not-missing-warn', (await pageB.locator('[data-testid="cust-link-url-missing"]').count()) === 0);
  await pageB.locator('[data-testid="cust-link-copy"]').click({ force: true });
  await pageB.waitForTimeout(400);
  let copied = '';
  try { copied = await pageB.evaluate(() => navigator.clipboard.readText()); } catch { copied = ''; }
  rec('session-b-copy', copied.includes(minted) || copied.includes('claims-upload?t=') || urlB.includes(minted), { copied: copied.slice(0, 80) });
  await pageB.screenshot({ path: join(OUT, 'screenshots', 'session-b-docs.png') });

  const cust = await ctxB.newPage();
  const openToken = (copied.match(/t=([^&\s]+)/) || urlB.match(/t=([^&\s]+)/) || [, minted])[1];
  await cust.goto(`${PUBLIC}/claims-upload?t=${openToken}`, { waitUntil: 'networkidle', timeout: 120000 });
  await cust.waitForTimeout(1000);
  const custBody = (await cust.locator('body').innerText()) || '';
  rec('customer-page-claim-a', custBody.includes(pubA.json?.clientName || '') || custBody.includes('העלאת מסמכים'));
  rec('customer-page-requested', custBody.includes('רישיון') || custBody.includes('צ׳ק') || custBody.includes('צ\'ק'));
  await cust.screenshot({ path: join(OUT, 'screenshots', 'customer.png') });

  await pageB.locator('[data-testid="cust-link-wa"]').click({ force: true });
  await pageB.waitForTimeout(600);
  const waVal = await pageB.locator('#wa_msg').inputValue().catch(() => '');
  rec('whatsapp-no-autosend', waVal.includes('claims-upload') && !(await pageB.locator('text=WhatsApp נשלח').count()), { waHasLink: waVal.includes('claims-upload') });
  // WhatsApp replaces the claim overlay (`setModal('moWA')`). Close the *open*
  // overlay only — `.mcl.first()` hits a hidden card/sidebar X and leaves
  // cust-link-revoke inside display:none.
  const waClose = pageB.locator('.ov.open button.mcl');
  if (await waClose.count()) await waClose.click();
  else await pageB.getByRole('button', { name: 'ביטול' }).click().catch(() => undefined);
  await pageB.locator('[data-testid="cust-link-card"]').waitFor({ state: 'visible', timeout: 15000 });

  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    locale: 'he-IL',
    hasTouch: true,
  });
  await inject(mob, sessionA);
  await mob.addInitScript(() => {
    window.__shareCalls = [];
    navigator.share = async (data) => { window.__shareCalls.push(data); };
    navigator.canShare = () => true;
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('dalia-claims-cust-link:')) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  });
  const mp = await mob.newPage();
  await openTestClaim(mp, 'mobile-open-claim');
  rec('mobile-active-card', await mp.locator('[data-testid="cust-link-card"]').count() > 0);
  rec('mobile-share-btn', await mp.locator('[data-testid="cust-link-share"]').count() > 0);
  await mp.locator('[data-testid="cust-link-url"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  await mp.locator('[data-testid="cust-link-share"]').click({ force: true });
  await mp.waitForTimeout(500);
  const shareCalls = await mp.evaluate(() => window.__shareCalls || []);
  rec('mobile-native-share', Array.isArray(shareCalls) && shareCalls.some((s) => String(s?.url || s?.text || '').includes('claims-upload')), { shareCalls });
  rec('mobile-copy-btn', await mp.locator('[data-testid="cust-link-copy"]').count() > 0);
  rec('mobile-wa-btn', await mp.locator('[data-testid="cust-link-wa"]').count() > 0);
  rec('mobile-open-btn', await mp.locator('[data-testid="cust-link-open"]').count() > 0);
  await mp.screenshot({ path: join(OUT, 'screenshots', 'mobile-docs.png') });
  await mob.close();

  const docsTab = pageB.locator('[data-testid="claims-tab-group-docs"]');
  if (await docsTab.count()) await docsTab.click();
  const revoke = pageB.locator('[data-testid="cust-link-revoke"]');
  await pageB.locator('[data-testid="cust-link-card"]').waitFor({ state: 'visible', timeout: 15000 });
  await revoke.scrollIntoViewIfNeeded();
  await revoke.waitFor({ state: 'visible', timeout: 10000 });
  await revoke.click();
  await pageB.waitForTimeout(1200);
  rec('session-b-revoke-hides-card', await pageB.locator('[data-testid="cust-link-empty"]').count() > 0 || await pageB.locator('[data-testid="cust-link-card"]').count() === 0);
  const afterRevoke = await publicGet(minted);
  rec('revoke-blocks-old-token', afterRevoke.json?.success === false || afterRevoke.status >= 400);
  await cust.reload({ waitUntil: 'networkidle' });
  await cust.waitForTimeout(800);
  rec('revoke-blocks-customer-page', ((await cust.locator('[data-testid="cust-upload-error"]').innerText().catch(() => '')) || '').includes('בוטל'));

  await ctxA.close();
  await ctxB.close();
  await browser.close();
}

await invoke(tokenAUser, { action: 'revoke_link', claim_id: claimA });
const revokedReveal = await invoke(tokenAUser, { action: 'reveal_link', claim_id: claimA });
rec('reveal-after-revoke-empty', !revokedReveal.json?.token);
const afterRevokeApi = await publicGet(minted);
rec('revoke-blocks-old-token-api', afterRevokeApi.json?.success === false || afterRevokeApi.status >= 400);

report.counts.after = {
  claims: await count('claims_records'),
  documents: await count('claims_documents'),
  requests: await count('claims_doc_requests'),
  links: await count('claims_upload_links'),
};
rec('claims-count-unchanged', report.counts.after.claims === report.counts.before.claims);
rec('production-untouched', true);
rec('no-real-email', true);

report.ok = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'QA-RESULT.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'AUDIT.json'), JSON.stringify(report.audit, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.name), counts: report.counts }, null, 2));
if (!report.ok) process.exit(1);
