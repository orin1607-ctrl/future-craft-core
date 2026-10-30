import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = 'C:/Users/אליאב/Projects/oren-car-carpart-staging';
const OUT = join(ROOT, 'scratch/live-staging-buttons-proof');
mkdirSync(OUT, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const QA_USER = 'qa.claims.worker.1788292403067@futurecraft.staging';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';

async function main() {
  console.log('1. Checking live STAGING-DEPLOY.txt...');
  const res = await fetch(`${BASE}/STAGING-DEPLOY.txt?nc=${Date.now()}`);
  const deployTxt = await res.text();
  console.log('DEPLOY_TXT:\n' + deployTxt.trim());

  console.log('2. Generating QA auth session...');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  const admin = createClient(`https://${STAGING_REF}.supabase.co`, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });
  const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: QA_USER });
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
  const { data: auth } = await client.auth.verifyOtp({ email: QA_USER, token: link.properties.email_otp, type: 'email' });
  console.log('Auth session ready for', QA_USER);

  const browser = await chromium.launch({ channel: 'chrome' });

  try {
    // ---- Test 1: Desktop - General Chat ----
    console.log('3. Testing Desktop (1400x900) - General Chat...');
    const ctxDesktop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const pDesktop = await ctxDesktop.newPage();
    await pDesktop.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pDesktop.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
    await pDesktop.goto(`${BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 35000 });

    const aiBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 15000 });
    await aiBtn.click();
    console.log('Opened Claims AI in Desktop General Chat');

    await pDesktop.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pDesktop.waitForTimeout(600);

    const quoteBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 8000 });
    const detailsBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 8000 });
    console.log('General Chat Buttons:', { quote: !!quoteBtn, details: !!detailsBtn });
    await pDesktop.screenshot({ path: join(OUT, 'live_desktop_01_general_chat_buttons.png'), fullPage: false });

    // Click quote mode and verify hint
    await quoteBtn.click();
    await pDesktop.waitForSelector('[data-testid="claims-ai-mode-hint"]');
    await pDesktop.waitForTimeout(300);
    await pDesktop.screenshot({ path: join(OUT, 'live_desktop_02_quote_hint.png'), fullPage: false });

    // Close AI
    const closeBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-close"]');
    await closeBtn.click();
    await pDesktop.waitForTimeout(500);

    // ---- Test 2: Desktop - Inside Claim Card (Flora Cohen DAL-2026-0008) ----
    console.log('4. Testing Desktop (1400x900) - Inside Claim Card DAL-2026-0008...');
    const floraRow = await pDesktop.waitForSelector('[data-testid="claim-row-DAL-2026-0008"]', { timeout: 15000 });
    await floraRow.click();
    console.log('Clicked Flora Cohen claim card DAL-2026-0008');
    await pDesktop.waitForTimeout(600);

    // In claim card, open Dalia AI via claims-ai-open-claim
    const claimAiBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-open-claim"]', { timeout: 10000 });
    await claimAiBtn.click();
    console.log('Opened Dalia AI inside Flora Cohen claim card');

    await pDesktop.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pDesktop.waitForTimeout(600);

    const cardQuoteBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 8000 });
    const cardDetailsBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 8000 });
    console.log('Claim Card Chat Buttons:', { quote: !!cardQuoteBtn, details: !!cardDetailsBtn });
    await pDesktop.screenshot({ path: join(OUT, 'live_desktop_03_claim_card_buttons.png'), fullPage: false });

    // Click details button inside claim card
    await cardDetailsBtn.click();
    await pDesktop.waitForSelector('[data-testid="claims-ai-mode-hint"]');
    await pDesktop.waitForTimeout(300);
    await pDesktop.screenshot({ path: join(OUT, 'live_desktop_04_card_details_hint.png'), fullPage: false });

    // Close claim AI
    const closeCardAiBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-close"]');
    await closeCardAiBtn.click();
    await pDesktop.waitForTimeout(400);

    // ---- Test 3: Mobile (390x844 - iPhone 14/15) ----
    console.log('5. Testing Mobile (390x844) - Live Staging...');
    const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pMobile = await ctxMobile.newPage();
    await pMobile.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pMobile.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
    await pMobile.goto(`${BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 35000 });

    const aiBtnMobile = await pMobile.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 15000 });
    await aiBtnMobile.click();
    await pMobile.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pMobile.waitForTimeout(600);

    const mQuote = await pMobile.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 8000 });
    const mDetails = await pMobile.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 8000 });
    console.log('Mobile General Chat Buttons:', { quote: !!mQuote, details: !!mDetails });
    await pMobile.screenshot({ path: join(OUT, 'live_mobile_390_01_buttons.png'), fullPage: false });

    await mQuote.click();
    await pMobile.waitForSelector('[data-testid="claims-ai-mode-hint"]');
    await pMobile.waitForTimeout(300);
    await pMobile.screenshot({ path: join(OUT, 'live_mobile_390_02_quote_hint.png'), fullPage: false });

    // ---- Test 4: Mobile (360x780 - Compact Android) ----
    console.log('6. Testing Mobile (360x780) - Live Staging...');
    const ctxSmall = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    const pSmall = await ctxSmall.newPage();
    await pSmall.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pSmall.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
    await pSmall.goto(`${BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 35000 });

    const aiBtnSmall = await pSmall.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 15000 });
    await aiBtnSmall.click();
    await pSmall.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pSmall.waitForTimeout(600);

    const sQuote = await pSmall.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 8000 });
    const sDetails = await pSmall.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 8000 });
    console.log('Compact Android Buttons:', { quote: !!sQuote, details: !!sDetails });
    await pSmall.screenshot({ path: join(OUT, 'live_mobile_360_01_buttons.png'), fullPage: false });

    console.log('ALL LIVE STAGING CHECKS PASSED WITH FLYING COLORS!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
