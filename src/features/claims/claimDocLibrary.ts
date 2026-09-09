/** Safe gallery categories from existing doc_kind / staff_type only. No filename guessing. */

export const DOC_LIB_CATEGORIES = [
  { key: 'all', label: 'כל הגלריה' },
  { key: 'surveyor_reports', label: 'דוחות שמאי' },
  { key: 'surveyor_photos', label: 'תמונות שמאי' },
  { key: 'garage_photos', label: 'תמונות מוסך' },
  { key: 'damage', label: 'תמונות נזק / תאונה' },
  { key: 'client', label: 'מסמכי לקוח' },
  { key: 'vehicle', label: 'מסמכי רכב / נהג' },
  { key: 'insurer', label: 'מסמכי חברת ביטוח' },
  { key: 'invoice', label: 'חשבוניות / מוסך' },
  { key: 'forms', label: 'טפסים / תצהירים' },
  { key: 'other', label: 'אחר' },
] as const;

export type DocLibCategory = (typeof DOC_LIB_CATEGORIES)[number]['key'];

/** Visual groups only. Same buckets — no new classification. */
export const DOC_LIB_GROUPS: Array<{ key: string; label: string; keys: string[] }> = [
  { key: 'photos', label: 'תמונות', keys: ['surveyor_photos', 'garage_photos', 'damage'] },
  { key: 'reports', label: 'דוחות', keys: ['surveyor_reports'] },
  { key: 'docs', label: 'מסמכים', keys: ['client', 'vehicle', 'insurer', 'invoice', 'forms', 'other'] },
];

export const DOC_LIB_SECTIONS: Array<{ key: string; label: string; match: string[] }> = [
  { key: 'surveyor_reports', label: 'דוחות שמאי', match: ['surveyor_reports'] },
  { key: 'surveyor_photos', label: 'תמונות שמאי', match: ['surveyor_photos'] },
  { key: 'garage_photos', label: 'תמונות מוסך', match: ['garage_photos'] },
  { key: 'damage', label: 'תמונות נזק / תאונה', match: ['damage'] },
  { key: 'client', label: 'מסמכי לקוח', match: ['client'] },
  { key: 'vehicle', label: 'מסמכי רכב / נהג', match: ['vehicle'] },
  { key: 'insurer', label: 'מסמכי חברת ביטוח', match: ['insurer'] },
  { key: 'invoice', label: 'חשבוניות / מוסך', match: ['invoice'] },
  { key: 'forms', label: 'טפסים / תצהירים', match: ['forms'] },
  { key: 'other', label: 'אחר', match: ['other'] },
];

type LibFile = {
  id: string;
  source?: string;
  doc_kind?: string;
  doc_meta?: Record<string, string> | null;
};

function staffTypeOf(f: LibFile) {
  const meta = f.doc_meta && typeof f.doc_meta === 'object' ? f.doc_meta : {};
  return String(meta.staff_type || '');
}

/** One safe bucket. Never infer from the file name. Does not change stored classification. */
export function fileDocBucket(f: LibFile): string {
  const kind = String(f.doc_kind || '');
  const st = staffTypeOf(f);
  if (kind === 'surveyor_report' || kind === 'surveyor_attachment' || st === 'surveyor_report') return 'surveyor_reports';
  if (kind === 'surveyor_photo') return 'surveyor_photos';
  if (kind === 'garage_photo' || st === 'garage_photos') return 'garage_photos';
  if (kind === 'garage_invoice' || st === 'garage_invoice') return 'invoice';
  if (st === 'damage_photos') return 'damage';
  if (st === 'driver_license' || st === 'vehicle_license') return 'vehicle';
  if (st === 'insurance_history' || st === 'rejection_letter' || st === 'demand_form' || st === 'policy') return 'insurer';
  if (
    st === 'accident_notice'
    || st === 'consent_form'
    || st === 'power_of_attorney'
    || st === 'no_claim_form'
    || st === 'notice_a'
    || st === 'notice_ayin'
    || st === 'check_photo'
  ) return 'forms';
  if (f.source === 'customer') return 'client';
  return 'other';
}

export function fileInLibCategory(f: LibFile, cat: string) {
  if (!cat || cat === 'all') return true;
  const bucket = fileDocBucket(f);
  const sec = DOC_LIB_SECTIONS.find((s) => s.key === cat);
  if (sec) return sec.match.includes(bucket);
  return bucket === cat;
}

export function libTypeLabel(f: LibFile) {
  const bucket = fileDocBucket(f);
  const hit = DOC_LIB_SECTIONS.find((s) => s.match.includes(bucket));
  return hit?.label || 'אחר';
}

export function filesForLibCategory<T extends LibFile>(files: T[], cat: string) {
  return files.filter((f) => fileInLibCategory(f, cat));
}
