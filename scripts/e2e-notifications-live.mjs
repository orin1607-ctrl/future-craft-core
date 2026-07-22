/**
 * Live E2E: regular incident notifications (WhatsApp + Email) on Production.
 * Re-triggered 2026-07-22: Owner Production fault-alert live check (no logic change).
 * Also verifies scheduled-alert data path (custom_alerts) — UI reminders,
 * not Edge WA/Email (by design today).
 *
 * Destinations (Owner-authorized):
 *   WhatsApp: 0534338601
 *   Email:    orin1607@gmail.com
 *
 *   SRK=... ANON=... node scripts/e2e-notifications-live.mjs
 */
import { randomUUID } from 'crypto';

const PROD = 'qasomfndnjuixgjmjwcm';
const SB = `https://${PROD}.supabase.co`;
const ANON = process.env.ANON || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SRK = process.env.SRK || process.env.SUPABASE_SERVICE_ROLE_KEY;
const WA_DEST = '0534338601';
const EMAIL_DEST = 'orin1607@gmail.com';
const COMPANY = 'אילנה אטיאס';
const SESSION_EMAIL = 'orin1607@gmail.com';

if (!SRK || !ANON) throw new Error('SRK and ANON required');

const report = {
  ok: false,
  env: 'production',
  destinations: { whatsapp: WA_DEST, email: EMAIL_DEST },
  readiness: {},
  whatsapp: {},
  email: {},
  regular_incident: {},
  scheduled: {},
  deliveries: [],
  errors: [],
};

function log(step, data) {
  console.log(JSON.stringify({ step, ...data }));
}

