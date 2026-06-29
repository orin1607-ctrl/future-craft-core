/**
 * Mission 30 — Marketing approval email via Resend.
 * POST { recipient, subject, html, text?, approvalId?, dryRun? }
 * Auth: x-marketing-cron-secret | x-dalia-internal-key | super_admin JWT
 */
import { edgeCorsHeaders, jsonResponse, requireAuth } from '../_shared/edgeAuth.ts';

const corsHeaders = edgeCorsHeaders;
const DEFAULT_FROM = 'דליה מערכות <onboarding@resend.dev>';

function isCronAuthorized(req: Request): boolean {
  const secret = Deno.env.get('MARKETING_CRON_SECRET');
  if (!secret) return false;
  return req.headers.get('x-marketing-cron-secret') === secret;
}

function isServiceRole(req: Request): boolean {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.replace('Bearer ', '').trim();
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return !!service && token === service;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    if (!isCronAuthorized(req) && !isServiceRole(req)) {
      const auth = await requireAuth(req, { roles: ['super_admin'], allowInternal: true });
      if ('error' in auth) return auth.error;
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured', sent: false }, 500);
    }

    const body = await req.json();
    const recipient = String(body.recipient || body.to || '').trim();
    const subject = String(body.subject || '').trim();
    const html = String(body.html || '').trim();
    const text = body.text ? String(body.text) : undefined;
    const approvalId = body.approvalId ? String(body.approvalId) : null;
    const dryRun = body.dryRun === true;

    if (!recipient || !subject || !html) {
      return jsonResponse({ error: 'recipient, subject, and html are required' }, 400);
    }

    if (dryRun) {
      return jsonResponse({
        ok: true,
        sent: false,
        dryRun: true,
        approvalId,
        recipientHint: recipient.replace(/(.{2}).+(@.+)/, '$1***$2'),
      });
    }

    const from = Deno.env.get('RESEND_FROM') || DEFAULT_FROM;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        html,
        ...(text ? { text } : {}),
      }),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('marketing-notify-email Resend error:', res.status, resBody);
      return jsonResponse(
        {
          sent: false,
          error: (resBody as { message?: string }).message || 'resend_failed',
          resend_status: res.status,
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      sent: true,
      id: (resBody as { id?: string }).id || null,
      approvalId,
      channel: 'email',
      from,
    });
  } catch (error) {
    console.error('marketing-notify-email error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unexpected error', sent: false },
      500,
    );
  }
});
