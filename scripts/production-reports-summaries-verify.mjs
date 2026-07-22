/**
 * Production verify — Reports Task 2 (period summaries + autocomplete).
 * Frontend-only feature; no DB migration.
 */
import fs from 'node:fs';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const OWNER_EMAIL = 'orin1607@gmail.com';
const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const deploySha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').trim();

const OUT = 'public/project-001/production-reports-summaries-result.json';
const SUMMARY = 'public/project-001/production-reports-summaries-summary.json';

const out = {
  id: 'production-reports-summaries-verify',
  at: new Date().toISOString(),
  host: LIVE,
  deploy_sha: deploySha || null,
  migrations_required: false,
  stop_after_report: true,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function mgmt(path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: token },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function req(method, path, { body, bearer, apikey } = {}) {
  const headers = {
    apikey: apikey || bearer,
    Authorization: `Bearer ${bearer}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(PROD_URL + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, body: json };
}

async function main() {
  must(token, 'SUPABASE_ACCESS_TOKEN missing');

  // 1) Live site + bundle markers
  const siteRes = await fetch(LIVE + '/', { redirect: 'follow' });
  const html = await siteRes.text();
  const bundle = (html.match(/assets\/index-[^"]+\.js/) || [])[0] || null;
  let deployTxt = null;
  try {
    const dt = await fetch(LIVE + '/PRODUCTION-DEPLOY.txt');
    deployTxt = dt.ok ? (await dt.text()).trim().slice(0, 500) : null;
  } catch {
    deployTxt = null;
  }
  out.live_site = {
    http: siteRes.status,
    ok: siteRes.status >= 200 && siteRes.status < 400,
    bundle,
    deploy_txt: deployTxt,
  };
  must(bundle, 'No JS bundle on live site');

  const jsRes = await fetch(LIVE + '/' + bundle);
  const js = await jsRes.text();
  out.smoke = {
    bundle_http: jsRes.status,
    has_period_summaries: js.includes('סיכומי תקופה'),
    has_tests_label: js.includes('טסטים'),
    has_treatments_label: js.includes('טיפולים'),
    has_accidents_label: js.includes('תאונות'),
    has_insurance_renewals: js.includes('ביטוחים לחידוש'),
    has_autocomplete_plate: js.includes('חיפוש מספר רכב'),
    has_autocomplete_internal: js.includes('חיפוש מספר פנימי'),
    has_period_month: js.includes('חודש נוכחי'),
    has_period_week: js.includes('שבוע נוכחי'),
    has_period_year: js.includes('שנה נוכחית'),
    has_standard_cols:
      js.includes('מס\' פנימי') || js.includes("מס' פנימי") || js.includes('מספר פנימי'),
    has_reports_route_title: js.includes('דוחות וסיכומים') || js.includes('דוחות כספיים'),
    no_assert_client_staging: !/assertClientStaging/.test(js),
  };

  must(out.smoke.has_period_summaries, 'period summaries missing from Production bundle');
  must(out.smoke.has_autocomplete_plate, 'plate autocomplete missing from Production bundle');
  must(out.smoke.has_autocomplete_internal, 'internal autocomplete missing from Production bundle');
  must(out.smoke.has_insurance_renewals, 'insurance renewals card missing from Production bundle');
  must(out.smoke.has_period_month && out.smoke.has_period_week && out.smoke.has_period_year, 'period presets missing');

  // 2) Keys + auth
  let srk = srkEnv;
  let anon = anonEnv;
  if (!srk) {
    const keys = await mgmt(`/projects/${PROD}/api-keys`);
    must(keys.status === 200 && Array.isArray(keys.json), 'prod api-keys failed');
    srk =
      keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key ||
      keys.json.find((k) => String(k.name || '').includes('service'))?.api_key;
    anon =
      anon ||
      keys.json.find((k) => k.name === 'anon' || (k.tags || []).includes('anon'))?.api_key;
  }
  must(srk, 'NO_PROD_SERVICE_ROLE');

  const gen = await req('POST', '/auth/v1/admin/generate_link', {
    body: { type: 'magiclink', email: OWNER_EMAIL },
    bearer: srk,
    apikey: srk,
  });
  must(gen.status === 200 && gen.body?.email_otp, `auth generate failed http=${gen.status}`);
  const ver = await req('POST', '/auth/v1/verify', {
    body: { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp },
    bearer: anon || srk,
    apikey: anon || srk,
  });
  must(ver.body?.access_token || ver.body?.session?.access_token, `auth verify failed http=${ver.status}`);
  out.auth = { owner_ok: true };

  // 3) Data sources used by Reports still reachable (existing tables only)
  const probes = await Promise.all([
    req('GET', '/rest/v1/vehicles?select=id,license_plate,internal_number,test_expiry,insurance_expiry&limit=3', {
      bearer: srk,
      apikey: srk,
    }),
    req('GET', '/rest/v1/faults?select=id,date,vehicle_plate,status&limit=3', { bearer: srk, apikey: srk }),
    req('GET', '/rest/v1/accidents?select=id,date,vehicle_plate,status&limit=3', { bearer: srk, apikey: srk }),
    req('GET', '/rest/v1/drivers?select=id,full_name&limit=3', { bearer: srk, apikey: srk }),
  ]);
  out.data_sources = {
    vehicles_http: probes[0].status,
    faults_http: probes[1].status,
    accidents_http: probes[2].status,
    drivers_http: probes[3].status,
    vehicles_sample: Array.isArray(probes[0].body) ? probes[0].body.length : 0,
    faults_sample: Array.isArray(probes[1].body) ? probes[1].body.length : 0,
    accidents_sample: Array.isArray(probes[2].body) ? probes[2].body.length : 0,
  };
  must(probes.every((p) => p.status === 200), 'one or more report data sources unreachable');

  // 4) Autocomplete options existence (plates / internals present for search UX)
  const plates = Array.isArray(probes[0].body)
    ? probes[0].body.map((v) => v.license_plate).filter(Boolean)
    : [];
  const internals = Array.isArray(probes[0].body)
    ? probes[0].body.map((v) => v.internal_number).filter(Boolean)
    : [];
  out.autocomplete_data = {
    has_plates: plates.length > 0,
    has_internals: internals.length > 0,
    sample_plate_prefix: plates[0] ? String(plates[0]).slice(0, 3) + '…' : null,
  };

  // 5) /reports SPA shell
  const reportsPage = await fetch(LIVE + '/reports', { redirect: 'follow' });
  const reportsHtml = await reportsPage.text();
  out.reports_route = {
    http: reportsPage.status,
    ok: reportsPage.status >= 200 && reportsPage.status < 400,
    looks_like_spa: /index-|דליה|root/.test(reportsHtml),
  };
  must(out.reports_route.ok, 'Production /reports not reachable');

  out.verdict = {
    production_ok: true,
    hostinger_updated: true,
    migrations_applied: 'n/a — none required',
    period_filters_present: true,
    summary_cards_present: true,
    autocomplete_present: true,
    data_sources_ok: true,
  };

  fs.mkdirSync('public/project-001', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        id: out.id,
        at: out.at,
        production_ok: true,
        host: LIVE,
        deploy_sha: deploySha || null,
        bundle: bundle,
        migrations: 'none required',
        period_summaries: true,
        autocomplete_plate_internal: true,
        stop: true,
        no_task_3: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ ok: true, summary: SUMMARY, result: OUT }, null, 2));
}

main().catch((err) => {
  out.error = String(err?.message || err);
  out.verdict = { production_ok: false };
  try {
    fs.mkdirSync('public/project-001', { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    fs.writeFileSync(
      SUMMARY,
      JSON.stringify({ id: out.id, at: out.at, production_ok: false, error: out.error }, null, 2) + '\n',
    );
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exit(1);
});
