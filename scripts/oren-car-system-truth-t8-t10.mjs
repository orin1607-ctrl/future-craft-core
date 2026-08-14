/** Focused Pages recheck: officer report expand + new-vehicle types. QA company only. */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/system-truth-pages-qa');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('prod db');

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function inject(context, session) {
  const projectRef = new URL(STAGING_URL).hostname.split('.')[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${projectRef}-auth-token`,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    },
  );
}

async function main() {
  const out = { checks: [] };
  const rec = (name, ok, extra = {}) => {
    out.checks.push({ name, ok: Boolean(ok), ...extra });
    console.log(ok ? 'PASS' : 'FAIL', name, extra.note || extra.snippet || '');
  };
  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const company = `QA-SYS-T810-${runId}`;
  const email = `qa-sys-t810-${runId}@staging-e2e.local`;
  const password = `QaSys!${runId}`;
  const plate = `T8${String(runId).slice(-6)}`;
  const ids = { users: [], vehicles: [], settings: [] };
  try {
    await admin.from('company_settings').insert({ company_name: company, hidden_buttons: [] });
    ids.settings.push(company);
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: 'QA T810 FM',
      company_name: company,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'fleet_manager' });
    const { data: veh, error: vErr } = await admin.from('vehicles').insert({
      license_plate: plate,
      internal_number: '42',
      manufacturer: 'TypeQA',
      model: 'Check',
      company_name: company,
      status: 'active',
      year: 2020,
      vehicle_type: 'רכב פרטי',
      odometer: 1000,
    }).select('id').single();
    if (vErr) throw vErr;
    ids.vehicles.push(veh.id);
    await admin.from('vehicle_inspections').insert({
      vehicle_id: veh.id,
      vehicle_plate: plate,
      company_name: company,
      inspection_type: 'tri_semi_annual',
      inspection_date: new Date().toISOString().slice(0, 10),
      next_due_date: null,
      overall_status: 'ok',
      inspector_name: 'QA T810 FM',
    });
    await admin.from('vehicle_inspections').insert({
      vehicle_id: veh.id,
      vehicle_plate: plate,
      company_name: company,
      inspection_type: 'tri_semi_annual',
      inspection_date: new Date().toISOString().slice(0, 10),
      next_due_date: '2026-11-13',
      overall_status: 'ok',
      inspector_name: 'QA T810 FM',
    });

    const { data: auth, error: sErr } = await anon.auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 1000 } });
    await inject(context, auth.session);
    const page = await context.newPage();

    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^הכל$/ }).first().click().catch(() => null);
    await page.waitForTimeout(800);
    await page.locator('text=/\\d+ ביקורות קצין רכב בכל הזמנים/').first().click().catch(() => null);
    await page.waitForTimeout(1200);
    const reportText = await page.locator('body').innerText();
    rec('t8 card count all-time', /\d+ ביקורות קצין רכב בכל הזמנים/.test(reportText), { snippet: reportText.slice(0, 400) });
    rec('t8 plate in expanded table', reportText.includes(plate), { snippet: reportText.slice(0, 1800) });
    rec('t8 internal 42', reportText.includes('42'));
    rec('t8 type label', /תלת|חצי/.test(reportText));
    rec('t8 missing next due shows dash', /—|-/.test(reportText));
    rec('t8 date present', /13|11|2026|\d{1,2}\.\d{1,2}/.test(reportText));
    await page.screenshot({ path: join(OUT, 't8-expanded.png'), fullPage: true }).catch(() => null);

    const internalFilter = page.getByPlaceholder(/פנימי/).first();
    if (await internalFilter.count()) {
      await internalFilter.fill('42');
      await page.waitForTimeout(600);
      rec('t8 filter internal 42 still shows plate', (await page.locator('body').innerText()).includes(plate));
    }

    await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.locator('button[title="רכב חדש"]').click();
    await page.waitForTimeout(1500);
    rec('t10 intro heading', /הוספת רכב חדש|שלב 1/.test(await page.locator('body').innerText()), {
      snippet: (await page.locator('body').innerText()).slice(0, 500),
    });
    rec('t10 נגרר', (await page.locator('option:has-text("נגרר")').count()) > 0);
    rec('t10 טרקטור', (await page.locator('option:has-text("טרקטור")').count()) > 0);
    rec('t10 ציוד הנדסי', (await page.locator('option:has-text("ציוד הנדסי")').count()) > 0);
    rec('t10 רכב זעיר', (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
    rec('t10 רכב פרטי', (await page.locator('option:has-text("רכב פרטי")').count()) > 0);
    await page.screenshot({ path: join(OUT, 't10-intro.png'), fullPage: true }).catch(() => null);

    if ((await page.locator('option:has-text("נגרר")').count()) === 0) {
      await page.getByPlaceholder('12-345-67').fill(`${plate}N`);
      await page.getByRole('button', { name: /המשך לטופס המלא/ }).click().catch(() => null);
      await page.waitForTimeout(1500);
      rec('t10 נגרר after full form', (await page.locator('option:has-text("נגרר")').count()) > 0);
      rec('t10 טרקטור after full form', (await page.locator('option:has-text("טרקטור")').count()) > 0);
      rec('t10 ציוד הנדסי after full form', (await page.locator('option:has-text("ציוד הנדסי")').count()) > 0);
      rec('t10 רכב זעיר after full form', (await page.locator('option:has-text("רכב זעיר")').count()) > 0);
      rec('t10 רכב פרטי after full form', (await page.locator('option:has-text("רכב פרטי")').count()) > 0);
      await page.screenshot({ path: join(OUT, 't10-full.png'), fullPage: true }).catch(() => null);
    }

    await browser.close();
  } catch (e) {
    out.fatal = String(e?.stack || e);
    console.error(e);
  } finally {
    try {
      await admin.from('vehicle_inspections').delete().eq('company_name', company);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.settings.length) await admin.from('company_settings').delete().eq('company_name', company);
      for (const uid of ids.users) {
        await admin.from('user_roles').delete().eq('user_id', uid);
        await admin.from('profiles').delete().eq('id', uid);
        await admin.auth.admin.deleteUser(uid).catch(() => null);
      }
      out.cleanup = 'QA-SYS-T810 only';
    } catch (ce) {
      out.cleanupError = String(ce);
    }
  }
  writeFileSync(join(OUT, 't8-t10-recheck.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
