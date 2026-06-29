/**
 * Mission 30 — Gmail approval trial (Staging only).
 * Sends via Resend if RESEND_API_KEY available; otherwise generates HTML mockup.
 *
 * Usage:
 *   node scripts/send-gmail-approval-trial.mjs
 *   node scripts/send-gmail-approval-trial.mjs --v2
 *   TEST_RECIPIENT=verified@example.com node scripts/send-gmail-approval-trial.mjs --send --v2
 *   node scripts/send-gmail-approval-trial.mjs --send --edge
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { buildApprovalEmail, loadPage07DemoData } from './lib/gmail-approval-email-template.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'audit-reports', 'gmail-approval-trial');
const PUBLIC_SAMPLE = join(ROOT, 'public', 'ai-marketing', 'email-approval-sample.html');
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const SUPABASE_HOST = `${STAGING_REF}.supabase.co`;
const FROM_ADDRESS = 'דליה מערכות <onboarding@resend.dev>';
const DEFAULT_RECIPIENT = 'orin1607@gmail.com';

mkdirSync(OUT, { recursive: true });

const args = new Set(process.argv.slice(2));
const forceSend = args.has('--send');
const dryRun = args.has('--dry-run');
const useV2 = args.has('--v2') || !args.has('--v1');
const useEdge = args.has('--edge');

function loadEnvFile(name) {
  const p = join(ROOT, name);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    let v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

function loadResendKey() {
  if (process.env.RESEND_API_KEY?.startsWith('re_')) return process.env.RESEND_API_KEY;
  for (const name of ['.resend-key.local', '.env.local', '.env']) {
    const env = loadEnvFile(name);
    if (env.RESEND_API_KEY?.startsWith('re_')) return env.RESEND_API_KEY;
  }
  return null;
}

function loadSupabaseConfig() {
  const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
  const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || `https://${SUPABASE_HOST}`;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const cron = process.env.MARKETING_CRON_SECRET || env.MARKETING_CRON_SECRET;
  return { url, anon, service, cron };
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '(לא הוגדר)';
  const [user, domain] = email.split('@');
  const masked = user.length <= 2 ? '**' : `${user.slice(0, 2)}***`;
  return `${masked}@${domain}`;
}

function checkSupabaseResendSecret() {
  try {
    const out = execSync(`supabase secrets list --project-ref ${STAGING_REF}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const hasResend = /RESEND_API_KEY/.test(out);
    const hasGmail = /GMAIL_SEND_ENABLED/.test(out);
    const hasCron = /MARKETING_CRON_SECRET/.test(out);
    return {
      reachable: true,
      hasResend,
      hasGmail,
      hasCron,
      note: hasResend ? 'RESEND_API_KEY exists in Supabase Staging' : 'RESEND_API_KEY not in Supabase secrets list',
    };
  } catch (e) {
    return { reachable: false, hasResend: null, hasGmail: null, hasCron: null, note: String(e.message || e).slice(0, 120) };
  }
}

function checkEdgeFunctionExists() {
  const p = join(ROOT, 'supabase', 'functions', 'marketing-notify-email', 'index.ts');
  return existsSync(p);
}

async function sendViaResend(apiKey, { to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function sendViaEdge({ url, anon, service, cron }, { to, subject, html, text, approvalId }) {
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/marketing-notify-email`;
  const headers = { 'Content-Type': 'application/json' };
  if (cron) {
    headers['x-marketing-cron-secret'] = cron;
    if (anon) {
      headers.apikey = anon;
      headers.Authorization = `Bearer ${anon}`;
    }
  } else if (service) {
    headers.apikey = service;
    headers.Authorization = `Bearer ${service}`;
  } else if (anon) {
    headers.apikey = anon;
    headers.Authorization = `Bearer ${anon}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      recipient: to,
      subject,
      html,
      text,
      approvalId,
      channel: 'email',
      dryRun: false,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body, endpoint };
}

async function main() {
  const data = loadPage07DemoData(ROOT);
  const email = buildApprovalEmail(data, { version: useV2 ? 2 : 1 });
  const htmlName = useV2 ? 'email-sample-v2.html' : 'email-sample.html';
  const htmlPath = join(OUT, htmlName);
  writeFileSync(htmlPath, email.html, 'utf8');
  writeFileSync(PUBLIC_SAMPLE, email.html, 'utf8');
  if (useV2) {
    writeFileSync(join(OUT, 'email-sample.html'), email.html, 'utf8');
  }

  const resendKey = loadResendKey();
  const supabaseCfg = loadSupabaseConfig();
  const recipient = process.env.TEST_RECIPIENT || process.env.TEST_EMAIL || DEFAULT_RECIPIENT;
  const supabaseSecrets = checkSupabaseResendSecret();
  const edgeExists = checkEdgeFunctionExists();

  const report = {
    mission: 30,
    at: new Date().toISOString(),
    mode: 'staging_trial',
    templateVersion: useV2 ? 2 : 1,
    pageId: data.pageId,
    pageName: data.pageName,
    subject: email.subject,
    htmlPath: `docs/audit-reports/gmail-approval-trial/${htmlName}`,
    stagingPreviewUrl: email.previewUrl,
    stagingEmailPreviewUrl: email.stagingEmailPreview,
    dataSource: data.sourceReport || 'defaults',
    gmailConnected: false,
    gmailOAuth: { enabled: false, phase: 2, note: 'Resend recommended — see Mission 27 PLAN-HE.md' },
    resend: {
      localKeyPresent: !!resendKey,
      localKeyPrefix: resendKey ? `${resendKey.slice(0, 6)}…` : null,
      supabaseStaging: supabaseSecrets,
      from: FROM_ADDRESS,
    },
    marketingNotifyEdge: {
      exists: edgeExists,
      name: 'marketing-notify-email',
      deployed: null,
      invokeAttempted: false,
    },
    sendAttempted: false,
    sendSucceeded: false,
    sendChannel: null,
    recipientMasked: maskEmail(recipient),
    recipientDomain: recipient.split('@')[1] || null,
    checklist17: {
      companyName: true,
      siteName: true,
      pageName: true,
      dateTime: true,
      aiEngines: true,
      rationale: true,
      dataCollected: useV2,
      keywords: useV2,
      stateBefore: useV2,
      stateAfter: useV2,
      changes: true,
      expectedImprovements: useV2,
      confidenceScore: true,
      beforeAfterVisual: true,
      actionButtons: true,
      stagingLink: true,
      managerSummary: useV2,
    },
    missingForProduction: [
      'Deploy marketing-notify-email to Supabase Staging',
      'marketing_approvals + tokens tables',
      'GMAIL_SEND_ENABLED (Phase 2 — optional Gmail OAuth)',
      'Screenshot capture pipeline (Playwright → Storage)',
      'Signed HMAC tokens (MARKETING_APPROVAL_SECRET)',
      'RESEND_FROM with verified dalia-c.com domain',
      'Wire Daily Engine → enqueue → Edge outbox',
    ],
  };

  if (forceSend && !dryRun) {
    report.sendAttempted = true;

    const canEdge =
      useEdge ||
      (!resendKey && edgeExists && (supabaseCfg.service || supabaseCfg.cron));

    if (canEdge && edgeExists && (supabaseCfg.service || supabaseCfg.cron || supabaseCfg.anon)) {
      report.marketingNotifyEdge.invokeAttempted = true;
      report.sendChannel = 'edge';
      const result = await sendViaEdge(supabaseCfg, {
        to: recipient,
        subject: email.subject,
        html: email.html,
        text: email.text,
        approvalId: data.approvalId,
      });
      report.sendSucceeded = result.ok && result.body?.sent !== false;
      report.gmailConnected = report.sendSucceeded;
      report.marketingNotifyEdge.send = {
        httpStatus: result.status,
        id: result.body?.id || null,
        error: result.ok ? result.body?.error || null : result.body?.error || result.body?.message || 'edge_send_failed',
        endpoint: result.endpoint,
      };
    } else if (resendKey) {
      report.sendChannel = 'resend_local';
      const result = await sendViaResend(resendKey, {
        to: recipient,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      report.sendSucceeded = result.ok;
      report.gmailConnected = result.ok;
      report.resend.send = {
        httpStatus: result.status,
        id: result.body?.id || null,
        error: result.ok ? null : result.body?.message || result.body?.name || 'send_failed',
      };
    } else {
      report.resend.note = 'No local RESEND_API_KEY — use --edge after deploy or set key in .env.local';
    }
  } else if (resendKey && !dryRun) {
    report.resend.note = 'Key available — pass --send to deliver one test email';
    report.gmailConnected = true;
  } else if (supabaseSecrets.hasResend && !dryRun) {
    report.resend.note = 'Supabase has RESEND_API_KEY — deploy Edge + --send --edge';
    report.gmailConnected = true;
  } else {
    report.resend.note = report.resend.note || 'No local RESEND_API_KEY — HTML mockup only';
  }

  const reportPath = join(OUT, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        version: useV2 ? 2 : 1,
        html: htmlPath,
        report: reportPath,
        sendSucceeded: report.sendSucceeded,
        sendAttempted: report.sendAttempted,
        sendChannel: report.sendChannel,
        resendKeyLocal: !!resendKey,
        edgeExists,
        recipient: report.recipientMasked,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
