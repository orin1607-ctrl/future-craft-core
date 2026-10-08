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

page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
page.on('response', async (resp) => {
  if (resp.url().includes('help-ai-chat')) {
    console.log('HELP-AI-CHAT STATUS:', resp.status());
    try {
      const text = await resp.text();
      console.log('HELP-AI-CHAT BODY (snippet):', text.slice(0, 300));
    } catch {}
  }
});

await page.goto('https://orin1607-ctrl.github.io/future-craft-core/claims', { waitUntil: 'networkidle' });
console.log('Claims page loaded');
await page.screenshot({ path: 'backups/qa-shots-claims-ai/13-initial-claims-page.png' });

// Switch to claims list view
const tikimBtn = page.getByRole('button', { name: /תיקים/i }).first();
await tikimBtn.waitFor({ state: 'visible', timeout: 10000 });
await tikimBtn.click();
console.log('Switched to claims list view');
await page.waitForTimeout(2000);

// Click on the first claim row in the table
const firstRow = page.locator('[data-testid^="claim-row-"]').first();
await firstRow.waitFor({ state: 'visible', timeout: 15000 });
await firstRow.click();
console.log('Clicked first claim row to open modal');

// Wait for claim card modal
const openAiBtn = page.locator('[data-testid="claims-ai-open-claim"]');
await openAiBtn.waitFor({ state: 'visible', timeout: 10000 });
await openAiBtn.click();
console.log('Opened Dalia AI in open claim context');

await page.waitForTimeout(2000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/10-claim-context-ai-drawer.png' });

// Start new chat if button present
const newChatBtn = page.getByRole('button', { name: /שיחה חדשה/i }).first();
if (await newChatBtn.isVisible()) {
  await newChatBtn.click();
  console.log('Clicked שיחה חדשה');
  await page.waitForTimeout(1000);
}

// Ask to prepare a share link for surveyor
const textarea = page.locator('[data-testid="claims-ai-input"]');
await textarea.waitFor({ state: 'visible', timeout: 10000 });
await textarea.fill('תכין קישור שיתוף לשמאי עם כל התמונות');

const sendBtn = page.locator('[data-testid="claims-ai-send"]');
await sendBtn.waitFor({ state: 'visible', timeout: 5000 });
await sendBtn.click();
console.log('Sent prompt: תכין קישור שיתוף לשמאי עם כל התמונות');

// Wait for preview card to appear
const confirmBtn = page.locator('[data-testid="claims-ai-confirm-btn"]');
await confirmBtn.waitFor({ state: 'visible', timeout: 35000 });
console.log('Preview card rendered with אישור button!');

await page.screenshot({ path: 'backups/qa-shots-claims-ai/11-preview-card-rendered.png' });

// Click "אישור" to execute
await confirmBtn.click();
console.log('Clicked אישור on preview card!');

// Wait for execution result
await page.waitForTimeout(8000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/12-preview-action-executed.png' });

const messages = await page.locator('.claims-ai-message, [class*="message"]').allInnerTexts();
console.log('Messages after execution:', messages);

await browser.close();
