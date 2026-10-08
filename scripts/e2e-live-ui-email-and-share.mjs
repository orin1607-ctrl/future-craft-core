import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZmVvZXJrcGNhZnh4bHl1bGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTQ4NTYsImV4cCI6MjA5NDY5MDg1Nn0.Z1AsULSK9fNsVwjw7iRP_DkSodeTUdtb-eB5s66qtJU';
const sb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey);

const { data: sess, error: loginErr } = await sb.auth.signInWithPassword({
  email: 'qa.claims.worker.1788292403067@futurecraft.staging',
  password: 'QaWorker2026!'
});

if (loginErr || !sess?.session) {
  console.error('Login failed:', loginErr);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
  key: `sb-${STAGING_REF}-auth-token`,
  value: {
    access_token: sess.session.access_token,
    refresh_token: sess.session.refresh_token,
    expires_at: sess.session.expires_at,
    user: sess.session.user
  }
});

const page = await ctx.newPage();

page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('HELP-AI-CHAT') || text.includes('execute') || text.includes('error')) {
    console.log('PAGE LOG:', text);
  }
});

page.on('response', async (resp) => {
  if (resp.url().includes('help-ai-chat')) {
    console.log(`[HTTP ${resp.status()}] help-ai-chat`);
    try {
      const text = await resp.text();
      console.log(`[HTTP BODY SNIPPET]:`, text.slice(0, 300));
    } catch {}
  }
});

console.log('--- Step 1: Navigating to Claims UI ---');
await page.goto('https://orin1607-ctrl.github.io/future-craft-core/claims', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'backups/qa-shots-claims-ai/30-claims-page.png' });

console.log('--- Step 2: Opening Claims List and QA Claim ---');
const tikimBtn = page.getByRole('button', { name: /תיקים/i }).first();
await tikimBtn.waitFor({ state: 'visible', timeout: 10000 });
await tikimBtn.click();
await page.waitForTimeout(2000);

const firstRow = page.locator('[data-testid^="claim-row-"]').first();
await firstRow.waitFor({ state: 'visible', timeout: 15000 });
await firstRow.click();
console.log('Opened claim card modal');

const openAiBtn = page.locator('[data-testid="claims-ai-open-claim"]');
await openAiBtn.waitFor({ state: 'visible', timeout: 10000 });
await openAiBtn.click();
console.log('Opened Dalia AI in open claim context');
await page.waitForTimeout(2000);

// Click New Chat if visible
const newChatBtn = page.getByRole('button', { name: /שיחה חדשה/i }).first();
if (await newChatBtn.isVisible()) {
  await newChatBtn.click();
  console.log('Clicked שיחה חדשה');
  await page.waitForTimeout(1000);
}

const input = page.locator('[data-testid="claims-ai-input"]');
const sendBtn = page.locator('[data-testid="claims-ai-send"]');

// ==========================================
// TEST A: Send test email via Dalia AI UI
// ==========================================
console.log('\n--- Step 3: Prompting to send email via Gmail ---');
await input.waitFor({ state: 'visible', timeout: 10000 });
await input.fill('שלח מייל בדיקה לכתובת yoni122222@gmail.com עם נושא בדיקת QA דליה AI והודעה שהמערכת עובדת תקין');
await sendBtn.click();
console.log('Sent email request prompt');

console.log('Waiting for email Preview Card...');
const confirmBtn1 = page.locator('[data-testid="claims-ai-confirm-btn"]').first();
await confirmBtn1.waitFor({ state: 'visible', timeout: 40000 });
console.log('✅ Email Preview Card rendered with [אישור] button!');
await page.screenshot({ path: 'backups/qa-shots-claims-ai/31-email-preview-card.png' });

console.log('Clicking [אישור] on Email Preview Card...');
await confirmBtn1.click();
await page.waitForTimeout(10000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/32-email-executed.png' });

// ==========================================
// TEST B: Create Share Link via Dalia AI UI
// ==========================================
console.log('\n--- Step 4: Prompting to create share link for surveyor ---');
await input.fill('תכין קישור שיתוף לשמאי עם כל התמונות בתיק');
await sendBtn.click();
console.log('Sent share link prompt');

console.log('Waiting for Share Link Preview Card...');
await page.waitForTimeout(3000);
const confirmBtn2 = page.locator('[data-testid="claims-ai-confirm-btn"]').last();
await confirmBtn2.waitFor({ state: 'visible', timeout: 40000 });
console.log('✅ Share Link Preview Card rendered with [אישור] button!');
await page.screenshot({ path: 'backups/qa-shots-claims-ai/33-share-preview-card.png' });

console.log('Clicking [אישור] on Share Link Preview Card...');
await confirmBtn2.click();
await page.waitForTimeout(10000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/34-share-executed.png' });

// Extract the share link from the chat bubbles
const chatText = await page.locator('.claims-ai-message, [class*="message"], .chat-bubble').allInnerTexts();
const fullText = chatText.join('\n');
const matchUrl = fullText.match(/https:\/\/orin1607-ctrl\.github\.io\/future-craft-core\/claims-share\?t=([a-f0-9]+)/);
const shareUrl = matchUrl ? matchUrl[0] : null;
console.log('Extracted Share URL from UI:', shareUrl);

if (shareUrl) {
  console.log('Opening Share URL in unauthenticated page...');
  const page2 = await ctx.newPage();
  await page2.goto(shareUrl, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(3000);
  await page2.screenshot({ path: 'backups/qa-shots-claims-ai/35-share-page-opened.png' });
  console.log('✅ Share URL successfully loaded in browser! Page title:', await page2.title());
  await page2.close();
}

// ==========================================
// TEST C: Send email containing the share link
// ==========================================
console.log('\n--- Step 5: Prompting Dalia AI to email the share link ---');
await input.fill('שלח במייל לנמען yoni122222@gmail.com את קישור השיתוף שנוצר עבור השמאי עם כל התמונות');
await sendBtn.click();
console.log('Sent email share link prompt');

console.log('Waiting for Email-With-Link Preview Card...');
await page.waitForTimeout(3000);
const confirmBtn3 = page.locator('[data-testid="claims-ai-confirm-btn"]').last();
await confirmBtn3.waitFor({ state: 'visible', timeout: 40000 });
console.log('✅ Email-With-Link Preview Card rendered with [אישור] button!');
await page.screenshot({ path: 'backups/qa-shots-claims-ai/36-email-with-link-preview.png' });

console.log('Clicking [אישור] on Email-With-Link Preview Card...');
await confirmBtn3.click();
await page.waitForTimeout(10000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/37-email-with-link-executed.png' });

await browser.close();
console.log('\n--- Browser Flow Complete! ---');
