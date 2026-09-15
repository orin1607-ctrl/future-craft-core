/**
 * Browser Gmail scan for Oren Car PUBLIC STAGING when garage-gmail Edge is not deployed.
 * Reuses the existing Staging Google OAuth client (marketing-google-oauth) — no new OAuth app.
 * Mailbox: yoni191177@gmail.com only. Never Claims / yoni122222.
 */
import { supabase } from '@/integrations/supabase/client';
import { GARAGE_MAILBOX, garageMailIsClaimsMailbox } from './garageMailMatch';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email';

export function isMissingGarageGmailFunction(error: unknown, httpStatus?: number) {
  if (httpStatus === 404) return true;
  const anyErr = error as { message?: string; context?: { status?: number } } | null;
  if (anyErr?.context?.status === 404) return true;
  const msg = String(anyErr?.message || error || '');
  return /function not found|requested function was not found|not found|404/i.test(msg);
}

export function parseGoogleClientIdFromAuthUrl(authUrl: string) {
  try {
    const id = new URL(authUrl).searchParams.get('client_id') || '';
    return /\.apps\.googleusercontent\.com$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

function b64url(raw: string) {
  const pad = raw.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad.padEnd(pad.length + (4 - pad.length % 4) % 4, '='));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const want = name.toLowerCase();
  return String((headers || []).find((h) => String(h.name || '').toLowerCase() === want)?.value || '');
}

type Collected = {
  text: string;
  filenames: string[];
  parts: Array<{ filename: string; mime: string; attachId: string }>;
};

function collectParts(part: Record<string, unknown> | undefined, into: Collected) {
  if (!part) return;
  const filename = String(part.filename || '');
  const mime = String(part.mimeType || '');
  const body = (part.body || {}) as { data?: string; attachmentId?: string };
  if (filename) {
    into.filenames.push(filename);
    if (body.attachmentId) into.parts.push({ filename, mime, attachId: String(body.attachmentId) });
  }
  if (body.data && /^text\/(plain|html)/i.test(mime)) {
    into.text += `\n${b64url(body.data).replace(/<[^>]+>/g, ' ')}`;
  }
  for (const child of (part.parts as Array<Record<string, unknown>> || [])) collectParts(child, into);
}

export async function fetchExistingGoogleClientId(): Promise<{ clientId: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('marketing-google-oauth', {
    body: { action: 'auth_url' },
  });
  if (error) return { clientId: '', error: String((error as { message?: string }).message || error) };
  const authUrl = data && typeof data === 'object' ? String((data as { authUrl?: string }).authUrl || '') : '';
  const clientId = parseGoogleClientIdFromAuthUrl(authUrl);
  if (!clientId) return { clientId: '', error: 'existing_google_client_id_unavailable' };
  return { clientId };
}

export async function googleUserinfoEmail(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  return String((json as { email?: string }).email || '').toLowerCase();
}

async function gmailGet(accessToken: string, path: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((json as { error?: { message?: string } }).error?.message || 'gmail_get_failed'));
  return json as Record<string, unknown>;
}

export async function readGarageInbox(accessToken: string) {
  const email = await googleUserinfoEmail(accessToken);
  if (garageMailIsClaimsMailbox(email) || email === 'yoni122222@gmail.com') {
    throw new Error('claims_mailbox_forbidden');
  }
  if (email !== GARAGE_MAILBOX) {
    throw new Error(`wrong_account:${email || 'unknown'}`);
  }
  const listed = await gmailGet(accessToken, `messages?q=${encodeURIComponent('in:inbox newer_than:14d')}&maxResults=25`);
  const ids = ((listed.messages as Array<{ id?: string }> | undefined) || []).map((m) => String(m.id || '')).filter(Boolean);
  const messages: Array<{
    messageId: string;
    threadId: string;
    subject: string;
    body: string;
    from: string;
    to: string;
    filenames: string[];
    sentAt: string;
    attachments: Array<{ filename: string; mime: string; bytes: ArrayBuffer }>;
  }> = [];
  for (const id of ids) {
    const raw = await gmailGet(accessToken, `messages/${id}?format=full`);
    const payload = (raw.payload || {}) as Record<string, unknown>;
    const headers = payload.headers as Array<{ name?: string; value?: string }> | undefined;
    const collected: Collected = { text: '', filenames: [], parts: [] };
    collectParts(payload, collected);
    if (garageMailIsClaimsMailbox(headerValue(headers, 'To')) || garageMailIsClaimsMailbox(headerValue(headers, 'From'))) {
      continue;
    }
    const attachments: Array<{ filename: string; mime: string; bytes: ArrayBuffer }> = [];
    for (const att of collected.parts.slice(0, 8)) {
      try {
        const bin = await gmailGet(accessToken, `messages/${id}/attachments/${att.attachId}`);
        const data = String(bin.data || '').replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Uint8Array.from(atob(data.padEnd(data.length + (4 - data.length % 4) % 4, '=')), (c) => c.charCodeAt(0)).buffer;
        attachments.push({ filename: att.filename, mime: att.mime, bytes });
      } catch {
        /* keep the mail even if one attachment fails */
      }
    }
    messages.push({
      messageId: id,
      threadId: String(raw.threadId || ''),
      subject: headerValue(headers, 'Subject'),
      body: collected.text.slice(0, 8000),
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To') || GARAGE_MAILBOX,
      filenames: collected.filenames,
      sentAt: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : new Date().toISOString(),
      attachments,
    });
  }
  return { email, messages };
}
