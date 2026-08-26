export function lookupLeadNumber(
  rows: { leadNumber: string; phone: string; companyName: string }[],
  phone?: string | null,
  companyName?: string | null,
): string | null {
  const digits = (phone || '').replace(/[^0-9*]/g, '');
  if (digits) {
    const hit = rows.find((row) => (row.phone || '').replace(/[^0-9*]/g, '') === digits);
    if (hit?.leadNumber) return hit.leadNumber;
  }
  const company = (companyName || '').trim().toLowerCase();
  if (company) {
    const hit = rows.find((row) => (row.companyName || '').trim().toLowerCase() === company);
    if (hit?.leadNumber) return hit.leadNumber;
  }
  return null;
}

export function formatLeadTitle(leadNumber?: string | null, companyName?: string | null): string {
  if (leadNumber) return companyName ? `ליד #${leadNumber} — ${companyName}` : `ליד #${leadNumber}`;
  return companyName?.trim() || 'ללא שם';
}
