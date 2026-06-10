/**
 * Static audit checklist for Dalia Settings — run after deploy.
 * Usage: node scripts/verify-dalia-settings-audit.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'audit-reports');
mkdirSync(OUT, { recursive: true });

const STAGING = 'https://orin1607-ctrl.github.io/future-craft-core';

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(ok ? '✓' : '✗', name, detail ? `— ${detail}` : '');
}

async function verifyBundle() {
  const html = await (await fetch(`${STAGING}/`)).text();
  const m = html.match(/\/future-craft-core\/assets\/index-[^"']+\.js/);
  if (!m) {
    check('staging bundle exists', false);
    return;
  }
  const js = await (await fetch(`https://orin1607-ctrl.github.io${m[0]}`)).text();
  check('Dalia Settings hub', js.includes('Dalia Settings'));
  check('WhatsApp Settings page', js.includes('WhatsApp Settings'));
  check('Gupshup section', js.includes('Gupshup'));
  check('company settings helper', js.includes('buildReminderOffsets') || js.includes('getCompanyReminderOffsets'));
  check('email template storage', js.includes('dalia_email_templates_v1'));
  check('system logs page', js.includes('system_logs'));
}

function verifySourceRoutes() {
  const app = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
  check('route /dalia-settings', app.includes('path="/dalia-settings"'));
  check('route /dalia-settings/whatsapp', app.includes('path="/dalia-settings/whatsapp"'));
  check('system-logs uses SystemLogs', app.includes('<Route path="/system-logs" element={<SystemLogs />}'));
  check('GupshupWhatsAppSection imported', readFileSync(join(ROOT, 'src', 'pages', 'WhatsAppSettingsPage.tsx'), 'utf8').includes('GupshupWhatsAppSection'));
}

function verifyNoFakeEmailSave() {
  const et = readFileSync(join(ROOT, 'src', 'pages', 'EmailTemplates.tsx'), 'utf8');
  check('email templates use storage', et.includes('saveStoredEmailTemplate'));
  check('email templates not fake-only toast', !et.includes("saveTemplate = (_id: string)"));
}

verifySourceRoutes();
verifyNoFakeEmailSave();
await verifyBundle();

const report = {
  at: new Date().toISOString(),
  staging: STAGING,
  checks,
  passed: checks.every((c) => c.ok),
};

writeFileSync(join(OUT, 'dalia-settings-audit.json'), JSON.stringify(report, null, 2));
console.log('\nReport:', join(OUT, 'dalia-settings-audit.json'));
process.exit(report.passed ? 0 : 1);
