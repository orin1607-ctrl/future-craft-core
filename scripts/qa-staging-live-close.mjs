/**
 * Staging close-out — dalia-c.com live flow (no login required for marketing static)
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING = process.env.QA_BASE_URL || 'https://orin1607-ctrl.github.io/future-craft-core';
const SUPABASE = process.env.VITE_SUPABASE_URL || 'https://usfeoerkpcafxxlyuldl.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';

const report = {
  at: new Date().toISOString(),
  staging: STAGING,
  passed: [],
  failed: [],
  data: {},
};

const pass = (m) => report.passed.push(m);
const fail = (m) => report.failed.push(m);

// 1. Live dashboard.json on staging
const dashRes = await fetch(`${STAGING}/project-001/dashboard.json?t=${Date.now()}`);
if (dashRes.ok) {
  const dash = await dashRes.json();
  report.data.dashboard = {
    generatedAt: dash.generatedAt,
    site: dash.project?.site,
    gscClicks: dash.stats?.totalClicks,
    gscImpressions: dash.stats?.totalImpressions,
    ga4Sessions: dash.stats?.ga4Sessions,
    ga4PageViews: dash.stats?.ga4PageViews,
    gscPages: dash.searchConsole?.pages?.length,
    gscQueries: dash.searchConsole?.keywords?.length,
    lastSync: dash.lastSync?.timestamp,
  };
  dash.project?.site?.includes('dalia-c.com') ? pass('dashboard:site-dalia-c') : fail('dashboard:site');
  pass('dashboard:loaded');
} else fail('dashboard:fetch-' + dashRes.status);

// 2. Edge function reachable
const edgeRes = await fetch(`${SUPABASE}/functions/v1/create-admin-user`, { method: 'OPTIONS' });
edgeRes.ok || edgeRes.status === 204 ? pass('edge:create-admin-user-reachable') : fail('edge:options-' + edgeRes.status);

// 3. Marketing UI live-only
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${STAGING}/ai-marketing-platform`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('#screen-hub', { timeout: 60000 });

const ui = await page.evaluate(() => ({
  liveOnly: document.body.classList.contains('dalia-live-only'),
  hubSite: document.getElementById('coco-hub-client-sub')?.textContent || '',
  statusPanel: !!document.getElementById('coco-live-status-root'),
  daliaExit: document.querySelectorAll('.prd-dalia-exit').length >= 1,
  demoCompany: (document.getElementById('sf-company-display')?.textContent || '').includes('גרין-טק'),
}));

ui.liveOnly ? pass('ui:dalia-live-only') : fail('ui:dalia-live-only');
ui.hubSite.includes('dalia-c.com') ? pass('ui:hub-dalia-c') : fail('ui:hub-dalia-c');
ui.statusPanel ? pass('ui:status-panel') : fail('ui:status-panel');
ui.daliaExit ? pass('ui:dalia-exit-btn') : fail('ui:dalia-exit-btn');
!ui.demoCompany ? pass('ui:no-demo-company') : fail('ui:demo-company-visible');

await page.evaluate(() => window.goScreen('screen-status'));
await page.waitForTimeout(800);
const statusHasReal = await page.evaluate(() => {
  const root = document.getElementById('coco-live-status-root');
  return root ? /GSC|GA4|dalia-c\.com|קליקים/.test(root.textContent) : false;
});
statusHasReal ? pass('ui:status-real-data') : fail('ui:status-real-data');

await page.evaluate(() => window.goScreen('screen-hub'));
const exitWorks = await page.evaluate(() => typeof window.PrdDaliaNav?.exitToDalia === 'function');
exitWorks ? pass('ui:exit-fn') : fail('ui:exit-fn');

await browser.close();

report.ok = report.failed.length === 0;
const out = path.join(__dirname, '../docs/audit-reports/project-001/staging-live-close.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, passed: report.passed.length, failed: report.failed.length, data: report.data.dashboard }, null, 2));
process.exit(report.ok ? 0 : 1);
