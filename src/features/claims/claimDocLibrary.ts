/** Safe document-library categories from existing doc_kind / staff_type only. No filename guessing. */

export const DOC_LIB_CATEGORIES = [
  { key: 'all', label: 'כל המסמכים' },
  { key: 'client', label: 'מסמכי לקוח' },
  { key: 'vehicle', label: 'מסמכי רכב / נהג' },
  { key: 'insurer', label: 'מסמכי חברת ביטוח' },
  { key: 'surveyor', label: 'מסמכי שמאי' },
  { key: 'invoice', label: 'חשבוניות / מוסך' },
  { key: 'damage', label: 'תמונות אירוע / נזק' },
  { key: 'forms', label: 'טפסים / תצהירים' },
  { key: 'other', label: 'אחר' },
] as const;

export type DocLibCategory = (typeof DOC_LIB_CATEGORIES)[number]['key'];

export const DOC_LIB_SECTIONS: Array<{ key: string; label: string; match: string[] }> = [
  { key: 'client', label: 'מסמכי לקוח', match: ['client'] },
  { key: 'vehicle', label: 'מסמכי רכב / נהג', match: ['vehicle'] },
  { key: 'insurer', label: 'מסמכי חברת ביטוח', match: ['insurer'] },
  { key: 'surveyor_reports', label: 'מסמכי שמאי · דוחות שמאי', match: ['surveyor_reports'] },
  { key: 'surveyor_photos', label: 'מסמכי שמאי · תמונות שמאי', match: ['surveyor_photos'] },
  { key: 'invoice', label: 'חשבוניות / מוסך', match: ['invoice'] },
  { key: 'damage', label: 'תמונות אירוע / נזק', match: ['damage'] },
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

/** One safe bucket. Never infer from the file name. */
export function fileDocBucket(f: LibFile): string {
  const kind = String(f.doc_kind || '');
  const st = staffTypeOf(f);
  if (kind === 'surveyor_report' || kind === 'surveyor_attachment' || st === 'surveyor_report') return 'surveyor_reports';
  if (kind === 'surveyor_photo') return 'surveyor_photos';
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
  if (cat === 'surveyor') return bucket === 'surveyor_reports' || bucket === 'surveyor_photos';
  return bucket === cat;
}

export function libTypeLabel(f: LibFile) {
  const bucket = fileDocBucket(f);
  const hit = DOC_LIB_SECTIONS.find((s) => s.match.includes(bucket));
  return hit?.label.replace(/^מסמכי שמאי · /, '') || 'אחר';
}

export function filesForLibCategory<T extends LibFile>(files: T[], cat: string) {
  return files.filter((f) => fileInLibCategory(f, cat));
}
