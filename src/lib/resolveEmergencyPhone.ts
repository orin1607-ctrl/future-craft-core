const HARDCODED_FALLBACKS = new Set(['*8888', '8888', '100', '*100']);

export function isHardcodedEmergencyFallback(value: string | null | undefined): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/[^\d*]/g, '');
  return HARDCODED_FALLBACKS.has(trimmed) || HARDCODED_FALLBACKS.has(digits);
}

/**
 * Company emergency phone, then Dalia phone. Never invent *8888 / 100.
 * A leftover category value of *8888/100 is treated as unset.
 */
export function resolveEmergencyDialNumber(params: {
  companyEmergencyPhone?: string | null;
  daliaPhone?: string | null;
  categoryPhone?: string | null;
}): string {
  const candidates = [
    params.companyEmergencyPhone,
    params.daliaPhone,
    params.categoryPhone,
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate || '').trim();
    if (trimmed && !isHardcodedEmergencyFallback(trimmed)) return trimmed;
  }
  return '';
}
