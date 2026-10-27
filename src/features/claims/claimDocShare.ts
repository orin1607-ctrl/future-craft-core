/**
 * claimDocShare.ts
 * Outbound sharing helpers for claim documents (WhatsApp, Email, Native Web Share).
 * Supports direct file attachment sharing (via Web Share API with File),
 * mail composer seeding, WhatsApp direct chat, and fallbacks.
 */

import { withAttachmentParam } from './claimFileDownload';

export type DocShareContext = {
  claimId: string;
  claimNum?: string;
  plate?: string;
  carModel?: string;
  clientName?: string;
};

export type DocShareFile = {
  id: string;
  name: string;
  url: string;
  mime?: string;
};

export function isMobileDevice(customUa?: string): boolean {
  if (customUa) {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(customUa);
  }
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) || (window.innerWidth ? window.innerWidth <= 820 : false);
}

/**
 * Downloads a remote file as a native File object (e.g. to pass to navigator.share).
 */
export async function fetchDocAsFile(url: string, filename: string, mime?: string): Promise<File | null> {
  if (!url) return null;
  try {
    const attached = withAttachmentParam(url, filename);
    const res = await fetch(attached, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = mime || blob.type || (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    return new File([blob], filename, { type });
  } catch (err) {
    console.warn('[claimDocShare] fetchDocAsFile failed', err);
    return null;
  }
}

/**
 * Checks if the browser supports sharing this file via navigator.share.
 */
export function canShareFile(file: File): boolean {
  if (!file || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: unknown) => Promise<void>;
  };
  if (typeof nav.share !== 'function') return false;
  if (typeof nav.canShare === 'function') {
    try {
      return nav.canShare({ files: [file] });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Formats a clear Hebrew subject/title for the document in relation to the claim.
 */
export function buildDocShareTitle(file: { name: string }, ctx: DocShareContext): string {
  const parts: string[] = ['מסמך מתביעה'];
  if (ctx.claimNum || ctx.claimId) parts.push(`מס' ${ctx.claimNum || ctx.claimId}`);
  if (ctx.plate) parts.push(`רכב ${ctx.plate}`);
  parts.push(`· ${file.name}`);
  return parts.join(' ');
}

/**
 * Formats message text for WhatsApp or email.
 */
export function buildDocShareMessage(file: { name: string; url?: string }, ctx: DocShareContext): string {
  const lines: string[] = [
    'שלום,',
    `מצורף מסמך: ${file.name}`,
    `עבור תביעה: ${ctx.claimNum || ctx.claimId}`,
  ];
  if (ctx.plate) lines.push(`מספר רכב: ${ctx.plate}`);
  if (ctx.carModel) lines.push(`דגם: ${ctx.carModel}`);
  if (ctx.clientName) lines.push(`לקוח: ${ctx.clientName}`);
  lines.push('נשלח ממערכת דליה ניהול תביעות');
  return lines.join('\n');
}

/**
 * Formats Israeli mobile phone into international WhatsApp format (e.g. 0501234567 -> 972501234567).
 */
export function formatWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0') && clean.length === 10) {
    return `972${clean.slice(1)}`;
  }
  return clean;
}

/**
 * Shares a document via WhatsApp.
 * - On mobile/supported desktop: attempts native Web Share with the actual attached File first (user selects WhatsApp).
 * - Fallback: opens WhatsApp Web / mobile wa.me with the message pre-filled.
 */
export async function shareDocToWhatsApp(
  file: DocShareFile,
  ctx: DocShareContext,
  targetPhone = '',
  onFallback?: (msg: string) => void,
): Promise<{ success: boolean; method: 'native' | 'wa_link' | 'aborted' | 'error'; error?: string }> {
  const title = buildDocShareTitle(file, ctx);
  const text = buildDocShareMessage(file, ctx);

  // 1. Try native Web Share with the actual File attached
  try {
    const fileObj = await fetchDocAsFile(file.url, file.name, file.mime);
    if (fileObj && canShareFile(fileObj)) {
      const nav = navigator as Navigator & { share: (data: unknown) => Promise<void> };
      await nav.share({
        files: [fileObj],
        title,
        text,
      });
      return { success: true, method: 'native' };
    }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') {
      return { success: false, method: 'aborted' };
    }
    console.info('[claimDocShare] native file share skipped/failed, falling back to WhatsApp link', err);
  }

  // 2. Fallback: wa.me link with message (user selects recipient in WhatsApp)
  const intlPhone = formatWhatsAppPhone(targetPhone);
  const waUrl = intlPhone
    ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  if (onFallback) {
    onFallback('נפתח WhatsApp לשליחה. בחרו איש קשר לאישור השליחה.');
  }

  window.open(waUrl, '_blank', 'noopener');
  return { success: true, method: 'wa_link' };
}

/**
 * Shares a document via Email.
 * - If onEmailCompose handler is provided (system's internal modal), opens it with file attached.
 * - Else tries native share with File.
 * - Fallback: mailto: link with prefilled subject and body.
 */
export async function shareDocToEmail(
  file: DocShareFile,
  ctx: DocShareContext,
  opts?: {
    onInternalCompose?: (seed: { to: string; subject: string; body: string; file_ids: string[] }) => void;
    targetEmail?: string;
  },
): Promise<{ success: boolean; method: 'internal' | 'native' | 'mailto' | 'aborted' }> {
  const subject = buildDocShareTitle(file, ctx);
  const body = buildDocShareMessage(file, ctx);
  const to = opts?.targetEmail || '';

  // 1. If internal mail composer is available, attach the file directly within our system!
  if (opts?.onInternalCompose && file.id) {
    opts.onInternalCompose({
      to,
      subject,
      body,
      file_ids: [file.id],
    });
    return { success: true, method: 'internal' };
  }

  // 2. Try native Web Share with the actual File attached (e.g. mobile mail client)
  try {
    const fileObj = await fetchDocAsFile(file.url, file.name, file.mime);
    if (fileObj && canShareFile(fileObj)) {
      const nav = navigator as Navigator & { share: (data: unknown) => Promise<void> };
      await nav.share({
        files: [fileObj],
        title: subject,
        text: body,
      });
      return { success: true, method: 'native' };
    }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') {
      return { success: false, method: 'aborted' };
    }
    console.info('[claimDocShare] native email share skipped, falling back to mailto', err);
  }

  // 3. Fallback: mailto URL
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, '_self');
  return { success: true, method: 'mailto' };
}
