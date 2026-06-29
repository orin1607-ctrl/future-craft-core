/**
 * Mission 30 — TEST 2 delivery probe (minimal HTML, unique subject).
 *
 * Usage:
 *   MARKETING_CRON_SECRET=m30-staging-orin-2026 \
 *   VITE_SUPABASE_URL=https://usfeoerkpcafxxlyuldl.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=... \
 *   node scripts/send-mission30-test2.mjs
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'audit-reports', 'gmail-approval-trial');
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const SUPABASE_HOST = `${STAGING_REF}.supabase.co`;
const RECIPIENT = 'orin1607@gmail.com';
const SUBJECT = 'MISSION 30 – TEST 2 – 29/06/2026';
const PLAIN_LINE = 'אם אתה קורא את השורה הזאת, המייל הגיע בהצלחה.';
const PREVIOUS_ID = '0ea0cdc6-5f7b-4267-a4e2-8aab1bf26fe8';
const STATUS_WAIT_MS = 4000;

mkdirSync(OUT, { recursive: true });

function loadEnvFile(name) {
  const p = join(ROOT, name);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function loadCfg() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  return {
    url: process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || `https://${SUPABASE_HOST}`,
    anon:
      process.env.VITE_SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
    cron: process.env.MARKETING_CRON_SECRET || env.MARKETING_CRON_SECRET,
  };
}

function buildPayload() {
  const text = [
    'Mission 30 — TEST 2 — delivery probe',
    '',
    PLAIN_LINE,
    '',
    `Recipient: ${RECIPIENT}`,
    `Sent: ${new Date().toISOString()}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><title>${SUBJECT}</title></head>
<body style="font-family:Arial,sans-serif;line-height:1.5;padding:16px;">
  <p><strong>Mission 30 — TEST 2</strong></p>
  <p>${PLAIN_LINE}</p>
  <p style="color:#666;font-size:12px;">Delivery test via Supabase Edge → Resend</p>
</body>
</html>`;

  return { subject: SUBJECT, html, text };
}

async function edgePost(cfg, body) {
  const endpoint = `${cfg.url.replace(/\/$/, '')}/functions/v1/marketing-notify-email`;
  const headers = { 'Content-Type': 'application/json', 'x-marketing-cron-secret': cfg.cron };
  if (cfg.anon) {
    headers.apikey = cfg.anon;
    headers.Authorization = `Bearer ${cfg.anon}`;
  }
  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, json, endpoint };
}

function summarizeEmail(email) {
  if (!email || typeof email !== 'object') return null;
  const last = email.last_event || null;
  return {
    id: email.id || null,
    message_id: email.message_id || null,
    to: email.to || null,
    from: email.from || null,
    subject: email.subject || null,
    created_at: email.created_at || null,
    last_event: last,
    delivered: last === 'delivered',
    bounced: last === 'bounced' || last === 'failed',
    complained: last === 'complained',
    rejected: last === 'suppressed' || last === 'failed',
    scheduled_at: email.scheduled_at ?? null,
    raw_last_event: last,
  };
}

async function main() {
  const cfg = loadCfg();
  if (!cfg.cron) {
    console.error('MARKETING_CRON_SECRET required');
    process.exit(1);
  }
  if (!cfg.anon) {
    console.error('VITE_SUPABASE_ANON_KEY required');
    process.exit(1);
  }

  const { subject, html, text } = buildPayload();
  const sendStartedAt = new Date().toISOString();

  const send = await edgePost(cfg, {
    recipient: RECIPIENT,
    subject,
    html,
    text,
    approvalId: 'mission30-test2',
    dryRun: false,
  });

  const emailId = send.json?.id || null;
  let statusCheck = null;
  let statusSummary = null;

  if (emailId) {
    await new Promise((r) => setTimeout(r, STATUS_WAIT_MS));
    statusCheck = await edgePost(cfg, { action: 'get_status', emailId });
    statusSummary = summarizeEmail(statusCheck.json?.email);
  }

  const report = {
    mission: 30,
    test: 'TEST_2',
    missionStatus: 'OPEN',
    at: new Date().toISOString(),
    sendStartedAt,
    recipient: RECIPIENT,
    subject,
    plainLine: PLAIN_LINE,
    previousMessageId: PREVIOUS_ID,
    send: {
      http: send.http,
      ok: send.http === 200 && send.json?.sent !== false,
      id: emailId,
      from: send.json?.from || null,
      endpoint: send.endpoint,
      error: send.json?.error || null,
      resend_http: send.json?.resend_http || null,
    },
    statusWaitMs: STATUS_WAIT_MS,
    statusCheck: statusCheck
      ? {
          http: statusCheck.http,
          ok: statusCheck.http === 200,
          resend_http: statusCheck.json?.resend_http || null,
          summary: statusSummary,
          email: statusCheck.json?.email || null,
        }
      : null,
    proof: {
      sendTimestamp: sendStartedAt,
      resendId: emailId,
      sesMessageId: statusSummary?.message_id || null,
      lastEvent: statusSummary?.last_event || null,
      delivered: statusSummary?.delivered ?? null,
      bounced: statusSummary?.bounced ?? null,
      complained: statusSummary?.complained ?? null,
      rejected: statusSummary?.rejected ?? null,
    },
    inboxConfirmed: false,
    note: 'Mission 30 stays OPEN until user confirms inbox receipt at orin1607@gmail.com',
  };

  const jsonPath = join(OUT, 'test2-delivery.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({ jsonPath, proof: report.proof, sendOk: report.send.ok }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
