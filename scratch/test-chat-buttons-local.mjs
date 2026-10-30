import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = 'C:/Users/אליאב/Projects/oren-car-carpart-staging';
const OUT = join(ROOT, 'scratch/chat-buttons-proof');
mkdirSync(OUT, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const QA_USER = 'qa.claims.worker.1788292403067@futurecraft.staging';
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

async function main() {
  console.log('1. Generating QA auth session...');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  const admin = createClient(`https://${STAGING_REF}.supabase.co`, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });
  const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;

  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: QA_USER });
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
  const { data: auth } = await client.auth.verifyOtp({ email: QA_USER, token: link.properties.email_otp, type: 'email' });
  console.log('Auth session ready for', QA_USER);

  console.log(`2. Starting local vite preview on port ${PORT}...`);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    shell: true,
    stdio: 'pipe',
  });

  preview.stdout.on('data', (d) => console.log('[preview stdout]', d.toString().trim()));
  preview.stderr.on('data', (d) => console.log('[preview stderr]', d.toString().trim()));

  await new Promise((r) => setTimeout(r, 3500));

  const browser = await chromium.launch({ channel: 'chrome' });

  try {
    // ---- Test 1: Desktop (1400x900) ----
    console.log('3. Testing Desktop (1400x900)...');
    const ctxDesktop = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const pDesktop = await ctxDesktop.newPage();
    await pDesktop.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pDesktop.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
    await pDesktop.goto(`${BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 30000 });

    const aiBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 15000 });
    await aiBtn.click();
    console.log('Opened Claims AI in Desktop');

    await pDesktop.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pDesktop.waitForTimeout(600);

    const quoteBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 5000 });
    const detailsBtn = await pDesktop.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 5000 });
    console.log('Desktop buttons found:', { quote: !!quoteBtn, details: !!detailsBtn });

    await pDesktop.screenshot({ path: join(OUT, 'desktop_01_two_buttons.png'), fullPage: false });

    // Click quote button and verify hint
    await quoteBtn.click();
    await pDesktop.waitForSelector('[data-testid="claims-ai-mode-hint"]');
    await pDesktop.waitForTimeout(300);
    await pDesktop.screenshot({ path: join(OUT, 'desktop_02_quote_hint.png'), fullPage: false });

    // Click details button and verify hint
    await detailsBtn.click();
    await pDesktop.waitForSelector('[data-testid="claims-ai-mode-hint"]');
    await pDesktop.waitForTimeout(300);
    await pDesktop.screenshot({ path: join(OUT, 'desktop_03_details_hint.png'), fullPage: false });

    // ---- Test 2: Mobile (390x844 - iPhone 14/15) ----
    console.log('4. Testing Mobile (390x844)...');
    const ctxMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pMobile = await ctxMobile.newPage();
    await pMobile.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pMobile.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
    await pMobile.goto(`${BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 30000 });

    const aiBtnMobile = await pMobile.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 15000 });
    await aiBtnMobile.click();
    await pMobile.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pMobile.waitForTimeout(600);

    const mQuote = await pMobile.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 5000 });
    const mDetails = await pMobile.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 5000 });
    console.log('Mobile buttons found:', { quote: !!mQuote, details: !!mDetails });

    await pMobile.screenshot({ path: join(OUT, 'mobile_390_01_two_buttons.png'), fullPage: false });

    await mQuote.click();
    await pMobile.waitForSelector('[data-testid="claims-ai-mode-hint"]');
    await pMobile.waitForTimeout(300);
    await pMobile.screenshot({ path: join(OUT, 'mobile_390_02_quote_hint.png'), fullPage: false });

    // ---- Test 3: Mobile (360x780 - Compact Android) ----
    console.log('5. Testing Mobile (360x780)...');
    const ctxSmall = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    const pSmall = await ctxSmall.newPage();
    await pSmall.goto(BASE, { waitUntil: 'domcontentloaded' });
    await pSmall.evaluate((s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)), auth.session);
    await pSmall.goto(`${BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 30000 });

    const aiBtnSmall = await pSmall.waitForSelector('[data-testid="claims-ai-open"]', { timeout: 15000 });
    await aiBtnSmall.click();
    await pSmall.waitForSelector('[data-testid="claims-ai-workspace"]');
    await pSmall.waitForTimeout(600);

    const sQuote = await pSmall.waitForSelector('[data-testid="claims-ai-mode-quote"]', { timeout: 5000 });
    const sDetails = await pSmall.waitForSelector('[data-testid="claims-ai-mode-details"]', { timeout: 5000 });
    console.log('Small mobile buttons found:', { quote: !!sQuote, details: !!sDetails });

    await pSmall.screenshot({ path: join(OUT, 'mobile_360_01_two_buttons.png'), fullPage: false });

    console.log('ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
