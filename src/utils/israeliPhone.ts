/**
 * Shared Israeli mobile phone helpers for WhatsApp deep-links (wa.me).
 * Canonical driver-card field: drivers.phone (same in Staging + Production).
 *
 * Accepted inputs (spaces/dashes/plus ok):
 *   054XXXXXXX | 054-XXXXXXX | 97254XXXXXXX | +97254XXXXXXX | 54XXXXXXX
 * Normalized output: 9725XXXXXXXX
 */

export function normalizeIsraeliPhoneForWhatsApp(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let digits = String(raw).trim().replace(/\D/g, '');
  if (!digits) return null;

  // International prefix 00…
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('972')) {
    // Fix mistaken 9720… (country code + local leading zero)
    if (digits.startsWith('9720')) digits = `972${digits.slice(4)}`;
  } else if (digits.startsWith('0')) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith('5')) {
    // local mobile without leading 0
    digits = `972${digits}`;
  } else {
    return null;
  }

  // Israeli mobile: 972 + 5XXXXXXXX (12 digits)
  if (!/^9725\d{8}$/.test(digits)) return null;
  return digits;
}

/** Build wa.me URL that opens the driver's chat directly (not the contact picker). */
export function buildWaMeUrl(phone: string, message: string): string | null {
  const dest = normalizeIsraeliPhoneForWhatsApp(phone);
  if (!dest) return null;
  return `https://wa.me/${dest}?text=${encodeURIComponent(message)}`;
}

/** True when the raw value can be used for a direct WhatsApp chat link. */
export function hasWhatsAppPhone(raw: string | null | undefined): boolean {
  return normalizeIsraeliPhoneForWhatsApp(raw) != null;
}
