/**
 * QA — Dalia CRM module (files + staging smoke)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const OUT = join(process.cwd(), 'docs/audit-reports/project-001');
mkdirSync(OUT, { recursive: true });
const STAGING = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';

const report = { at: new Date().toISOString(), passed: [], failed: [] };
const pass = (m) => report.passed.push(m);
const fail = (m) => report.failed.push(m);

const files = [
  'public/dalia-crm-platform.html',
  'public/crm/dalia-crm-screens.html',
  'public/crm/dalia-crm-app.js',
  'public/crm/crm-api.js',
  'public/crm/dalia-crm-auth.js',
  'public/crm/dalia-crm-nav.js',
  'public/crm/dalia-crm.css',
  'src/pages/DaliaCrmPage.tsx',
  'supabase/migrations/20260624190000_crm_module.sql',
  '.github/workflows/deploy-staging-pages.yml',
];

files.forEach((f) => (existsSync(join(process.cwd(), f)) ? pass('file:' + f) : fail('file-missing:' + f)));

const app = readFileSync(join(process.cwd(), 'public/crm/dalia-crm-app.js'), 'utf8');
!app.includes('greentech') && !app.includes('CLT-001') ? pass('crm:no-demo-clients') : fail('crm:demo-clients');
app.includes('CrmApi.loadBundle') ? pass('crm:load-bundle') : fail('crm:load-bundle');
app.includes('submitNewTask') ? pass('crm:tasks-module') : fail('crm:tasks-module');

const api = readFileSync(join(process.cwd(), 'public/crm/crm-api.js'), 'utf8');
api.includes('crm_leads') && api.includes('crm_tasks') ? pass('crm:api-tables') : fail('crm:api-tables');
api.includes('loadBundle') ? pass('crm:supabase-list') : fail('crm:supabase-list');

const deploy = readFileSync(join(process.cwd(), '.github/workflows/deploy-staging-pages.yml'), 'utf8');
deploy.includes('dalia-crm-platform.html') && deploy.includes('dalia-crm.html') ? pass('deploy:crm-copy') : fail('deploy:crm-copy');

const platform = readFileSync(join(process.cwd(), 'public/dalia-crm-platform.html'), 'utf8');
platform.includes('marketing-api.js') && platform.includes('client-id-ssot.js') ? pass('crm:loads-api') : fail('crm:loads-api');

const routes = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
routes.includes('/dalia-crm') && routes.includes('DaliaCrmPage') ? pass('crm:react-route') : fail('crm:react-route');

const access = readFileSync(join(process.cwd(), 'src/lib/routeAccess.ts'), 'utf8');
access.includes("'/dalia-crm'") ? pass('crm:route-access') : fail('crm:route-access');

const admin = readFileSync(join(process.cwd(), 'src/pages/AdminHome.tsx'), 'utf8');
admin.includes('/dalia-crm') ? pass('crm:admin-home-link') : fail('crm:admin-home-link');

try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = STAGING + '/dalia-crm-platform.html?v=crm-qa';
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  resp && resp.ok() ? pass('staging:crm-platform-http') : fail('staging:crm-platform-http');
  await page.waitForSelector('#screen-crm-main', { timeout: 20000 }).then(() => pass('staging:crm-main-screen')).catch(() => fail('staging:crm-main-screen'));
  const title = await page.textContent('.page-title');
  title && title.includes('לקוחות') ? pass('staging:crm-title') : fail('staging:crm-title');
  const crmApi = await page.goto(STAGING + '/crm/crm-api.js', { waitUntil: 'domcontentloaded', timeout: 30000 });
  crmApi && crmApi.ok() ? pass('staging:crm-api-js') : fail('staging:crm-api-js');
  const deep = await page.goto(STAGING + '/dalia-crm.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  deep && deep.ok() ? pass('staging:crm-entry-html') : fail('staging:crm-entry-html');
  await browser.close();
} catch (e) {
  fail('staging:browser-' + (e.message || e));
}

writeFileSync(join(OUT, 'crm-qa.json'), JSON.stringify(report, null, 2));
console.log('CRM QA:', report.passed.length, 'passed,', report.failed.length, 'failed');
report.failed.forEach((f) => console.error(' FAIL', f));
process.exit(report.failed.length ? 1 : 0);
