/**
 * Mission 28 — Gmail approval trial (Staging only).
 * Sends via Resend if RESEND_API_KEY available; otherwise generates HTML mockup.
 *
 * Usage:
 *   node scripts/send-gmail-approval-trial.mjs
 *   TEST_RECIPIENT=verified@example.com node scripts/send-gmail-approval-trial.mjs --send
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { buildApprovalEmail, loadPage07DemoData } from './lib/gmail-approval-email-template.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs', 'audit-reports', 'gmail-approval-trial');
const PUBLIC_SAMPLE = join(ROOT, 'public', 'ai-marketing', 'email-approval-sample.html');
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const FROM_ADDRESS = 'דליה מערכות <onboarding@resend.dev>';
const DEFAULT_RECIPIENT = 'orin1607@gmail.com';

mkdirSync(OUT, { recursive: true });

const args = new Set(process.argv.slice(2));
const forceSend = args.has('--send');
const dryRun = args.has('--dry-run');

function loadResendKey() {
  if (process.env.RESEND_API_KEY?.startsWith('re_')) return process.env.RESEND_API_KEY;
  for (const name of ['.resend-key.local', '.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (k === 'RESEND_API_KEY' && v.startsWith('re_')) return v;
    }
  }
  return null;
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
    return { reachable: true, hasResend, hasGmail, note: hasResend ? 'secret exists in Supabase Staging' : 'RESEND_API_KEY not in Supabase secrets list' };
  } catch (e) {
    return { reachable: false, hasResend: null, hasGmail: null, note: String(e.message || e).slice(0, 120) };
  }
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

async function main() {
  const data = loadPage07DemoData(ROOT);
  const email = buildApprovalEmail(data);
  const htmlPath = join(OUT, 'email-sample.html');
  writeFileSync(htmlPath, email.html, 'utf8');
  writeFileSync(PUBLIC_SAMPLE, email.html, 'utf8');

  const resendKey = loadResendKey();
  const recipient = process.env.TEST_RECIPIENT || process.env.TEST_EMAIL || DEFAULT_RECIPIENT;
  const supabaseSecrets = checkSupabaseResendSecret();

  const report = {
    mission: 28,
    at: new Date().toISOString(),
    mode: 'staging_trial',
    pageId: data.pageId,
    pageName: data.pageName,
    subject: email.subject,
    htmlPath: 'docs/audit-reports/gmail-approval-trial/email-sample.html',
    stagingPreviewUrl: email.previewUrl,
    stagingEmailPreviewUrl: email.stagingEmailPreview,
    dataSource: data.sourceReport || 'defaults',
    gmailConnected: false,
    resend: {
      localKeyPresent: !!resendKey,
      localKeyPrefix: resendKey ? `${resendKey.slice(0, 6)}…` : null,
      supabaseStaging: supabaseSecrets,
      from: FROM_ADDRESS,
    },
    marketingNotifyEdge: { exists: false, name: 'marketing-notify-email' },
    sendAttempted: false,
    sendSucceeded: false,
    recipientMasked: maskEmail(recipient),
    recipientDomain: recipient.split('@')[1] || null,
    missingForProduction: [
      'Edge function marketing-notify-email',
      'marketing_approvals + tokens tables',
      'GMAIL_SEND_ENABLED (Phase 2 — optional)',
      'Screenshot capture pipeline',
      'Signed HMAC tokens (MARKETING_APPROVAL_SECRET)',
      'RESEND_FROM with verified dalia-c.com domain',
    ],
  };

  if (forceSend && resendKey && !dryRun) {
    report.sendAttempted = true;
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
  } else if (resendKey && !dryRun) {
    report.resend.note = 'Key available — pass --send to deliver one test email';
    report.gmailConnected = true;
  } else {
    report.resend.note = report.resend.note || 'No local RESEND_API_KEY — HTML mockup only';
  }

  const reportPath = join(OUT, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    html: htmlPath,
    report: reportPath,
    sendSucceeded: report.sendSucceeded,
    sendAttempted: report.sendAttempted,
    resendKeyLocal: !!resendKey,
    recipient: report.recipientMasked,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
