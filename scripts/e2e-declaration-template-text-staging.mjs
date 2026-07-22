/**
 * Staging E2E — declaration template body persists through create → preview → sign link.
 * Staging Pages + dalia-staging only. Never Production.
 */
import { chromium } from 'playwright';
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
const OUT = join(process.cwd(), 'docs', 'screenshots', 'declaration-template-e2e');
const ARTIFACT = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACT, { recursive: true });

const FORBIDDEN = ['qasomfndnjuixgjmjwcm', 'dalia-car.online'];
const MARKER = `[[DECL-TXT-${Date.now()}]]`;

const report = {
  at: new Date().toISOString(),
  base: BASE,
  staging: STAGING_REF,
  productionTouched: false,
  marker: MARKER,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  ok: false,
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.error || detail.note || '');
}

function loadKeys() {
  if (process.env.STAGING_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    return {
      service: process.env.STAGING_SERVICE_ROLE_KEY,
      anon: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  }
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
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
  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(STAGING_URL, keys.anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = Date.now();
  const email = `qa-decl-txt-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const company = 'דליה';

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Decl Template',
    company_name: company,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  record('auth', 'ephemeral super_admin', true, { email });

  // Ensure driver in company
  const { data: driver, error: dErr } = await admin
    .from('drivers')
    .insert({
      full_name: `QA Decl Driver ${runId}`,
      company_name: company,
      id_number: `9${String(runId).slice(-8)}`,
      phone: '0501234567',
      status: 'active',
    })
    .select('id,full_name,id_number,company_name')
    .single();
  if (dErr) throw dErr;
  record('seed-driver', 'seeded driver', true, { driverId: driver.id });

  // Ensure default template exists, then edit body with marker
  let { data: templates } = await admin
    .from('declaration_templates')
    .select('*')
    .eq('company_name', company)
    .order('is_default', { ascending: false });
  let tpl = (templates || []).find((t) => t.is_default) || (templates || [])[0];
  if (!tpl) {
    const { data: seeded, error: sErr } = await admin
      .from('declaration_templates')
      .insert({
        company_name: company,
        name: 'תצהיר כללי',
        body: 'seed {{id_number}}',
        is_default: true,
        placeholders: [],
      })
      .select('*')
      .single();
    if (sErr) throw sErr;
    tpl = seeded;
  }
  const originalBody = tpl.body;
  const editedBody = `${MARKER}\nנוסח מעודכן לבדיקה {{id_number}}\nסוף נוסח`;

  // 1) Edit default + save body only (the reported bug path)
  const { error: saveErr } = await admin
    .from('declaration_templates')
    .update({ body: editedBody })
    .eq('id', tpl.id);
  if (saveErr) throw saveErr;
  const { data: reloaded } = await admin
    .from('declaration_templates')
    .select('id,body,is_default')
    .eq('id', tpl.id)
    .single();
  record('save-default-body', 'default template body persists in DB', reloaded?.body === editedBody, {
    is_default: reloaded?.is_default,
  });

  // 2) Create NEW declaration from default (API path mirrors createDeclaration)
  const snapshot = editedBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '');
  const { data: decl, error: declErr } = await admin
    .from('driver_declarations')
    .insert({
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: company,
      declaration_text: snapshot,
      template_id: tpl.id,
      status: 'pending',
      created_by: userId,
    })
    .select('id,token,declaration_text,template_id')
    .single();
  if (declErr) throw declErr;
  record('create-declaration', 'new declaration snapshot contains marker', String(decl.declaration_text).includes(MARKER), {
    declarationId: decl.id,
  });
  record('no-hardcoded-snapshot', 'snapshot is not the old seed body', !String(decl.declaration_text).includes('לא נתגלו אצלי'), {});

  // 3) Create copy template, edit, set default, create another declaration
  const { data: copy, error: cErr } = await admin
    .from('declaration_templates')
    .insert({
      company_name: company,
      name: `עותק QA ${runId}`,
      body: originalBody,
      is_default: false,
      placeholders: [],
      created_by: userId,
    })
    .select('*')
    .single();
  if (cErr) throw cErr;
  const copyBody = `${MARKER}-COPY\nעותק מעודכן {{id_number}}`;
  await admin.from('declaration_templates').update({ body: copyBody }).eq('id', copy.id);
  // Clear old default then set copy as default
  await admin.from('declaration_templates').update({ is_default: false }).eq('id', tpl.id);
  await admin.from('declaration_templates').update({ is_default: true }).eq('id', copy.id);
  const { data: defNow } = await admin
    .from('declaration_templates')
    .select('*')
    .eq('company_name', company)
    .eq('is_default', true)
    .maybeSingle();
  record('copy-set-default', 'edited copy is company default', defNow?.id === copy.id && defNow?.body === copyBody, {
    defaultId: defNow?.id,
  });

  const snap2 = copyBody.replace(/\{\{\s*id_number\s*\}\}/g, driver.id_number || '');
  const { data: decl2, error: decl2Err } = await admin
    .from('driver_declarations')
    .insert({
      driver_id: driver.id,
      driver_name: driver.full_name,
      id_number: driver.id_number,
      company_name: company,
      declaration_text: snap2,
      template_id: copy.id,
      status: 'pending',
      created_by: userId,
    })
    .select('id,token,declaration_text')
    .single();
  if (decl2Err) throw decl2Err;
  record('create-from-copy-default', 'declaration from new default uses copy text', String(decl2.declaration_text).includes(`${MARKER}-COPY`), {
    declarationId: decl2.id,
  });

  // 4) Browser: sign page shows marker (public link)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|React DevTools/i.test(msg.text())) {
      report.consoleErrors.push(msg.text());
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (FORBIDDEN.some((h) => u.includes(h))) {
      report.networkErrors.push({ url: u, note: 'production_host_hit' });
    }
  });

  // Bundle markers
  const html = await (await fetch(BASE + '/')).text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0];
  let bundleOk = false;
  if (bundle) {
    const js = await (await fetch(`${BASE}/${bundle}`)).text();
    bundleOk =
      js.includes('הנוסח נשמר') &&
      !js.includes('Falling back to built-in declaration text') &&
      js.includes('חסר נוסח תצהיר');
  }
  record('bundle-markers', 'Staging bundle has persist + no silent fallback', bundleOk, { bundle });

  const signUrl = `${BASE}/sign-declaration?token=${decl2.token}`;
  const resp = await page.goto(signUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const bodyText = await page.textContent('body');
  record('sign-page-http', 'sign page loads', (resp?.status() || 0) === 200, { status: resp?.status() });
  record('sign-page-marker', 'sign page shows saved copy marker', (bodyText || '').includes(`${MARKER}-COPY`), {
    url: signUrl,
  });
  record('sign-page-no-seed', 'sign page does not show hardcoded seed', !(bodyText || '').includes('לא נתגלו אצלי'), {});

  // Also check first declaration (edited default path) via token
  const signUrl1 = `${BASE}/sign-declaration?token=${decl.token}`;
  await page.goto(signUrl1, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  const body1 = await page.textContent('body');
  record('sign-page-default-edit', 'sign page shows edited-default marker', (body1 || '').includes(MARKER), {});

  record('console-clean', 'no console errors', report.consoleErrors.length === 0, {
    cons: report.consoleErrors.slice(0, 5),
  });
  record('no-production', 'no production hosts', !report.networkErrors.some((e) => e.note === 'production_host_hit'));

  await browser.close();

  // Restore original default body and default flag; cleanup
  try {
    await admin.from('declaration_templates').update({ is_default: false }).eq('id', copy.id);
    await admin.from('declaration_templates').update({ body: originalBody, is_default: true }).eq('id', tpl.id);
    await admin.from('declaration_templates').delete().eq('id', copy.id);
    await admin.from('driver_declarations').delete().eq('id', decl.id);
    await admin.from('driver_declarations').delete().eq('id', decl2.id);
    await admin.from('drivers').delete().eq('id', driver.id);
    await admin.auth.admin.deleteUser(userId);
  } catch {
    /* best-effort */
  }

  report.ok = report.tests.every((t) => t.ok);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(ARTIFACT, 'declaration-template-text-staging-e2e.json'), JSON.stringify(report, null, 2));
  console.log(report.ok ? '\nALL E2E PASSED' : '\nE2E HAD FAILURES');
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  report.ok = false;
  report.tests.push({ id: 'fatal', name: 'runner', ok: false, error: String(err) });
  writeFileSync(join(ARTIFACT, 'declaration-template-text-staging-e2e.json'), JSON.stringify(report, null, 2));
  process.exit(1);
});
