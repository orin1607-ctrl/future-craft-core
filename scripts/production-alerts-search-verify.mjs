/**
 * Production verify — Alerts plate + internal autocomplete (frontend-only).
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const PROD = 'qasomfndnjuixgjmjwcm';
const LIVE = 'https://dalia-car.online';
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();

const OUT = 'public/project-001/production-alerts-search-result.json';
const SUMMARY = 'public/project-001/production-alerts-search-summary.json';

const out = {
  id: 'production-alerts-search-verify',
  at: new Date().toISOString(),
  host: LIVE,
  deploy_sha: deploySha || null,
  migrations_required: false,
  stop_after_report: true,
  checks: [],
  ok: false,
};

function check(id, ok, detail = {}) {
  out.checks.push({ id, ok, ...detail });
  console.log(ok ? '✅' : '❌', id, detail.error || detail.note || '');
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const siteRes = await fetch(LIVE + '/', { redirect: 'follow' });
  const html = await siteRes.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
  must(siteRes.ok && bundle, 'Production site/bundle missing');

  const jsRes = await fetch(`${LIVE}/${bundle}`);
  const js = await jsRes.text();
  must(js.includes('חיפוש מספר פנימי...'), 'bundle missing internal search copy');
  must(js.includes('חיפוש מספר רכב...'), 'bundle missing plate search copy');
  must(js.includes('לא נמצא מספר פנימי'), 'bundle missing internal empty text');
  must(js.includes('לא נמצא מספר רכב'), 'bundle missing plate empty text');
  must(!js.includes('usfeoerkpcafxxlyuldl'), 'bundle still points at Staging Supabase');
  must(js.includes(PROD) || js.includes('qasomfndnjuixgjmjwcm'), 'bundle missing Production Supabase ref');
  check('bundle-markers', true, { bundle });

  let deployTxt = null;
  try {
    const dt = await fetch(LIVE + '/PRODUCTION-DEPLOY.txt');
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 500) : null;
  } catch {
    deployTxt = null;
  }
  check('deploy-txt', Boolean(deployTxt && /alerts-search|alerts/.test(deployTxt)), { deployTxt });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const net400 = [];
  const cons = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|React DevTools/i.test(m.text())) cons.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.request().resourceType() === 'document') {
      net400.push({ s: r.status(), u: r.url() });
    }
  });

  for (const path of ['/', '/login', '/alerts', '/reports']) {
    const resp = await page.goto(`${LIVE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
    check(`nav${path}`, (resp?.status() || 0) < 400, {
      status: resp?.status(),
      url: page.url(),
    });
  }
  check('console-clean', cons.length === 0, { cons: cons.slice(0, 5) });
  check('no-doc-404', !net400.some((e) => e.s === 404), { net400: net400.slice(0, 5) });
  await browser.close();

  out.ok = out.checks.every((c) => c.ok);
  out.bundle = bundle;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        id: 'production-alerts-search-summary',
        at: out.at,
        ok: out.ok,
        host: LIVE,
        bundle,
        deploy_sha: deploySha || null,
        checks_passed: out.checks.filter((c) => c.ok).length,
        checks_total: out.checks.length,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(out.ok ? 'PRODUCTION VERIFY OK' : 'PRODUCTION VERIFY FAILED');
  process.exit(out.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  out.ok = false;
  out.checks.push({ id: 'fatal', ok: false, error: String(err) });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify({ id: 'production-alerts-search-summary', ok: false, error: String(err) }, null, 2) +
      '\n',
  );
  process.exit(1);
});
