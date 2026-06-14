/** Unified third-party insurance fields — column first, JSON fallback. */

export function parseVehicleInsurances(raw: unknown): {
  third_party?: Record<string, unknown>;
} {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw as { third_party?: Record<string, unknown> };
  try {
    return JSON.parse(String(raw)) as { third_party?: Record<string, unknown> };
  } catch {
    return {};
  }
}

export function getThirdPartyInsuranceExpiry(
  row: {
    third_party_insurance_expiry?: string | null;
    insurances?: unknown;
  },
): string | null {
  if (row.third_party_insurance_expiry) return row.third_party_insurance_expiry;
  const ins = parseVehicleInsurances(row.insurances);
  const end = ins.third_party?.end;
  return end != null && String(end) !== '' ? String(end) : null;
}

export function getThirdPartyInsuranceDocUrl(
  row: {
    third_party_insurance_doc_url?: string | null;
    insurances?: unknown;
  },
): string | null {
  if (row.third_party_insurance_doc_url) return row.third_party_insurance_doc_url;
  const ins = parseVehicleInsurances(row.insurances);
  const link = ins.third_party?.doc_link;
  return link != null && String(link) !== '' ? String(link) : null;
}