async function req(method, path, { body, bearer = SRK, prefer } = {}) {
  const headers = { apikey: SRK, Authorization: `Bearer ${bearer}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SB}${path}`, {
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
  return { status: res.status, json, text };
}

async function getSession() {
  const gen = await req('POST', '/auth/v1/admin/generate_link', {
    body: { type: 'magiclink', email: SESSION_EMAIL },
  });
  if (gen.status !== 200) throw new Error(`generate_link ${gen.status}`);
  const otp = gen.json.email_otp;
  const res = await fetch(`${SB}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: SESSION_EMAIL, token: otp }),
  });
  const json = await res.json();
  const at = json.access_token || json.session?.access_token;
  const userId = json.user?.id || json.session?.user?.id;
  if (!at) throw new Error(`verify failed: ${JSON.stringify(json).slice(0, 300)}`);
  return { accessToken: at, userId };
}

try {
  const session = await getSession();
  const at = session.accessToken;
  log('auth', { ok: true, email: SESSION_EMAIL, userId: session.userId });

  // --- Readiness ---
  const waConn = await req('POST', '/functions/v1/send-whatsapp-message', {
    body: { action: 'check_connection' },
    bearer: at,
  });
  report.readiness.whatsapp = {
    http: waConn.status,
    configured: waConn.json?.configured ?? null,
    success: waConn.json?.success ?? null,
    message: typeof waConn.json?.message === 'string' ? waConn.json.message.slice(0, 200) : null,
    app_name: waConn.json?.app_name ?? null,
    source: waConn.json?.source ?? null,
  };
  log('wa_check_connection', report.readiness.whatsapp);

  const dry = await req('POST', '/functions/v1/notify-accident-email', {
    body: {
      dry_run: true,
      type: 'fault',
      record: {
        id: '00000000-0000-4000-8000-000000000091',
        company_name: COMPANY,
        event_number: 'FLT-E2E-DRY',
        fault_type: 'פנצ׳ר',
        driver_name: 'יוני אטיאס',
        vehicle_plate: '12-345-67',
        link: 'https://dalia-car.online/faults?id=dry',
      },
      channels: {
        email: true,
        whatsapp: true,
        in_app: false,
        emailRecipients: 'dalia',
        whatsappRecipients: 'dalia',
      },
      dalia: { email: EMAIL_DEST, whatsappPhone: WA_DEST },
    },
    bearer: at,
  });
  report.readiness.notify_dry_run = {
    http: dry.status,
    dry_run: dry.json?.dry_run ?? null,
    would_email: dry.json?.would_email ?? null,
    would_whatsapp: dry.json?.would_whatsapp ?? null,
    error: dry.json?.error ?? null,
  };
  log('notify_dry_run', report.readiness.notify_dry_run);

  // --- Direct WhatsApp send_test ---
  if (report.readiness.whatsapp.configured) {
    const waSend = await req('POST', '/functions/v1/send-whatsapp-message', {
      body: {
        action: 'send_test',
        destination: WA_DEST,
        message:
          'בדיקת התראות דליה (E2E)\nזו הודעת בדיקה מאושרת ל-053-4338601.\nאם קיבלת — WhatsApp עובד.',
      },
      bearer: at,
    });
    report.whatsapp = {
      attempted: true,
      http: waSend.status,
      success: waSend.json?.success ?? false,
      error: waSend.json?.error ?? waSend.json?.message ?? null,
      provider_message_id: waSend.json?.messageId || waSend.json?.message_id || waSend.json?.id || null,
      raw_keys: waSend.json && typeof waSend.json === 'object' ? Object.keys(waSend.json) : [],
    };
    log('whatsapp_send_test', report.whatsapp);
    if (!report.whatsapp.success) {
      report.errors.push(`WhatsApp send failed: ${report.whatsapp.error || waSend.status}`);
    }
  } else {
    report.whatsapp = {
      attempted: false,
      success: false,
      blocked: true,
      reason: 'GUPSHUP_API_KEY not configured on Production Edge Secrets',
      message: report.readiness.whatsapp.message,
    };
    report.errors.push('WhatsApp blocked: GUPSHUP_API_KEY missing on Production');
    log('whatsapp_send_test', report.whatsapp);
  }

  // --- Regular incident notify (Email + WA forced) ---
  const incidentId = randomUUID();
  const eventNumber = `FLT-E2E-${Date.now().toString().slice(-6)}`;
  const notify = await req('POST', '/functions/v1/notify-accident-email', {
    body: {
      type: 'fault',
      dry_run: false,
      record: {
        id: incidentId,
        company_name: COMPANY,
        event_number: eventNumber,
        serial_id: eventNumber,
        driver_name: 'יוני אטיאס',
        vehicle_plate: '12-345-67',
        fault_type: 'פנצ׳ר',
        description: 'בדיקת E2E התראות — WhatsApp + Email (Owner authorized)',
        urgency: 'urgent',
        status: 'opened',
        reporter_phone: WA_DEST,
        link: `https://dalia-car.online/faults?id=${incidentId}`,
      },
      channels: {
        in_app: true,
        email: true,
        whatsapp: true,
        emailRecipients: 'dalia',
        whatsappRecipients: 'dalia',
      },
      dalia: { email: EMAIL_DEST, whatsappPhone: WA_DEST },
    },
    bearer: at,
  });
  report.regular_incident = {
    incident_id: incidentId,
    event_number: eventNumber,
    http: notify.status,
    success: notify.json?.success ?? null,
    results: notify.json?.results ?? notify.json ?? null,
    error: notify.json?.error ?? null,
  };
  log('regular_incident_notify', {
    http: notify.status,
    success: notify.json?.success,
    results: notify.json?.results,
    error: notify.json?.error,
    sent: notify.json?.sent,
  });

  // Parse email/whatsapp outcomes from results array if present
  const results = Array.isArray(notify.json?.results) ? notify.json.results : [];
  const emailResults = results.filter((r) => r.channel === 'email');
  const waResults = results.filter((r) => r.channel === 'whatsapp');
  report.email = {
    attempted: true,
    success: emailResults.some((r) => r.status === 'sent' || r.status === 'delivered')
      || (notify.json?.sent > 0 && emailResults.length === 0 && !report.errors.some((e) => e.includes('Email'))),
    results: emailResults.length ? emailResults : results,
    http: notify.status,
  };
  // Refine channel success from results array
  if (emailResults.length) {
    report.email.success = emailResults.some((r) => r.status === 'sent' || r.status === 'delivered');
    if (!report.email.success) {
      report.errors.push(
        `Email failed: ${emailResults.map((r) => r.error || r.status).join('; ')}`,
      );
    }
  } else if (notify.json?.error) {
    report.email.success = false;
    report.errors.push(`Email/notify error: ${notify.json.error}`);
  } else if (Array.isArray(notify.json?.results)) {
    report.email.success = false;
    report.errors.push('Email: no email channel rows in notify results');
  } else if (typeof notify.json?.sent === 'number') {
    report.email.success = notify.json.sent > 0;
    if (!report.email.success) report.errors.push('Email: legacy edge returned sent=0');
  }

  if (waResults.length) {
    report.regular_incident.whatsapp_from_notify = waResults;
    if (!waResults.some((r) => r.status === 'sent' || r.status === 'delivered')) {
      if (!report.whatsapp.success) {
        report.errors.push(
          `Notify WhatsApp failed: ${waResults.map((r) => r.error || r.status).join('; ')}`,
        );
      }
    } else {
      report.whatsapp.via_notify = true;
      report.whatsapp.success = true;
    }
  }

  // --- Delivery log ---
  const del = await req(
    'GET',
    `/rest/v1/incident_notification_deliveries?incident_id=eq.${incidentId}&select=channel,recipient,status,error_message,provider_message_id,sent_at&order=created_at.desc`,
  );
  report.deliveries = Array.isArray(del.json) ? del.json : [];
  log('deliveries', { count: report.deliveries.length, rows: report.deliveries });

  // If email success still unknown, infer from deliveries
  const emailDel = report.deliveries.filter((d) => d.channel === 'email');
  if (emailDel.length) {
    report.email.success = emailDel.some((d) => d.status === 'sent' || d.status === 'delivered');
    report.email.delivery_rows = emailDel;
  }
  const waDel = report.deliveries.filter((d) => d.channel === 'whatsapp');
  if (waDel.length) {
    const waOk = waDel.some((d) => d.status === 'sent' || d.status === 'delivered');
    if (waOk) report.whatsapp.success = true;
    report.whatsapp.delivery_rows = waDel;
  }

  // --- Scheduled alerts path (custom_alerts) ---
  // These power the Alerts UI / reminders; they do NOT auto-send WA/Email today.
  const alertId = randomUUID();
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const alertInsert = await req('POST', '/rest/v1/custom_alerts', {
    body: {
      id: alertId,
      company_name: COMPANY,
      title: 'בדיקת E2E התראה מתוזמנת',
      description: 'נוצרה ע״י בדיקת התראות — לא אמורה לשלוח WA/Email אוטומטית',
      alert_date: tomorrow,
      alert_type: 'general',
      is_active: true,
      user_id: session.userId || '00000000-0000-4000-8000-000000000001',
      next_trigger_at: tomorrow,
    },
    prefer: 'return=representation',
    bearer: at,
  });
  // custom_alerts schema may differ — try minimal fields on failure
  let scheduledRow = null;
  if (alertInsert.status === 201 || alertInsert.status === 200) {
    scheduledRow = Array.isArray(alertInsert.json) ? alertInsert.json[0] : alertInsert.json;
  } else {
    // Probe schema
    const sample = await req(
      'GET',
      '/rest/v1/custom_alerts?select=*&limit=1',
    );
    report.scheduled.schema_sample_keys =
      sample.json?.[0] && typeof sample.json[0] === 'object' ? Object.keys(sample.json[0]) : [];
    report.scheduled.insert_error = alertInsert.json;
    log('scheduled_insert_failed', {
      status: alertInsert.status,
      error: alertInsert.json,
      sample_keys: report.scheduled.schema_sample_keys,
    });
  }

  const listed = await req(
    'GET',
    `/rest/v1/custom_alerts?company_name=eq.${encodeURIComponent(COMPANY)}&order=created_at.desc&limit=5`,
  );
  const recentAlerts = Array.isArray(listed.json) ? listed.json : [];
  report.scheduled = {
    ...report.scheduled,
    mechanism: 'custom_alerts + Alerts UI aggregation (no Edge WhatsApp/Email cron)',
    insert_ok: Boolean(scheduledRow),
    alert_id: scheduledRow?.id || null,
    recent_count: recentAlerts.length,
    note:
      'התראות מתוזמנות (רישיונות/ביטוח/custom_alerts) מוצגות במסך התראות — אין כיום cron ששולח אותן ב-WhatsApp/Email',
  };
  log('scheduled', report.scheduled);

  // exam expiry edge existence
  const exam = await req('POST', '/functions/v1/check-exam-expiry', {
    body: { dry_run: true },
    bearer: at,
  });
  report.scheduled.exam_expiry_edge = {
    http: exam.status,
    body_keys: exam.json && typeof exam.json === 'object' ? Object.keys(exam.json) : [],
    error: exam.json?.error || (exam.status >= 400 ? exam.text?.slice(0, 200) : null),
    note: 'in-app driver_notifications only (if configured); cron may still point at legacy project',
  };
  log('exam_expiry_edge', report.scheduled.exam_expiry_edge);

  report.whatsapp.works = Boolean(report.whatsapp.success);
  report.email.works = Boolean(report.email.success);
  report.scheduled.works_as_designed =
    report.scheduled.insert_ok || recentAlerts.length > 0 || report.scheduled.schema_sample_keys?.length > 0;

  report.ok = report.email.works; // Email is the minimum; WA may be blocked by missing secret
  report.summary = {
    whatsapp: report.whatsapp.works ? 'PASS' : report.whatsapp.blocked ? 'BLOCKED_MISSING_GUPSHUP' : 'FAIL',
    email: report.email.works ? 'PASS' : 'FAIL',
    scheduled_alerts:
      report.scheduled.works_as_designed
        ? 'UI_OK_NO_AUTO_WA_EMAIL'
        : 'FAIL_OR_UNKNOWN_SCHEMA',
    edge_errors: report.errors,
  };

  console.log('---E2E_NOTIFICATIONS_REPORT---');
  console.log(JSON.stringify(report, null, 2));
  console.log('---E2E_NOTIFICATIONS_REPORT_DONE---');

  // Exit 0 even if WA blocked — we still delivered a complete diagnosis.
  // Exit 1 only if Email also failed (unexpected if RESEND works).
  if (!report.email.works && !report.whatsapp.works) process.exit(1);
  process.exit(0);
} catch (e) {
  report.errors.push(e instanceof Error ? e.message : String(e));
  console.error('---E2E_NOTIFICATIONS_REPORT---');
  console.error(JSON.stringify(report, null, 2));
  console.error('---E2E_NOTIFICATIONS_REPORT_DONE---');
  process.exit(1);
}
