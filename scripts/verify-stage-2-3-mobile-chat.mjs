// scripts/verify-stage-2-3-mobile-chat.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

async function startPreview(port = 4178) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ proc, url: `http://127.0.0.1:${port}` });
      }
    }, 3500);
    proc.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      if (str.includes('127.0.0.1') && !resolved) {
        clearTimeout(timer);
        resolved = true;
        resolve({ proc, url: `http://127.0.0.1:${port}` });
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      if (!resolved) reject(err);
    });
  });
}

async function run() {
  console.log('================================================================================');
  console.log('🚀 בדיקת שלב 2 ושלב 3: התאמה מלאה למובייל, תפריט צירוף, 9 כפתורי פעולה ובדיקת GM-2026-0056');
  console.log('================================================================================');

  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (authErr) throw authErr;
  const session = authData.session;
  console.log('✅ Auth session obtained in STAGING.');

  const server = await startPreview(4178);
  console.log(`✅ Preview server running at ${server.url}`);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }

  try {
    // 1. Mobile viewport test (iPhone 12/13/14)
    console.log('\n[שלב 1] בדיקה במובייל (390x844)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();

    const authKey = `sb-${STAGING_REF}-auth-token`;
    await mobilePage.addInitScript(
      ({ key, sess }) => {
        window.localStorage.setItem(key, JSON.stringify(sess));
      },
      { key: authKey, sess: session },
    );

    await mobilePage.goto(`${server.url}/garage-management?cb=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForSelector('[data-testid="garage-ai-launch-btn"]', { timeout: 25000 });

    // Open Dalia AI Workspace
    await mobilePage.click('[data-testid="garage-ai-launch-btn"]');
    await mobilePage.waitForSelector('[data-testid="claims-ai-workspace"]', { timeout: 15000 });
    console.log('✅ צ\'אט דליה AI נפתח בהצלחה במובייל.');

    // Verify Welcome Hub & 9 Action Buttons
    await mobilePage.waitForSelector('[data-testid="garage-welcome-hub"]', { timeout: 5000 });
    const actionIds = [
      'garage-action-new-customer',
      'garage-action-existing-customer',
      'garage-action-intake',
      'garage-action-quote',
      'garage-action-invoices-credits',
      'garage-action-general-expenses',
      'garage-action-find-case',
      'garage-action-close-case',
      'garage-action-resume',
    ];

    for (const actId of actionIds) {
      const exists = await mobilePage.$(`[data-testid="${actId}"]`);
      if (!exists) throw new Error(`Missing action button: ${actId}`);
    }
    console.log('✅ כל 9 כפתורי הפעולה של מסך הפתיחה מוצגים במובייל כראוי!');

    // Check Textarea width in mobile
    const textareaBox = await mobilePage.locator('[data-testid="claims-ai-input"]').boundingBox();
    console.log(`📏 רוחב שדה ההקלדה במובייל: ${Math.round(textareaBox.width)}px (מתוך 390px)`);
    if (textareaBox.width < 180) {
      throw new Error(`Textarea is too narrow on mobile: ${textareaBox.width}px`);
    }
    console.log('✅ שדה ההקלדה רחב ונוח לשימוש במובייל!');

    // Check Attachment Popover
    await mobilePage.click('[data-testid="claims-ai-attach-toggle"]');
    await mobilePage.waitForSelector('[data-testid="claims-ai-attach-popover"]', { timeout: 3000 });
    await mobilePage.waitForSelector('[data-testid="claims-ai-camera-btn"]', { timeout: 3000 });
    await mobilePage.waitForSelector('[data-testid="claims-ai-gallery-btn"]', { timeout: 3000 });
    await mobilePage.waitForSelector('[data-testid="claims-ai-attach-btn"]', { timeout: 3000 });
    console.log('✅ תפריט הצירוף הקומפקטי נפתח ומציג צילום במצלמה, בחירה מגלריה וצירוף מסמך/PDF.');

    const shotMobile = path.join(ARTIFACTS_DIR, 'dalia-ai-garage-mobile-stage2-3.png');
    await mobilePage.screenshot({ path: shotMobile });
    console.log(`📸 צילום מסך נשמר: ${shotMobile}`);

    // Test GM-2026-0056 direct load without freeze
    console.log('\n[שלב 2] בדיקת טעינת כרטיס GM-2026-0056 ללא תקיעה...');
    await mobilePage.goto(`${server.url}/garage-management/GM-2026-0056`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await mobilePage.waitForTimeout(2000);
    const content = await mobilePage.content();
    if (content.includes('טעינת תיק נכשלה')) {
      throw new Error('GM-2026-0056 failed to load with getCase error');
    }
    console.log('✅ כרטיס GM-2026-0056 נטען ללא שגיאות או תקיעה!');

    console.log('\n🎉 שלב 2 ושלב 3 הושלמו ואומתו בהצלחה מלאה!');
  } finally {
    await browser.close();
    server.proc.kill();
  }
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
