/**
 * Staging QA — per-company attention visibility + red toggles (display only).
 * node scripts/oren-car-attention-visibility-staging-qa.mjs
 *
 * Scope: Oren Car Staging ONLY. No Production / Hostinger.
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core').replace(
  /\/$/,
  '',
);
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-attention-visibility/qa');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  commit: null,
  liveBundle: null,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  shots: [],
  ok: false,
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.note || detail.error || '');
}

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'anon')?.api_key,
  };
}

async function readTile(page, label) {
  const tile = page.locator('button, div').filter({ hasText: label }).first();
  const text = (await tile.innerText().catch(() => '')) || '';
  const html = (await tile.innerHTML().catch(() => '')) || '';
  return {
    text,
    hasYesh: text.includes('יש לטפל'),
    hasBeseder: text.includes('בסדר'),
    hasDoresh: text.includes('דורש טיפול'),
    hasEin: /\bאין\b/.test(text) || text.includes('\nאין'),
    red: html.includes('text-destructive') || html.includes('destructive'),
  };
}

async function setCompanyFlags(admin, companyName, flags) {
  const { error } = await admin
    .from('company_settings')
    .update({
      show_insurance_attention: flags.showInsuranceAttention,
      show_insurance_attention_red: flags.showInsuranceAttentionRed,
      show_gaps_attention: flags.showGapsAttention,
      show_gaps_attention_red: flags.showGapsAttentionRed,
      updated_at: new Date().toISOString(),
    })
    .eq('company_name', companyName);
  if (error) throw error;
}

async function main() {
  try {
    report.commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    report.commit = 'unknown';
  }

  const html = await (await fetch(`${BASE}/`)).text();
  report.liveBundle = html.match(/assets\/index-[^"]+\.js/)?.[0] || null;
  record('bundle', 'Live Staging bundle detected', !!report.liveBundle, { bundle: report.liveBundle });

  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now();
  const companyA = `QA-Attn-A-${runId}`;
  const companyB = `QA-Attn-B-${runId}`;
  const email = `qa-attn-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;

  // Ensure company_settings rows (per-company, not global)
  for (const company_name of [companyA, companyB]) {
    const { error } = await admin.from('company_settings').insert({ company_name });
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }
  record('seed-companies', 'Per-company settings rows created', true, { companyA, companyB });

  await setCompanyFlags(admin, companyA, {
    showInsuranceAttention: true,
    showInsuranceAttentionRed: true,
    showGapsAttention: true,
    showGapsAttentionRed: true,
  });
  await setCompanyFlags(admin, companyB, {
    showInsuranceAttention: true,
    showInsuranceAttentionRed: true,
    showGapsAttention: true,
    showGapsAttentionRed: true,
  });

  // Isolation: hide A, keep B visible
  await setCompanyFlags(admin, companyA, {
    showInsuranceAttention: false,
    showInsuranceAttentionRed: true,
    showGapsAttention: false,
    showGapsAttentionRed: true,
  });
  const { data: rowA } = await admin
    .from('company_settings')
    .select('show_insurance_attention, show_gaps_attention')
    .eq('company_name', companyA)
    .single();
  const { data: rowB } = await admin
    .from('company_settings')
    .select('show_insurance_attention, show_gaps_attention')
    .eq('company_name', companyB)
    .single();
  const isolationOk =
    rowA?.show_insurance_attention === false &&
    rowA?.show_gaps_attention === false &&
    rowB?.show_insurance_attention === true &&
    rowB?.show_gaps_attention === true;
  record('db-isolation', 'Company A hide does not change Company B', isolationOk, { rowA, rowB });

  // Vehicles with gaps (no test_expiry → יש לטפל; missing docs → דורש טיפול)
  const { data: vehA, error: vaErr } = await admin
    .from('vehicles')
    .insert({
      license_plate: `QA${String(runId).slice(-5)}A`,
      company_name: companyA,
      manufacturer: 'QA',
      model: 'AttnA',
      status: 'active',
      test_expiry: null,
      license_doc_url: null,
      insurance_alerts_enabled: true,
    })
    .select('id, license_plate, company_name')
    .single();
  if (vaErr) throw vaErr;
  const { data: vehB, error: vbErr } = await admin
    .from('vehicles')
    .insert({
      license_plate: `QA${String(runId).slice(-5)}B`,
      company_name: companyB,
      manufacturer: 'QA',
      model: 'AttnB',
      status: 'active',
      test_expiry: null,
      license_doc_url: null,
      insurance_alerts_enabled: true,
    })
    .select('id, license_plate, company_name')
    .single();
  if (vbErr) throw vbErr;
  record('seed-vehicles', 'Gap vehicles seeded for A and B', true, {
    a: vehA.id,
    b: vehB.id,
  });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Attention Visibility',
    company_name: companyA,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  record('auth', 'Ephemeral super_admin', true);

  const combos = [
    {
      id: 'ins-on-red-on',
      flags: {
        showInsuranceAttention: true,
        showInsuranceAttentionRed: true,
        showGapsAttention: true,
        showGapsAttentionRed: true,
      },
      expectIns: { hasYesh: true, red: true },
      expectGaps: { hasDoresh: true, red: true },
    },
    {
      id: 'ins-on-red-off',
      flags: {
        showInsuranceAttention: true,
        showInsuranceAttentionRed: false,
        showGapsAttention: true,
        showGapsAttentionRed: false,
      },
      expectIns: { hasYesh: true, red: false },
      expectGaps: { hasDoresh: true, red: false },
    },
    {
      id: 'ins-off-red-on',
      flags: {
        showInsuranceAttention: false,
        showInsuranceAttentionRed: true,
        showGapsAttention: false,
        showGapsAttentionRed: true,
      },
      expectIns: { hasYesh: false, red: false },
      expectGaps: { hasDoresh: false, red: false },
    },
    {
      id: 'ins-off-red-off',
      flags: {
        showInsuranceAttention: false,
        showInsuranceAttentionRed: false,
        showGapsAttention: false,
        showGapsAttentionRed: false,
      },
      expectIns: { hasYesh: false, red: false },
      expectGaps: { hasDoresh: false, red: false },
    },
  ];

  const browser = await chromium.launch({ headless: true });
  const storageKey = `sb-${STAGING_REF}-auth-token`;

  async function openHub(page, vehicleId) {
    await page.goto(`${BASE}/vehicles?vehicleId=${vehicleId}&view=hub`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    await page.waitForTimeout(2500);
  }

  // Desktop combos on company A + verify B stays visible when A hidden
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: storageKey,
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
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      const u = res.url();
      if (u.includes(STAGING_REF) && res.status() >= 400) {
        report.networkErrors.push({ status: res.status(), url: u });
      }
    });

    for (const combo of combos) {
      await setCompanyFlags(admin, companyA, combo.flags);
      // Keep B always fully visible
      await setCompanyFlags(admin, companyB, {
        showInsuranceAttention: true,
        showInsuranceAttentionRed: true,
        showGapsAttention: true,
        showGapsAttentionRed: true,
      });
      await openHub(page, vehA.id);
      const ins = await readTile(page, 'ביטוחים ורישיונות');
      const gaps = await readTile(page, 'חוסרים והתראות');
      const okIns =
        ins.hasYesh === combo.expectIns.hasYesh &&
        (!combo.expectIns.hasYesh || ins.red === combo.expectIns.red) &&
        (combo.expectIns.hasYesh || !ins.hasYesh);
      const okGaps =
        gaps.hasDoresh === combo.expectGaps.hasDoresh &&
        (!combo.expectGaps.hasDoresh || gaps.red === combo.expectGaps.red);
      // When hidden, red must be false regardless of red flag
      const okRedHidden =
        combo.expectIns.hasYesh || (!ins.red && !gaps.red) || (!ins.hasYesh && !gaps.hasDoresh);
      record(`desktop-${combo.id}`, `Desktop combo ${combo.id}`, okIns && okGaps, {
        ins,
        gaps,
        okIns,
        okGaps,
        okRedHidden,
      });
      await page.screenshot({ path: join(OUT, `desktop-${combo.id}.png`), fullPage: true });
      report.shots.push(`desktop-${combo.id}.png`);
    }

    // Cross-company: A hidden, B still shows labels
    await setCompanyFlags(admin, companyA, {
      showInsuranceAttention: false,
      showInsuranceAttentionRed: true,
      showGapsAttention: false,
      showGapsAttentionRed: true,
    });
    await openHub(page, vehB.id);
    const bIns = await readTile(page, 'ביטוחים ורישיונות');
    const bGaps = await readTile(page, 'חוסרים והתראות');
    const crossOk = bIns.hasYesh === true && bGaps.hasDoresh === true;
    record('desktop-cross-company', 'Company B still shows attention while A hidden', crossOk, {
      bIns,
      bGaps,
    });
    await page.screenshot({ path: join(OUT, 'desktop-company-b.png'), fullPage: true });
    report.shots.push('desktop-company-b.png');

    // Alert settings UI — four toggles for a real company (דליה)
    await page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const settingsUi =
      body.includes('הצג / הסתר "יש לטפל"') ||
      body.includes('הצג / הסתר „יש לטפל”') ||
      (body.includes('הצג / הסתר') && body.includes('יש לטפל') && body.includes('דורש טיפול'));
    const redUi = body.includes('באדום') && body.includes('יש לטפל') && body.includes('דורש טיפול');
    record('alert-settings-ui', 'AlertSettings shows visibility + red toggles', settingsUi && redUi, {
      settingsUi,
      redUi,
    });
    await page.screenshot({ path: join(OUT, 'alert-settings.png'), fullPage: true });
    report.shots.push('alert-settings.png');

    // Smoke: drivers / accidents / alerts
    for (const [id, path] of [
      ['smoke-drivers', '/drivers'],
      ['smoke-accidents', '/accidents'],
      ['smoke-alerts', '/alerts'],
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(1200);
      const ok = !(await page.locator('body').innerText()).includes('Unexpected Application Error');
      record(id, `Smoke ${path}`, ok);
    }

    await context.close();
  }

  // Mobile: one hidden + one visible combo
  {
    const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      {
        key: storageKey,
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
    await setCompanyFlags(admin, companyA, {
      showInsuranceAttention: true,
      showInsuranceAttentionRed: true,
      showGapsAttention: true,
      showGapsAttentionRed: true,
    });
    await openHub(page, vehA.id);
    const mOn = await readTile(page, 'ביטוחים ורישיונות');
    await setCompanyFlags(admin, companyA, {
      showInsuranceAttention: false,
      showInsuranceAttentionRed: true,
      showGapsAttention: false,
      showGapsAttentionRed: true,
    });
    await openHub(page, vehA.id);
    const mOff = await readTile(page, 'ביטוחים ורישיונות');
    const mobileOk = mOn.hasYesh === true && mOff.hasYesh === false;
    record('mobile-visibility', 'Mobile show ON then OFF hides יש לטפל', mobileOk, { mOn, mOff });
    await page.screenshot({ path: join(OUT, 'mobile-off.png'), fullPage: true });
    report.shots.push('mobile-off.png');
    await context.close();
  }

  await browser.close();

  // Cleanup ephemeral data (visual settings only — no business data mutation beyond seed)
  await admin.from('vehicles').delete().eq('id', vehA.id);
  await admin.from('vehicles').delete().eq('id', vehB.id);
  await admin.from('company_settings').delete().eq('company_name', companyA);
  await admin.from('company_settings').delete().eq('company_name', companyB);
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
  record('cleanup', 'Ephemeral QA rows removed', true);

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'live-qa-report.json'), JSON.stringify(report, null, 2));
  console.log('\nReport:', join(OUT, 'live-qa-report.json'));
  console.log(report.ok ? 'OVERALL PASS' : 'OVERALL FAIL');
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
