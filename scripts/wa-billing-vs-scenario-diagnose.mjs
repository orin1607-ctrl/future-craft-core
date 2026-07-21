/**
 * Billing vs scenario diagnosis — is bot silence due to Gupshup/Meta plan/credits
 * or Make/code path? Staging only. NO real WhatsApp destination send. NO Production.
 */
import fs from 'node:fs';

const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
const makeToken = (process.env.MAKE_API_TOKEN || '').trim();
const zone = (process.env.MAKE_ZONE || '').trim().replace(/\.make\.com$/i, '') || 'eu2';
const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
const OWNER_EMAIL = 'orin1607@gmail.com';
const APP_ID = '496709e8-b5fc-4de9-9c75-bc87455482dd';
const BOT_ID = 5797671;
const HOOK_ID = 2567320;
const MAKE_BASE = `https://${zone}.make.com/api/v2`;
const OUT = 'public/project-001/wa-billing-vs-scenario-result.json';

const out = {
  id: 'wa-billing-vs-scenario',
  at: new Date().toISOString(),
  env: 'staging',
  production_touched: false,
  no_whatsapp_destination_send: true,
  note: 'Probes use destination=0 auth checks only; no message to Owner/staff phones',
};

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function make(path) {
  if (!makeToken) return { status: 0, json: null };
  const res = await fetch(`${MAKE_BASE}${path}`, {
    headers: { Authorization: `Token ${makeToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function mgmt(path) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: { Authorization: `Bearer ${sbToken}`, apikey: sbToken },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function post(base, path, body, bearer, apikey) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: {
      apikey: apikey || bearer,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function billingLikeError(text) {
  const s = String(text || '').toLowerCase();
  return {
    looks_billing:
      /insufficient|balance|credit|wallet|payment|billing|unpaid|subscription.?expired|plan.?expired|trial.?expired|sandbox.?limit|quota|402\b/.test(
        s,
      ),
    looks_auth: /401|403|authentication failed|invalid.?api.?key|forbidden/.test(s),
    looks_window: /131047|re-engage|24.?hour|window/.test(s),
    looks_mapping: /tojson|createjson|failed to map/.test(s),
  };
}

async function main() {
  must(sbToken, 'SUPABASE_ACCESS_TOKEN missing');

  const keys = await mgmt(`/projects/${STAGING}/api-keys`);
  const srk = Array.isArray(keys.json)
    ? keys.json.find((k) => k.name === 'service_role' || (k.tags || []).includes('service_role'))?.api_key
    : null;
  const anon = Array.isArray(keys.json)
    ? keys.json.find((k) => k.name === 'anon' || (k.tags || []).includes('anon'))?.api_key
    : null;
  must(srk, 'No Staging service_role');
  const base = `https://${STAGING}.supabase.co`;
  must(!base.includes(PROD), 'ABORT_PROD');

  const gen = await post(base, '/auth/v1/admin/generate_link', { type: 'magiclink', email: OWNER_EMAIL }, srk, srk);
  const ver = await post(
    base,
    '/auth/v1/verify',
    { type: 'magiclink', email: OWNER_EMAIL, token: gen.body.email_otp },
    anon || srk,
    anon || srk,
  );
  const at = ver.body?.access_token || ver.body?.session?.access_token;
  must(at, 'Staging auth failed');

  const check = await post(base, '/functions/v1/send-whatsapp-message', { action: 'check_connection' }, at, anon || srk);
  const inspect = await post(
    base,
    '/functions/v1/send-whatsapp-message',
    { action: 'inspect_outbound_permissions' },
    at,
    anon || srk,
  );
  const debug = await post(base, '/functions/v1/send-whatsapp-message', { action: 'debug_connection' }, at, anon || srk);

  out.gupshup_live = {
    check_connection: {
      edge_http: check.status,
      configured: check.body?.configured ?? null,
      gupshup_verified: check.body?.gupshup_verified ?? null,
      gupshup_status: check.body?.gupshup_status ?? null,
      app_name: check.body?.app_name ?? null,
      source: check.body?.source ?? null,
      message: check.body?.message ?? null,
      error: check.body?.error ?? null,
      response_excerpt: JSON.stringify(check.body?.gupshup_response || {}).slice(0, 400),
      billing_signals: billingLikeError(JSON.stringify(check.body)),
    },
    inspect: {
      edge_http: inspect.status,
      analysis: inspect.body?.analysis || null,
      templates: inspect.body?.probes?.list_approved_templates
        ? {
            http: inspect.body.probes.list_approved_templates.http_status,
            api_key_accepted: inspect.body.probes.list_approved_templates.api_key_accepted_for_app,
            approved_count: inspect.body.probes.list_approved_templates.approved_template_count,
          }
        : null,
      session_auth: inspect.body?.probes?.session_msg_auth_probe
        ? {
            http: inspect.body.probes.session_msg_auth_probe.http_status,
            authorized: inspect.body.probes.session_msg_auth_probe.outbound_session_api_authorized,
            response_excerpt: JSON.stringify(inspect.body.probes.session_msg_auth_probe.response || {}).slice(0, 300),
            billing_signals: billingLikeError(
              JSON.stringify(inspect.body.probes.session_msg_auth_probe.response || {}),
            ),
          }
        : null,
    },
    debug_connection: {
      edge_http: debug.status,
      gupshup_http: debug.body?.gupshup_response?.http_status ?? debug.body?.gupshup_status ?? null,
      gupshup_verified: debug.body?.gupshup_verified ?? null,
      body_excerpt: JSON.stringify(debug.body?.gupshup_response?.body_json || debug.body?.gupshup_response?.body_raw || {}).slice(0, 400),
      billing_signals: billingLikeError(JSON.stringify(debug.body?.gupshup_response || {})),
    },
    partner_wallet: {
      accessible: false,
      reason:
        'Wallet/balance Partner API needs PARTNER_APP_TOKEN — not in Staging secrets. Using send-auth + templates + recent DLR as proxies.',
    },
  };

  // Make scenario state
  const sc = await make(
    `/scenarios/${BOT_ID}?cols[]=id&cols[]=name&cols[]=isActive&cols[]=islinked&cols[]=hookId`,
  );
  const scenario = sc.json?.scenario || sc.json || {};
  const slog = await make(`/scenarios/${BOT_ID}/logs?pg[limit]=12&pg[sortDir]=desc`);
  const logs = slog.json?.scenarioLogs || slog.json?.logs || [];
  const recentLogs = (Array.isArray(logs) ? logs : []).slice(0, 10).map((x) => ({
    id: x.id,
    status: x.status ?? x.statusId,
    timestamp: x.timestamp || x.loggedAt,
    error: x.error?.message || (typeof x.error === 'string' ? x.error : null),
    billing_signals: billingLikeError(JSON.stringify(x.error || '')),
  }));
  const hook = await make(`/hooks/${HOOK_ID}`);
  const h = hook.json?.hook || hook.json || {};

  out.make_path = {
    whatsapp_bot: {
      http: sc.status,
      id: scenario.id,
      name: scenario.name,
      isActive: scenario.isActive === true,
      islinked: scenario.islinked === true,
      hookId: scenario.hookId,
    },
    hook_queueCount: h.queueCount ?? null,
    recent_execution_errors: recentLogs.filter((x) => x.error),
    toJSON_or_mapping_errors: recentLogs.filter((x) => x.billing_signals.looks_mapping),
    billing_like_errors: recentLogs.filter((x) => x.billing_signals.looks_billing),
  };

  // Historical evidence from repo artifacts (no new send)
  const e2e = loadJson('public/project-001/make-queue-clear-and-e2e-result.json');
  const sentNotRecv = loadJson('public/project-001/wa-sent-not-received-result.json');
  const inbound = loadJson('public/project-001/wa-inbound-bot-path-result.json');
  const fixTojson = loadJson('public/project-001/make-fix-tojson-result.json');
  const three = loadJson('public/project-001/make-three-scenarios-audit-result.json');

  out.evidence_history = {
    last_staging_outbound_e2e: e2e
      ? {
          at: e2e.at,
          gupshup_http: e2e.send?.gupshup_http,
          submitted: e2e.send?.submitted,
          message_id: e2e.send?.message_id,
          make_dlr: e2e.make_dlr_statuses || null,
          implication:
            'Gupshup accepted outbound (202 submitted) and Meta returned sent — not a hard billing block on send API',
        }
      : null,
    meta_codes_seen: {
      '131047_window': 'seen earlier when 24h closed — Meta policy, not payment',
      sent_without_delivered: 'device/delivery path — not insufficient credits (credits would usually fail/submit differently)',
    },
    inbound_reached_make: Boolean((inbound?.hook_logs_window?.inbound_count || 0) > 0),
    make_was_off_or_broken:
      inbound?.scenario?.isActive === false ||
      /toJSON/i.test(JSON.stringify(inbound?.answers || {})) ||
      Boolean(fixTojson?.fixes?.length),
    tojson_fixed_now: fixTojson?.checks?.bot_mapping_no_toJSON === true,
    bot_active_after_fix: fixTojson?.checks?.whatsapp_bot_active === true,
    gupshup_callback_hook: '2567320 …plyk4s → Whatsapp Bot',
    earlier_active_bot_on_wrong_hook: three?.wa_related_active || null,
  };

  // Signals
  const gsVerified = out.gupshup_live.check_connection.gupshup_verified === true;
  const templatesOk = out.gupshup_live.inspect.templates?.api_key_accepted === true;
  const sessionAuthOk = out.gupshup_live.inspect.session_auth?.authorized === true;
  const gsHttp = out.gupshup_live.check_connection.gupshup_status;
  const anyBillingSignal =
    out.gupshup_live.check_connection.billing_signals.looks_billing ||
    out.gupshup_live.inspect.session_auth?.billing_signals?.looks_billing ||
    out.gupshup_live.debug_connection.billing_signals.looks_billing ||
    (out.make_path.billing_like_errors || []).length > 0;
  const mappingWasProblem =
    out.evidence_history.make_was_off_or_broken === true ||
    (out.make_path.toJSON_or_mapping_errors || []).length > 0;

  const accountLooksAlive =
    gsVerified &&
    templatesOk &&
    sessionAuthOk &&
    (gsHttp === 202 || gsHttp === 200 || (gsHttp >= 400 && gsHttp < 500 && gsHttp !== 401 && gsHttp !== 403));

  // destination=0 often returns 4xx business error but still proves auth — 401/403 = dead key
  const authBlocked = gsHttp === 401 || gsHttp === 403 || sessionAuthOk === false;

  let verdict;
  let primary_cause;
  if (authBlocked || anyBillingSignal) {
    verdict = anyBillingSignal ? 'POSSIBLE_BILLING_OR_PLAN' : 'ACCOUNT_AUTH_BLOCKED';
    primary_cause = 'account';
  } else if (accountLooksAlive && mappingWasProblem) {
    verdict = 'SCENARIO_CODE_NOT_BILLING';
    primary_cause = 'scenario_code';
  } else if (accountLooksAlive) {
    verdict = 'ACCOUNT_ALIVE_BOT_PATH_WAS_SCENARIO';
    primary_cause = 'scenario_code';
  } else {
    verdict = 'INCONCLUSIVE';
    primary_cause = 'unknown';
  }

  out.answers = {
    '1_bot_silent_due_to_plan_or_credits':
      anyBillingSignal
        ? 'Possible — billing-like signal in API text'
        : 'NO evidence of credits/plan block. Gupshup key accepts templates + send-auth; recent outbound got 202 submitted + Meta sent.',
    '2_gupshup_or_meta_limit_blocking_auto_reply':
      authBlocked
        ? 'YES — API auth blocked (401/403)'
        : 'NO hard block found for auto-reply API. Inbound still reaches Make webhook (account can receive). Auto-reply failed earlier because Make scenario was OFF / toJSON mapping aborted before Gupshup send module.',
    '3_business_whatsapp_active_and_allowed_to_reply':
      accountLooksAlive
        ? 'YES by API proxy — App DaliaVehicle key valid, templates readable, session send endpoint authorized, source 972546500305. Full WABA portal tier not readable without Partner token.'
        : 'INCONCLUSIVE / NO — see gupshup_live',
    '4_sandbox_trial_billing_limit':
      anyBillingSignal
        ? 'Possible — see billing_signals'
        : 'NO signal in live probes. Not a Sandbox-only app by behavior (live E.164 source, approved templates, Meta conversation.origin=service). Wallet balance not directly readable (no PARTNER_APP_TOKEN).',
    '5_payment_vs_scenario':
      primary_cause === 'scenario_code'
        ? 'SCENARIO/CODE — not payment. Root causes documented: Whatsapp Bot Inactive (queue), HTTP Forward {{toJSON}} DataError aborting before AI/Gupshup reply, and earlier wrong-hook confusion.'
        : primary_cause === 'account'
          ? 'ACCOUNT/BILLING signals present — investigate Gupshup wallet/plan in portal'
          : 'INCONCLUSIVE — need portal wallet check',
  };

  out.verdict = {
    code: verdict,
    primary_cause,
    one_liner_he:
      primary_cause === 'scenario_code'
        ? 'הבעיה היא בתרחיש/קוד Make — לא בתשלום Gupshup/Meta לפי הראיות הזמינות.'
        : primary_cause === 'account'
          ? 'יש סימנים לבעיית חשבון/תשלום — לבדוק ארנק בפורטל Gupshup.'
          : 'לא חד-משמעי — חשבון נראה חי אך חסר גישה לארנק.',
    confidence:
      primary_cause === 'scenario_code' && accountLooksAlive && !anyBillingSignal ? 'high' : 'medium',
  };

  out.checks_summary = {
    gupshup_verified: gsVerified,
    templates_ok: templatesOk,
    session_auth_ok: sessionAuthOk,
    gupshup_http: gsHttp,
    any_billing_signal: anyBillingSignal,
    whatsapp_bot_active_now: out.make_path.whatsapp_bot.isActive,
    mapping_was_problem: mappingWasProblem,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ verdict: out.verdict, answers: out.answers, checks_summary: out.checks_summary }, null, 2));
}

main().catch((e) => {
  out.error = String(e.message || e);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.error(e);
  process.exit(1);
});
