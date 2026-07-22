/**
 * Production diagnose — declaration template vs pending snapshot for real drivers.
 * Finds where old text still wins (pending block / stale snapshot / wrong company).
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const PROD = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD}.supabase.co`;
const LIVE = 'https://dalia-car.online';
const PHONE = '0534338601';
const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const srkEnv = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const anonEnv = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

const OUT = 'public/project-001/production-declaration-stale-diagnose.json';

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function mgmt(path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: token },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function req(method, path, { body, bearer, prefer } = {}) {
  const headers = {
    apikey: bearer,
    Authorization: `Bearer ${bearer}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
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
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: json };
}

function loadKeys() {
  if (srkEnv) return { service: srkEnv, anon: anonEnv };
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

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return `972${d.slice(1)}`;
  return d;
}

async function main() {
  const keys = loadKeys();
  must(keys.service, 'no service role');
  const srk = keys.service;

  const out = {
    at: new Date().toISOString(),
    host: LIVE,
    phone: PHONE,
    findings: {},
  };

  // Find drivers matching phone / names
  const drivers = await req(
    'GET',
    `/rest/v1/drivers?select=id,full_name,phone,company_name,id_number,status&or=(phone.ilike.*${PHONE.slice(-9)}*,full_name.ilike.*אטיאס*,full_name.ilike.*אילנה*,full_name.ilike.*יוני*)&limit=50`,
    { bearer: srk },
  );
  out.drivers_raw_count = Array.isArray(drivers.body) ? drivers.body.length : 0;
  const targetPhone = normPhone(PHONE);
  const matched = (drivers.body || []).filter((d) => {
    const p = normPhone(d.phone);
    return p === targetPhone || p.endsWith(PHONE.slice(-9));
  });
  out.matched_by_phone = matched.map((d) => ({
    id: d.id,
    full_name: d.full_name,
    phone: d.phone,
    company_name: d.company_name,
    status: d.status,
  }));

  // Also search all active with phone ending
  const byPhone = await req(
    'GET',
    `/rest/v1/drivers?select=id,full_name,phone,company_name,id_number,status&phone=like.*534338601*&limit=20`,
    { bearer: srk },
  );
  out.matched_phone_query = byPhone.body;

  const focus =
    (Array.isArray(byPhone.body) && byPhone.body[0]) ||
    matched[0] ||
    (Array.isArray(drivers.body) && drivers.body[0]) ||
    null;
  out.focus_driver = focus
    ? {
        id: focus.id,
        full_name: focus.full_name,
        phone: focus.phone,
        company_name: focus.company_name,
      }
    : null;
  must(focus, 'no focus driver found');

  const company = String(focus.company_name || '').trim();
  out.company = company;

  const templates = await req(
    'GET',
    `/rest/v1/declaration_templates?company_name=eq.${encodeURIComponent(company)}&select=id,name,body,is_default,updated_at&order=is_default.desc&order=updated_at.desc`,
    { bearer: srk },
  );
  out.templates = (templates.body || []).map((t) => ({
    id: t.id,
    name: t.name,
    is_default: t.is_default,
    updated_at: t.updated_at,
    body_len: String(t.body || '').length,
    body_preview: String(t.body || '').slice(0, 120),
    has_seed_phrase: String(t.body || '').includes('לא נתגלו אצלי'),
  }));
  const def = (templates.body || []).find((t) => t.is_default) || (templates.body || [])[0];
  out.default_template = def
    ? {
        id: def.id,
        name: def.name,
        body_preview: String(def.body || '').slice(0, 160),
        has_seed_phrase: String(def.body || '').includes('לא נתגלו אצלי'),
        updated_at: def.updated_at,
      }
    : null;

  const decls = await req(
    'GET',
    `/rest/v1/driver_declarations?driver_id=eq.${focus.id}&select=id,status,declaration_text,template_id,created_at,sent_at,token&order=created_at.desc&limit=10`,
    { bearer: srk },
  );
  out.declarations = (decls.body || []).map((d) => ({
    id: d.id,
    status: d.status,
    template_id: d.template_id,
    created_at: d.created_at,
    sent_at: d.sent_at,
    token_tail: d.token ? String(d.token).slice(-8) : null,
    text_preview: String(d.declaration_text || '').slice(0, 160),
    has_seed_phrase: String(d.declaration_text || '').includes('לא נתגלו אצלי'),
    matches_default_body:
      def && String(d.declaration_text || '').includes(String(def.body || '').slice(0, 40).replace(/\{\{.*?\}\}/g, '')),
    text_equals_default_raw: def && String(d.declaration_text || '') === String(def.body || ''),
    stale_vs_default:
      !!def &&
      !!d.declaration_text &&
      !String(d.declaration_text).includes(String(def.body || '').slice(0, 30)) &&
      String(def.body || '').includes('לא נתגלו אצלי') === false,
  }));

  const pending = (decls.body || []).filter((d) => d.status === 'pending');
  out.pending_count = pending.length;
  out.root_cause_hypothesis = [];
  if (pending.length > 0) {
    out.root_cause_hypothesis.push(
      'UI disables "תצהיר חדש" while latest status=pending — user re-sends old immutable snapshot',
    );
    const p = pending[0];
    if (def && String(p.declaration_text || '').trim() !== String(def.body || '').trim()) {
      const seedInPending = String(p.declaration_text || '').includes('לא נתגלו אצלי');
      const seedInDefault = String(def.body || '').includes('לא נתגלו אצלי');
      if (seedInPending && !seedInDefault) {
        out.root_cause_hypothesis.push(
          'Pending declaration still has seed/old text while default template body was edited',
        );
      } else {
        out.root_cause_hypothesis.push(
          'Pending declaration_text snapshot differs from current default template.body',
        );
      }
    }
  }

  // Live sign page check for latest pending
  if (pending[0]?.token) {
    const signUrl = `${LIVE}/sign-declaration?token=${pending[0].token}`;
    const html = await (await fetch(signUrl)).text();
    out.live_sign = {
      url: signUrl,
      has_seed: html.includes('לא נתגלו אצלי'),
      has_default_snippet: def
        ? html.includes(String(def.body || '').slice(0, 25).replace(/\n/g, ''))
        : null,
    };
  }

  // Bundle check: create button still disables on pending?
  const site = await fetch(LIVE + '/');
  const index = await site.text();
  const bundle = (index.match(/assets\/index-[^"]+\.js/) || [])[0];
  const js = await (await fetch(`${LIVE}/${bundle}`)).text();
  out.bundle = {
    file: bundle,
    // Heuristic strings from current source
    has_pending_disable_signal: js.includes('pending') && js.includes('תצהיר חדש'),
    has_no_hardcoded_display: js.includes('חסר נוסח תצהיר'),
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(OUT, JSON.stringify({ ok: false, error: String(e) }, null, 2) + '\n');
  process.exit(1);
});
