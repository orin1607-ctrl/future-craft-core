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
    console.log('HELP-AI-CHAT RESPONSE STATUS:', resp.status());
    try {
      const text = await resp.text();
      console.log('HELP-AI-CHAT RESPONSE BODY:', text.slice(0, 500));
    } catch {}
  }
});

await page.goto('https://orin1607-ctrl.github.io/future-craft-core/claims', { waitUntil: 'networkidle' });
console.log('Page loaded, title:', await page.title());

const daliaBtn = page.getByRole('button', { name: /דליה AI/i }).first();
await daliaBtn.waitFor({ state: 'visible', timeout: 15000 });
await daliaBtn.click();
console.log('Clicked Dalia AI button on main claims screen');

await page.waitForTimeout(2000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/08-general-ai-drawer-opened.png' });

const newChatBtn = page.getByRole('button', { name: /שיחה חדשה/i }).first();
if (await newChatBtn.isVisible()) {
  await newChatBtn.click();
  console.log('Clicked שיחה חדשה');
  await page.waitForTimeout(1000);
}

const textarea = page.locator('[data-testid="claims-ai-input"]');
await textarea.waitFor({ state: 'visible', timeout: 15000 });
await textarea.fill('כמה תביעות פתוחות יש?');

const sendBtn = page.locator('[data-testid="claims-ai-send"]');
await sendBtn.waitFor({ state: 'visible', timeout: 5000 });
await sendBtn.click();
console.log('Submitted question: כמה תביעות פתוחות יש?');

// Wait for streaming answer to finish
await page.waitForTimeout(25000);
await page.screenshot({ path: 'backups/qa-shots-claims-ai/09-general-ai-answer.png' });

const text = await page.locator('.claims-ai-message, [class*="message"], .chat-bubble').allInnerTexts();
console.log('Message texts received:', text);

await browser.close();
