/** Tri/semi inspection (בדיקת תלת) display helpers — no frequency-rule changes. */

export const TRI_SEMI_INSPECTION_TYPE = 'tri_semi_annual';

/** Format YYYY-MM-DD (and ISO timestamps) as a Hebrew locale date without TZ shift. */
export function formatInspectionDateHe(iso: string | null | undefined): string {
  const raw = (iso || '').trim();
  if (!raw) return '';
  const m = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL');
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('he-IL');
}

export function lastTriInspectionDisplay(iso: string | null | undefined): {
  dateText: string;
  hasDate: boolean;
} {
  const dateText = formatInspectionDateHe(iso);
  return {
    dateText: dateText || 'אין בדיקה קודמת',
    hasDate: Boolean(dateText),
  };
}

export function pickLatestTriInspectionDate(
  rows: Array<{ inspection_date?: string | null; inspection_type?: string | null }>,
): string | null {
  const dates = rows
    .filter((r) => r.inspection_type === TRI_SEMI_INSPECTION_TYPE && r.inspection_date)
    .map((r) => String(r.inspection_date).slice(0, 10))
    .sort((a, b) => b.localeCompare(a));
  return dates[0] || null;
}

/** Same km encoding the tri-semi screen already saves on vehicle_inspections.notes. */
const KM_LINE_RE = /קילומטראז[׳']?\s*:\s*([\d,\.]*)/;

export function parseInspectionNotes(raw: string | null | undefined): {
  km: string;
  generalNotes: string;
} {
  const savedNotes = (raw || '').trim();
  const kmMatch = savedNotes.match(KM_LINE_RE);
  const km = (kmMatch?.[1] || '').trim();
  const generalNotes = savedNotes.replace(KM_LINE_RE, '').trim();
  return { km, generalNotes };
}

export function composeInspectionNotes(odometer: string, generalNotes: string): string {
  const kmLine = `קילומטראז׳: ${odometer}`;
  const notes = (generalNotes || '').trim();
  return notes ? `${kmLine}\n${notes}` : kmLine;
}
