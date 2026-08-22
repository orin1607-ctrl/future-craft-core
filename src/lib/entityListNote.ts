/** Compact one-line preview for vehicle/driver notes on list rows. */

export const LIST_NOTE_MAX_CHARS = 72;

export function compactListNote(notes?: string | null): string {
  const oneLine = String(notes || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return '';
  if (oneLine.length <= LIST_NOTE_MAX_CHARS) return oneLine;
  return `${oneLine.slice(0, LIST_NOTE_MAX_CHARS - 1).trimEnd()}…`;
}

export function vehicleHasListNote(notes?: string | null): boolean {
  return Boolean(String(notes || '').trim());
}
