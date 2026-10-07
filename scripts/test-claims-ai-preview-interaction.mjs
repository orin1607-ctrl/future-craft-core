import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLIC = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'backups', 'qa-shots-claims-ai');

const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email || 'orin1607@gmail.com';

const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });
const session = auth.session;

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 900 } });
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

const page = await context.newPage();
await page.goto(`${PUBLIC}/claims`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2000);

// Open claim
await page.locator('.cl-row, tr[data-testid^="claim-row-"], .claims-table tbody tr').first().click();
await page.waitForTimeout(1500);

// Open AI
await page.locator('[data-testid="claims-ai-open-claim"]').click();
await page.waitForTimeout(1500);

// Request task creation preview
const textarea = page.locator('[data-testid="claims-ai-input"]');
const sendButton = page.locator('[data-testid="claims-ai-send"]');
await textarea.fill('צור משימה לבדוק שמאות תוך יומיים');
await sendButton.click();

await page.waitForSelector('[data-testid="claims-ai-loading"]', { state: 'detached', timeout: 45000 }).catch(() => {});
await page.waitForTimeout(2000);

await page.screenshot({ path: join(OUT, '20-task-preview-card.png') });
console.log('Saved 20-task-preview-card.png');

// Find the cancel button in the pending card
const cancelBtn = page.locator('.claims-ai-pending-card button:has-text("ביטול"), button:has-text("ביטול")').last();
console.log('Clicking cancel button...');
await cancelBtn.click();
await page.waitForTimeout(3000);

await page.screenshot({ path: join(OUT, '21-task-cancelled-result.png') });
console.log('Saved 21-task-cancelled-result.png');

await browser.close();
console.log('Done!');
