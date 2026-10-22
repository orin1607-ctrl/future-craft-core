// scripts/verify-final-reports-integration.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const REF = 'usfeoerkpcafxxlyuldl';
const URL = `https://${REF}.supabase.co`;
const LIVE_URL = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = 'C:/Users/אליאב/.gemini/antigravity/brain/88ba5372-3049-43c2-938b-80dddc42cbe1';

if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

console.log('1. Checking deployed commit on public STAGING...');
let deployedCommit = '';
try {
  const resp = await fetch(`${LIVE_URL}/STAGING-DEPLOY.txt?_nocache=${Date.now()}`);
  if (resp.ok) {
    deployedCommit = (await resp.text()).trim();
    console.log(`Deployed commit in STAGING-DEPLOY.txt: ${deployedCommit}`);
  }
} catch (e) {
  console.log(`Error checking STAGING-DEPLOY.txt: ${e.message}`);
}

console.log('2. Authenticating as staging user...');
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(URL, serviceKey);

const email = 'orin1607@gmail.com';
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (linkErr) throw linkErr;
const { data: auth, error: authErr } = await createClient(URL, anonKey).auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
});
if (authErr) throw authErr;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = { deployedCommit, desktop: {}, mobile: {}, success: true };

try {
  // === DESKTOP VERIFICATION (1440x900) ===
  console.log('3. Running Desktop Verification (1440x900)...');
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await dCtx.addInitScript(
    ({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)),
    { s: REF, u: auth.session }
  );
  const dPage = await dCtx.newPage();
  await dPage.goto(`${LIVE_URL}/claims?_ts=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await dPage.waitForTimeout(4000);

  // 1. Verify small reports button next to filters
  const smallRepBtn = dPage.locator('[data-testid="claims-compact-reports-btn"], [data-testid="claims-btn-reports-compact"]');
  const hasSmallBtn = await smallRepBtn.first().isVisible();
  const smallBtnTxt = await smallRepBtn.first().innerText().catch(() => '');

  console.log('Desktop small reports button:', { hasSmallBtn, smallBtnTxt });

  // Highlight small reports button for screenshot
  await dPage.evaluate(() => {
    const btn = document.querySelector('[data-testid="claims-compact-reports-btn"], [data-testid="claims-btn-reports-compact"]');
    if (btn) {
      btn.style.outline = '2px solid #3b82f6';
      btn.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.8)';
    }
  });

  await dPage.screenshot({ path: path.join(OUT, 'live-desktop-small-reports-button.png') });

  // 2. Click "📊 דוחות" and verify upgraded native reports screen
  await smallRepBtn.click();
  await dPage.waitForTimeout(2500);

  const repHeading = await dPage.locator('[data-testid="claims-reports-heading"]').innerText().catch(() => '');
  const totalKpiTxt = await dPage.locator('[data-testid="rep-kpi-total"]').innerText().catch(() => '');
  console.log('Reports screen heading & KPI:', { repHeading, totalKpiTxt });

  await dPage.screenshot({ path: path.join(OUT, 'live-desktop-upgraded-reports-screen.png') });

  // 3. Test drilldown modal
  await dPage.locator('[data-testid="rep-kpi-total"]').click();
  await dPage.waitForTimeout(1000);
  const modalVisible = await dPage.locator('.ov.open .modal').isVisible();
  console.log('Drilldown modal opened:', modalVisible);
  await dPage.screenshot({ path: path.join(OUT, 'live-desktop-drilldown-modal.png') });

  // Close drilldown modal
  await dPage.locator('.ov.open .mcl').click();
  await dPage.waitForTimeout(500);

  // 4. Test Back button to claims list
  await dPage.locator('[data-testid="claims-reports-back-btn"]').click();
  await dPage.waitForTimeout(1000);
  const backToClaims = await dPage.locator('[data-testid="claims-origin-filters"]').isVisible();
  console.log('Back button returns to claims list:', backToClaims);

  results.desktop = { hasSmallBtn, smallBtnTxt, repHeading, totalKpiTxt, modalVisible, backToClaims };
  await dCtx.close();

  // === MOBILE VERIFICATION (Pixel 7 / 390x844) ===
  console.log('4. Running Mobile Verification (390x844)...');
  const mCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'he-IL',
  });
  await mCtx.addInitScript(
    ({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)),
    { s: REF, u: auth.session }
  );
  const mPage = await mCtx.newPage();
  await mPage.goto(`${LIVE_URL}/claims?_ts=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await mPage.waitForTimeout(4000);

  // Verify mobile small button next to filters
  const mSmallBtn = mPage.locator('[data-testid="claims-compact-reports-btn"], [data-testid="claims-btn-reports-compact"]');
  const mHasSmallBtn = await mSmallBtn.first().isVisible();
  const mSmallBtnTxt = await mSmallBtn.first().innerText().catch(() => '');

  console.log('Mobile small reports button:', { mHasSmallBtn, mSmallBtnTxt });

  // Highlight small reports button on mobile
  await mPage.evaluate(() => {
    const btn = document.querySelector('[data-testid="claims-compact-reports-btn"], [data-testid="claims-btn-reports-compact"]');
    if (btn) {
      btn.style.outline = '2px solid #3b82f6';
      btn.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.8)';
    }
  });

  await mPage.screenshot({ path: path.join(OUT, 'live-mobile-small-reports-button.png') });

  // Tap "📊 דוחות" on mobile
  await mSmallBtn.click();
  await mPage.waitForTimeout(2500);

  const mRepHeading = await mPage.locator('[data-testid="claims-reports-heading"]').innerText().catch(() => '');
  console.log('Mobile reports screen heading:', mRepHeading);

  await mPage.screenshot({ path: path.join(OUT, 'live-mobile-upgraded-reports-screen.png') });

  results.mobile = { mHasSmallBtn, mSmallBtnTxt, mRepHeading };
  await mCtx.close();
} catch (err) {
  console.error('Verification error:', err);
  results.success = false;
  results.error = String(err.message || err);
} finally {
  await browser.close();
}

console.log('\n=== Final Verification Results ===');
console.log(JSON.stringify(results, null, 2));

if (!results.success) process.exit(1);
