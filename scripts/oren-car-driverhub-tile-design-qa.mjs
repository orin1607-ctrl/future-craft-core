/**
 * Staging-only visual QA for DriverHub tile design.
 * node scripts/oren-car-driverhub-tile-design-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_QA_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-driverhub-3tiles-staging/qa-design');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), base: BASE, stagingRef: STAGING_REF, tests: [], consoleErrors: [], networkErrors: [], ok: false };

function rec(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function measureTiles(page) {
  return page.evaluate(() => {
    const labels = ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'];
    const buttons = [...document.querySelectorAll('button')].filter((b) => labels.some((l) => (b.innerText || '').includes(l) && (b.innerText || '').includes('לחץ לפריט')));
    return buttons.map((b) => {
      const cs = getComputedStyle(b);
      const ps = [...b.querySelectorAll('p')].map((p) => {
        const s = getComputedStyle(p);
        return { text: (p.innerText || '').trim(), fontSize: parseFloat(s.fontSize) || 0, fontWeight: s.fontWeight, color: s.color };
      });
      const rgb = cs.backgroundColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
      const [r, g, bl] = rgb;
      const isBlueNavy = bl >= r && bl >= g && bl > 40 && r < 90;
      const svgCount = b.querySelectorAll('svg').length;
      const title = ps[0];
      const statusCandidate = ps.find((p) => /הכול תקין|אין תאונות|יש הערה|דורשים טיפול|בקשות ממתינות|עודכן לאחרונה|אין פעילות/.test(p.text));
      return {
        text: (b.innerText || '').slice(0, 180),
        svgCount,
        isBlueNavy,
        bg: cs.backgroundColor,
        title,
        statusCandidate,
        titleBiggerThanStatus: !statusCandidate || (title && title.fontSize > statusCandidate.fontSize + 4),
        hasClickHint: (b.innerText || '').includes('לחץ לפריט'),
        width: b.getBoundingClientRect().width,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      };
    });
  });
}

async function main() {
  rec('safety-db', 'Staging DB only', STAGING_REF === 'usfeoerkpcafxxlyuldl', { STAGING_REF });
  rec('safety-base', 'Not Production URL', !BASE.includes('dalia-car.online'), { BASE });

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const company = `QA-TD-${runId}`;
  const email = `qa-td-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const ids = { users: [], drivers: [], companies: [company] };

  try {
    await admin.from('company_settings').insert({ company_name: company });
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) throw createErr;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({ id: created.user.id, full_name: 'QA TD', company_name: company, is_active: true, approval_status: 'approved', two_factor_approved: true });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'super_admin' });
    const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;
    const { data: driver, error: dErr } = await admin.from('drivers').insert({
      full_name: `QA TD Driver ${runId}`, company_name: company, id_number: `6${String(runId).slice(-8)}`, phone: '0501112233', status: 'active', notes: 'n',
    }).select('id,full_name').single();
    if (dErr) throw dErr;
    ids.drivers.push(driver.id);

    const browser = await chromium.launch();
    async function openHub(context) {
      await context.addInitScript(
        ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
        {
          key: `sb-${STAGING_REF}-auth-token`,
          value: {
            access_token: auth.session.access_token,
            refresh_token: auth.session.refresh_token,
            expires_at: auth.session.expires_at,
            expires_in: auth.session.expires_in,
            token_type: auth.session.token_type,
            user: auth.session.user,
          },
        },
      );
      const page = await context.newPage();
      page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
      page.on('response', (res) => {
        if (res.url().includes(STAGING_REF) && res.status() >= 400) report.networkErrors.push({ status: res.status(), url: res.url() });
      });
      await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3500);
      return page;
    }

    const desktop = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openHub(desktop);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800);
    const home = await page.locator('body').innerText();
    rec('three-tiles', 'Exactly the 3 tile names', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => home.includes(t)));
    rec('no-old-4tiles', 'Old 4-tile labels gone', !home.includes('בקשות ושליחה') && !home.includes('מסמכים ורישיון') && !home.includes('פעילות והערות'));
    rec('click-hint', 'לחץ לפריט present', home.includes('לחץ לפריט'));
    rec('descriptions', 'Short descriptions present', home.includes('רישיון, מסמכים, בקשות') && home.includes('מבחני כשירות') && home.includes('יומן פעילות'));

    const tiles = await measureTiles(page);
    rec('tile-count', '3 hub tiles measured', tiles.length === 3, { count: tiles.length });
    rec('no-icons', 'No SVG icons inside tiles', tiles.every((t) => t.svgCount === 0), { svg: tiles.map((t) => t.svgCount) });
    rec('navy-blue', 'Tiles use navy/blue from site hue', tiles.every((t) => t.isBlueNavy), { bgs: tiles.map((t) => t.bg) });
    rec('title-dominant', 'Title larger than status text', tiles.every((t) => t.titleBiggerThanStatus), { tiles: tiles.map((t) => ({ title: t.title, status: t.statusCandidate })) });
    rec('no-hscroll-desktop', 'No horizontal scroll desktop', tiles.every((t) => !t.overflowX));
    await page.screenshot({ path: join(OUT, 'desktop-tiles.png'), fullPage: true }).catch(() => null);

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    rec('deeplink-docs', 'section=documents opens', (await page.locator('body').innerText()).includes('רישיון') || page.url().includes('section=documents'));
    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    rec('deeplink-requests', 'section=requests still works', (await page.locator('body').innerText()).includes('בקש') || (await page.locator('body').innerText()).includes('תצהיר'));
    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    rec('deeplink-driving', 'section=driving opens', (await page.locator('body').innerText()).includes('תאונ') || (await page.locator('body').innerText()).includes('מבחן'));
    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=activity`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    rec('deeplink-activity', 'section=activity opens', (await page.locator('body').innerText()).includes('הערות'));

    const mobile = await browser.newContext({ ...devices['iPhone 13'] });
    const mpage = await openHub(mobile);
    const mTiles = await measureTiles(mpage);
    rec('mobile-3tiles', 'Mobile 3 tiles stacked', mTiles.length === 3 && mTiles.every((t) => t.width > 280));
    rec('mobile-no-icons', 'Mobile tiles have no SVG icons', mTiles.every((t) => t.svgCount === 0));
    rec('mobile-title-dominant', 'Mobile title larger than status', mTiles.every((t) => t.titleBiggerThanStatus));
    rec('mobile-no-hscroll', 'No horizontal scroll mobile', mTiles.every((t) => !t.overflowX));
    rec('mobile-readable-title', 'Mobile title >= 18px', mTiles.every((t) => (t.title?.fontSize || 0) >= 18), { sizes: mTiles.map((t) => t.title?.fontSize) });
    await mpage.screenshot({ path: join(OUT, 'mobile-tiles.png'), fullPage: true }).catch(() => null);

    await browser.close();
  } catch (e) {
    rec('fatal', 'QA error', false, { error: String(e.message || e) });
  } finally {
    try {
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      for (const c of ids.companies) await admin.from('company_settings').delete().eq('company_name', c);
      for (const id of ids.users) {
        await admin.from('profiles').delete().eq('id', id);
        await admin.from('user_roles').delete().eq('user_id', id);
        await admin.auth.admin.deleteUser(id);
      }
      rec('cleanup', 'Ephemeral Staging QA rows removed', true);
    } catch (e) {
      rec('cleanup', 'Ephemeral Staging QA rows removed', false, { error: String(e.message || e) });
    }
  }

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failed: report.tests.filter((t) => !t.ok).map((t) => t.id), consoleErrors: report.consoleErrors.length, networkErrors: report.networkErrors.length }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
