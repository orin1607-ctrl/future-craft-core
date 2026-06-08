import { chromium } from 'playwright';

const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';
const FORBIDDEN_HOSTS = ['qasomfndnjuixgjmjwcm', 'dalia-car.online', 'dalia-new'];

const routes = [
  '/dev/vehicle-card',
  '/dev/vehicle-new-dalia',
  '/dev/vehicle-flows',
  '/about',
];

const result = {
  routes: [],
  consoleErrors: [],
  networkIssues: [],
  forbiddenHosts: [],
  stagingCalls: 0,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') result.consoleErrors.push({ url: page.url(), text: msg.text() });
});

page.on('response', (res) => {
  const u = res.url();
  if (FORBIDDEN_HOSTS.some((h) => u.includes(h))) result.forbiddenHosts.push(u);
  if (u.includes(STAGING_HOST)) result.stagingCalls += 1;
  if (res.status() >= 400 && !u.includes('favicon') && !u.includes('fonts.googleapis')) {
    result.networkIssues.push({ url: u.slice(0, 120), status: res.status() });
  }
});

for (const route of routes) {
  const url = `${BASE}${route}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    const body = await page.textContent('body');
    result.routes.push({
      route,
      ok: !!body && body.length > 100,
      hasHub: body?.includes('דשבורד') || body?.includes('רכב') || body?.includes('Dalia') || body?.includes('תצוגה'),
      title: await page.title(),
    });
  } catch (e) {
    result.routes.push({ route, ok: false, error: String(e) });
  }
}

await browser.close();
console.log(JSON.stringify(result, null, 2));
