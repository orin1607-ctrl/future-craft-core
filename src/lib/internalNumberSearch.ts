/** Exact internal-number match first. "19" ≠ "019". */

export function sortByExactInternalNumberFirst<T extends { internal_number?: string | null }>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim();
  if (!q) return rows;
  return [...rows].sort((a, b) => {
    const aExact = (a.internal_number || '') === q;
    const bExact = (b.internal_number || '') === q;
    if (aExact === bExact) return 0;
    return aExact ? -1 : 1;
  });
}
