/** Canonical fault type labels for reporting UI — keep legacy values; extend only. */
export const FAULT_TYPE_OPTIONS = [
  'הרכב לא מניע',
  'הרכב נכבה',
  'נורת אזהרה',
  'התחממות מנוע',
  'תקלה במצבר',
  'פנצ׳ר',
  'תקלה בבלמים',
  'תקלה בהגה',
  'תקלה בגיר',
  'תקלה במזגן',
  'רעש חריג',
  'נזילת שמן או מים',
  'תקלה חשמלית',
  'נזק לרכב',
  'נדרשת גרירה',
  'הרכב מושבת',
  // legacy (do not remove — existing rows)
  'מנוע',
  'בלמים',
  'צמיגים',
  'חשמל',
  'מיזוג',
  'פחחות',
  'תאורה',
  'אחר',
] as const;

/** Options shown in the picker (new preferred labels + אחר). Legacy still valid in DB. */
export const FAULT_TYPE_PICKER = [
  'הרכב לא מניע',
  'הרכב נכבה',
  'נורת אזהרה',
  'התחממות מנוע',
  'תקלה במצבר',
  'פנצ׳ר',
  'תקלה בבלמים',
  'תקלה בהגה',
  'תקלה בגיר',
  'תקלה במזגן',
  'רעש חריג',
  'נזילת שמן או מים',
  'תקלה חשמלית',
  'נזק לרכב',
  'נדרשת גרירה',
  'הרכב מושבת',
  'אחר',
] as const;

export function faultTypeDisplay(faultType: string | null | undefined, other?: string | null): string {
  if (!faultType) return '—';
  if (faultType === 'אחר' && other?.trim()) return `אחר: ${other.trim()}`;
  return faultType;
}
