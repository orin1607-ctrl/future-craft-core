/**
 * QA: dalia-c.com campaign + pages binding on Staging/local static serve.
 */
import { chromium } from 'playwright';

const BASE = process.env.STAGING_BASE || 'http://localhost:60363';
const url = BASE.replace(/\/$/, '') + '/ai-marketing-platform.html';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(4000);

const result = await page.evaluate(() => {
  const ds = window.DaliaSite;
  const ctx = (window.COCO && COCO.flowContext) || {};
  const sfCamp = document.getElementById('sf-campaign');
  const sfSite = document.getElementById('sf-site');
  const sfProj = document.getElementById('sf-project');
  const sfPage = document.getElementById('sf-page');
  return {
    daliaSite: !!ds,
    clientId: ctx.clientId,
    campaign: ctx.campaign,
    campaignName: ctx.campaignName,
    project: ctx.project,
    site: ctx.site,
    gscOk: ds?.getDashboard?.()?.connections?.searchConsole?.ok,
    ga4Ok: ds?.getDashboard?.()?.connections?.analytics4?.ok,
    sfCampaignSelected: sfCamp?.options?.[sfCamp.selectedIndex]?.text,
    sfSiteSelected: sfSite?.options?.[sfSite.selectedIndex]?.text,
    sfProjectSelected: sfProj?.options?.[sfProj.selectedIndex]?.text,
    sfPageCount: sfPage?.options?.length,
    company: document.getElementById('sf-company-display')?.textContent,
    bundleCampaigns: window.CocoData?.state?.bundle?.campaigns?.length,
  };
});

console.log(JSON.stringify(result, null, 2));
const ok = result.clientId === 'dalia-c-official' &&
  result.campaign === 'campaign-dalia-seo-primary' &&
  result.site === 'dalia-c.com' &&
  result.gscOk && result.ga4Ok &&
  (result.sfPageCount || 0) > 5;
console.log(ok ? 'PASS campaign QA' : 'FAIL campaign QA');
await browser.close();
process.exit(ok ? 0 : 1);
