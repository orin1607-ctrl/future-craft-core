/** Client-side wa.me URL helper. Does not send messages. */

export function normalizeWhatsAppDigits(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

export function buildWaMeUrl(phone: string, text?: string): string {
  const digits = normalizeWhatsAppDigits(phone);
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
