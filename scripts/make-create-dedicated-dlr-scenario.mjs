/**
 * Create dedicated Make scenario: Custom Webhook → HTTP forward to Staging gupshup-webhook.
 * Does NOT change Gupshup portal. Owner must point Delivery URL (or confirm match).
 * Never prints MAKE_API_TOKEN. Production untouched.
 */
import fs from 'node:fs';

const token = (process.env.MAKE_API_TOKEN || '').trim();
const zoneRaw = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '');
const zone = zoneRaw || 'eu1';
const STAGING = 'usfeoerkpcafxxlyuldl';
const SUPABASE_HOOK = `https://${STAGING}.supabase.co/functions/v1/gupshup-webhook`;
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const SCENARIO_NAME = 'CO.CO Dalia DLR → Staging';

const out = {
  env: 'staging',
  production_touched: false,
  gupshup_portal_untouched: true,
  make_zone: zone,
  supabase_hook: SUPABASE_HOOK,
  scenario_name: SCENARIO_NAME,
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function make(path, opts = {}) {
  const res = await fetch(`${MAKE_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, json, text: text.slice(0, 1200) };
}

function redactUrl(u) {
  if (!u || typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    const last = url.pathname.split('/').filter(Boolean).pop() || '';
    return `${url.host}/…${last.slice(-8)}`;
  } catch {
    return String(u).slice(0, 20) + '…';
  }
}

async function main() {
  must(token, 'MAKE_API_TOKEN missing');

  const me = await make('/users/me');
  must(me.status === 200, `Make auth failed HTTP ${me.status}`);

  const orgs = await make('/organizations');
  const orgList = orgs.json?.organizations || [];
  must(orgList.length, 'No organizations');
  const orgId = orgList[0].id;
  const teams = await make(`/teams?organizationId=${orgId}`);
  const teamList = teams.json?.teams || [];
  must(teamList.length, 'No teams');
  const teamId = teamList[0].id;
  out.teamId = teamId;

  // Reuse existing dedicated scenario if present
  let existing = null;
  let offset = 0;
  for (let p = 0; p < 10; p++) {
    const r = await make(`/scenarios?teamId=${teamId}&pg[offset]=${offset}&pg[limit]=50`);
    const list = r.json?.scenarios || [];
    existing = list.find((s) => s.name === SCENARIO_NAME) || null;
    if (existing || list.length < 50) break;
    offset += 50;
  }

  let scenarioId = existing?.id || null;
  let hookId = existing?.hookId || null;

  if (!scenarioId) {
    // Create hook first
    const hookBody = {
      teamId,
      name: 'coco-dalia-dlr-staging',
      typeName: 'gateway-webhook',
      // JSON pass-through / flexible
    };
    const hr = await make('/hooks', { method: 'POST', body: hookBody });
    out.hook_create = { http: hr.status, error: hr.status >= 300 ? hr.text.slice(0, 300) : null };
    must(hr.status >= 200 && hr.status < 300, `Create hook failed HTTP ${hr.status}: ${hr.text.slice(0, 300)}`);
    hookId = hr.json?.hook?.id || hr.json?.id;
    must(hookId, 'No hook id returned');

    const blueprint = {
      name: SCENARIO_NAME,
      flow: [
        {
          id: 1,
          module: 'gateway:CustomWebHook',
          version: 1,
          parameters: {
            hook: hookId,
            maxResults: 1,
          },
          mapper: {},
          metadata: {
            designer: { x: 0, y: 0, name: 'Gupshup DLR in' },
          },
        },
        {
          id: 2,
          module: 'http:ActionSendData',
          version: 3,
          parameters: {
            handleErrors: false,
            useNewZLibDeCompress: true,
          },
          mapper: {
            url: SUPABASE_HOOK,
            serializeUrl: false,
            method: 'post',
            headers: [{ name: 'Content-Type', value: 'application/json' }],
            qs: [],
            bodyType: 'raw',
            parseResponse: true,
            authUser: '',
            authPass: '',
            timeout: '',
            shareCookies: false,
            ca: '',
            rejectUnauthorized: true,
            followRedirect: true,
            useQuerystring: false,
            gzip: true,
            useMtls: false,
            contentType: 'application/json',
            data: '{{toJSON(1)}}',
            inputRaw: '{{toJSON(1)}}',
            followAllRedirects: false,
          },
          metadata: {
            designer: { x: 300, y: 0, name: 'Forward to Supabase Staging' },
          },
        },
      ],
      metadata: {
        instant: true,
        version: 1,
        scenario: {
          roundtrips: 1,
          maxErrors: 3,
          autoCommit: true,
          autoCommitTriggerLast: true,
          sequential: false,
          confidential: false,
          dataloss: false,
          dlq: false,
        },
      },
    };

    const scheduling = { type: 'immediately' };
    const cr = await make('/scenarios?confirmed=true', {
      method: 'POST',
      body: {
        teamId,
        naming: SCENARIO_NAME,
        name: SCENARIO_NAME,
        blueprint: JSON.stringify(blueprint),
        scheduling: JSON.stringify(scheduling),
      },
    });
    out.scenario_create = { http: cr.status, error: cr.status >= 300 ? cr.text.slice(0, 400) : null };
    must(cr.status >= 200 && cr.status < 300, `Create scenario failed HTTP ${cr.status}: ${cr.text.slice(0, 400)}`);
    scenarioId = cr.json?.scenario?.id || cr.json?.id;
    must(scenarioId, 'No scenario id');
  } else {
    out.reused_existing = true;
  }

  // Enable hook + start scenario
  if (hookId) {
    await make(`/hooks/${hookId}/enable`, { method: 'POST', body: {} });
  }
  const start = await make(`/scenarios/${scenarioId}/start`, { method: 'POST', body: {} });
  if (start.status >= 400) {
    await make(`/scenarios/${scenarioId}?confirmed=true`, { method: 'PATCH', body: { isActive: true } });
  }

  // Resolve hook URL
  const hooks = await make(`/hooks?teamId=${teamId}&typeName=gateway-webhook&pg[limit]=100`);
  const hookList = hooks.json?.hooks || [];
  const hook = hookList.find((h) => h.id === hookId)
    || hookList.find((h) => h.scenarioId === scenarioId)
    || null;

  // If hookId unknown, read from blueprint
  if (!hookId) {
    const br = await make(`/scenarios/${scenarioId}/blueprint`);
    const bp = br.json?.response?.blueprint || br.json?.blueprint;
    const flow = bp?.flow || [];
    const wh = flow.find((m) => /CustomWebHook/i.test(m?.module || ''));
    hookId = wh?.parameters?.hook || null;
  }
  const hook2 = hook || hookList.find((h) => h.id === hookId) || null;
  const fullUrl = hook2?.url || null;

  out.scenario_id = scenarioId;
  out.hook_id = hookId || hook2?.id || null;
  out.hook_url_redacted = redactUrl(fullUrl);
  // Full URL printed once for Owner to paste into Gupshup — not a password, but treat as semi-secret
  out.hook_url = fullUrl;
  out.make_scenario_url_hint = `https://www.make.com/${zone}/scenarios/${scenarioId}/edit`;
  out.next_owner_step = {
    he: 'העתק את hook_url ל-Gupshup → Webhook Delivery (יחליף את make.com) — או שלח את 8 התווים האחרונים של Callback URL הקיים ב-Gupshup כדי להתאים Hook.',
    options: [
      'MATCH — שלח 8 תווים אחרונים מ-Callback URL של make.com ב-Gupshup',
      'מאשר A — החלף Delivery URL ב-Gupshup ל-Supabase הישיר',
      'מאשר A-Make — החלף Delivery URL ב-Gupshup ל-hook_url של התרחיש החדש',
    ],
  };

  console.log('---MAKE_DEDICATED_DLR_SCENARIO---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_DEDICATED_DLR_SCENARIO_DONE---');
  fs.writeFileSync('/tmp/make-dedicated-dlr.json', JSON.stringify(out, null, 2));
  if (!fullUrl) process.exit(1);
}

main().catch((e) => {
  out.error = String(e.message || e).slice(0, 500);
  console.log('---MAKE_DEDICATED_DLR_SCENARIO---');
  console.log(JSON.stringify(out, null, 2));
  console.log('---MAKE_DEDICATED_DLR_SCENARIO_DONE---');
  process.exit(1);
});
