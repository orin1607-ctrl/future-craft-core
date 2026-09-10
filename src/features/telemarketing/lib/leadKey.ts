export function leadKey(phone: string, companyName: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (digits) return `p:${digits}`;
  return `c:${(companyName || '').trim().toLowerCase()}`;
}

export function isUsableLeadKey(key: string): boolean {
  return Boolean(key) && key !== 'c:' && key !== 'p:';
}
