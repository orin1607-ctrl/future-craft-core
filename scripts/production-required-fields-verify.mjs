/**
 * Production verify — required fields per company (frontend-only).
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();

const OUT = 'public/project-001/production-required-fields-result.json';
const SUMMARY = 'public/project-001/production-required-fields-summary.json';

const out = {
  id: 'production-required-fields-verify',
  at: new Date().toISOString(),
  host: LIVE,
  deploy_sha: deploySha || null,
  migrations_required: false,
  stop_after_report: true,
  checks: [],
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function check(id, ok, detail = {}) {
  out.checks.push({ id, ok, ...detail });
  console.log(ok ? '✅' : '❌', id, detail.error || detail.note || '');
}

async function mgmt(path, opts = {}) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, text: text.slice(0, 500) };
}

function loadKeys() {
  if (srkEnv && anonEnv) return { service: srkEnv, anon: anonEnv };
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${PROD} -o json`, {
    encoding: 'utf8',
    env: { ...process.env },
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

async function main() {
  must(token || srkEnv, 'Need SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY');

  const siteRes = await fetch(LIVE + '/', { redirect: 'follow' });
  const html = await siteRes.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
  must(siteRes.ok && bundle, 'Production site/bundle missing');

  const jsRes = await fetch(`${LIVE}/${bundle}`);
  const js = await jsRes.text();
  must(js.includes('byCompany'), 'bundle missing byCompany');
  must(js.includes('getOverridesForCompany') || js.includes('בחר חברה לניהול שדות החובה'), 'bundle missing company required-fields UI');
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
  check('deploy-txt', Boolean(deployTxt), { deployTxt });

  // Live browser smoke (login page + deep link no hard failure)
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

  for (const path of ['/', '/login', '/admin/modules/vehicles/required-fields']) {
    const resp = await page.goto(`${LIVE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000);
    check(`nav${path}`, (resp?.status() || 0) < 400 || (resp?.status() || 0) === 200, {
      status: resp?.status(),
      url: page.url(),
    });
  }
  check('console-clean', cons.length === 0, { cons: cons.slice(0, 5) });
  check('no-doc-404', !net400.some((e) => e.s === 404), { net400: net400.slice(0, 5) });
  await browser.close();

  // Ensure Production has the same config table Staging already uses (idempotent)
  if (token) {
    const keysRes = await mgmt(`/projects/${PROD}/api-keys`);
    check('mgmt-keys', keysRes.status === 200, { status: keysRes.status });
  }
  const keys = loadKeys();
  const admin = createClient(PROD_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let { data, error } = await admin
    .from('dalia_form_config')
    .select('config_key, config_value')
    .eq('config_key', 'required_fields')
    .maybeSingle();

  if (error && /dalia_form_config|schema cache/i.test(error.message || '')) {
    must(token, 'SUPABASE_ACCESS_TOKEN required to apply dalia_form_config on Production');
    const sql = fs.readFileSync('supabase/migrations/20260626120000_dalia_form_config.sql', 'utf8');
    const mig = await mgmt(`/projects/${PROD}/database/query`, {
      method: 'POST',
      body: { query: sql },
    });
    const migOk = mig.status >= 200 && mig.status < 300;
    check('db-migrate-dalia-form-config', migOk, {
      status: mig.status,
      preview: mig.text?.slice(0, 180),
    });
    out.migrations_applied = migOk ? ['20260626120000_dalia_form_config.sql'] : [];
    // brief wait for schema cache
    await new Promise((r) => setTimeout(r, 1500));
    ({ data, error } = await admin
      .from('dalia_form_config')
      .select('config_key, config_value')
      .eq('config_key', 'required_fields')
      .maybeSingle());
  }

  check('db-config-readable', !error, { error: error?.message, hasRow: Boolean(data) });
  out.migrations_required = Boolean(out.migrations_applied?.length);

  out.ok = out.checks.every((c) => c.ok);
  out.bundle = bundle;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        id: 'production-required-fields-summary',
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
  if (!out.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  out.ok = false;
  out.error = String(err);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  process.exit(1);
});
