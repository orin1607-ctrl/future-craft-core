import {
  DEFAULT_SHARE_TTL,
  SHARE_TTL_PRESETS,
  resolveShareExpiry,
  sharePublicUrl,
  type ShareRow,
  shareStatusOf,
  shareStatusLabel,
} from './claimSecureShare';

export type ClaimPackageCategoryKey =
  | 'claim_details'
  | 'our_surveyor'
  | 'counter_surveyor'
  | 'invoices'
  | 'payments'
  | 'letters'
  | 'damage_photos'
  | 'legal_reports'
  | 'other_docs';

export interface CategoryDef {
  key: ClaimPackageCategoryKey;
  label: string;
  icon: string;
  color: string;
}

export const CLAIM_PACKAGE_CATEGORIES: CategoryDef[] = [
  { key: 'legal_reports', label: 'דוחות משפטיים', icon: '⚖️', color: '#6366f1' },
  { key: 'our_surveyor', label: 'חוות דעת שמאי מקורית', icon: '📋', color: '#0284c7' },
  { key: 'counter_surveyor', label: 'שומה נגדית', icon: '🔍', color: '#d97706' },
  { key: 'invoices', label: 'חשבוניות וקבלות', icon: '🧾', color: '#10b981' },
  { key: 'payments', label: 'הודעות תשלום', icon: '💳', color: '#059669' },
  { key: 'letters', label: 'התכתבויות ומכתבי ביטוח', icon: '✉️', color: '#8b5cf6' },
  { key: 'claim_details', label: 'פרטי תביעה וטפסי תאונה', icon: '📝', color: '#3b82f6' },
  { key: 'damage_photos', label: 'תמונות נזק', icon: '📷', color: '#ec4899' },
  { key: 'other_docs', label: 'מסמכים נוספים', icon: '📎', color: '#64748b' },
];

export interface DocItem {
  id: string;
  original_name: string;
  mime_type?: string;
  byte_size?: number;
  doc_kind?: string;
  doc_meta?: Record<string, any> | null;
  category: ClaimPackageCategoryKey;
  page_count?: number;
}

export function classifyClaimDoc(f: {
  id: string;
  original_name: string;
  mime_type?: string;
  doc_kind?: string;
  doc_meta?: Record<string, any> | null;
}): ClaimPackageCategoryKey {
  const name = String(f.original_name || '').toLowerCase();
  const kind = String(f.doc_kind || '');
  const meta = f.doc_meta && typeof f.doc_meta === 'object' ? f.doc_meta : {};
  const st = String(meta.staff_type || '');
  const text = String(meta.read_text || '').toLowerCase();
  const isImg = /^image\//i.test(f.mime_type || '') || /\.(jpe?g|png|gif|webp)$/i.test(name);

  // 1. Legal reports
  if (
    name.includes('תדריך') ||
    name.includes('אינדקס') ||
    name.includes('טבלת_השוואת') ||
    name.includes('דוח_כספי') ||
    name.includes('רשימת_מסמכים_חסרים') ||
    name.startsWith('01_') ||
    name.startsWith('02_') ||
    name.startsWith('03_') ||
    name.startsWith('04_') ||
    name.startsWith('05_')
  ) {
    return 'legal_reports';
  }

  // 2. Counter surveyor
  if (
    name.includes('נגדית') ||
    name.includes('אהרונסון') ||
    meta.is_counter === true ||
    text.includes('חוות דעת נגדית') ||
    text.includes('שמאות נגדית')
  ) {
    return 'counter_surveyor';
  }

  // 3. Our surveyor
  if (
    name.includes('ויינהאוז') ||
    name.includes('שומת_שמאי') ||
    name.includes('גליל גולן') ||
    text.includes('גליל גולן שמאות') ||
    (kind === 'surveyor_report' && !name.includes('נגדית') && !name.includes('אהרונסון'))
  ) {
    return 'our_surveyor';
  }

  // 4. Invoices
  if (
    st === 'garage_invoice' ||
    st === 'fee_invoice' ||
    name.includes('חשבון') ||
    name.includes('חשבונית') ||
    name.includes('קבלה') ||
    name.includes('2503') ||
    name.includes('1263') ||
    text.includes('חשבון עיסקה') ||
    text.includes('שכר טרחת שמאי') ||
    text.includes('יוני מרכז הפגושים')
  ) {
    return 'invoices';
  }

  // 5. Payments
  if (
    st === 'payment_notice' ||
    st === 'check_photo' ||
    name.includes('תשלום') ||
    name.includes('סילוק') ||
    name.includes('הודעת תשלום') ||
    text.includes('הודעת תשלום') ||
    text.includes('הודעת סילוק') ||
    text.includes('וסילוק תביעה')
  ) {
    return 'payments';
  }

  // 6. Claim details & accident forms
  if (
    st === 'accident_notice' ||
    st === 'claim_form' ||
    st === 'consent_form' ||
    st === 'driver_license' ||
    st === 'vehicle_license' ||
    st === 'power_of_attorney' ||
    name.includes('טופס הודעה') ||
    name.includes('כתבי הסכמה') ||
    name.includes('רישיון') ||
    text.includes('טופס הודעה על תאונה') ||
    text.includes('כתב הסכמה למסירת מידע')
  ) {
    return 'claim_details';
  }

  // 7. Correspondence & insurer letters
  if (
    st === 'rejection_letter' ||
    st === 'demand_form' ||
    st === 'policy' ||
    name.includes('מכתב') ||
    name.includes('דרישת מסמכים') ||
    name.includes('התכתבות') ||
    text.includes('עדכון על קבלת מסמכים') ||
    text.includes('מסמכים חסרים') ||
    text.includes('חוק חוזה הביטוח')
  ) {
    return 'letters';
  }

  // 8. Damage photos
  if (isImg) {
    return 'damage_photos';
  }

  return 'other_docs';
}

export function formatPackageEmailBody(params: {
  claimId: string;
  clientName: string;
  plate: string;
  insCompany: string;
  customNote?: string;
  shareUrl?: string;
  expiresText?: string;
  fileCount: number;
  totalMb: string;
}): string {
  const note = params.customNote ? `${params.customNote}\n\n` : '';
  const urlSection = params.shareUrl
    ? `קישור מאובטח לצפייה ולהורדת חבילת המסמכים:\n${params.shareUrl}\n(הקישור מוגבל בזמן ופעיל עד: ${params.expiresText || '—'})\n\nניתן להוריד את כל החבילה כקובץ ZIP אחד בלחיצה, או לפתוח כל מסמך בנפרד.`
    : `[קישור החבילה יופק ויוטמע כאן]`;

  return `שלום רב,\n\n${note}בהמשך לטיפול בתביעת הנזק של ${params.clientName} (תיק: ${params.claimId}, רכב מ.ר. ${params.plate}) מול חברת הביטוח ${params.insCompany},\nמצורפת חבילת המסמכים המלאה שהוכנה במערכת דליה לעיון, לבדיקה ולהמשך טיפול.\n\nפרטי התביעה ומסמכי המקור הקיימים בתיק:\n• מספר תיק דליה: ${params.claimId}\n• מספר רישוי רכב: ${params.plate}\n• שם לקוח / נהג: ${params.clientName}\n• חברת ביטוח: ${params.insCompany}\n\nחבילת המסמכים כוללת ${params.fileCount} קבצים (נפח כולל: ${params.totalMb} MB) המסודרים לפי קטגוריות:\nדוחות משפטיים, חוות דעת שמאי מקורית, שומה נגדית, חשבוניות וקבלות, הודעות תשלום, טפסי תאונה ותמונות נזק.\n\nיתרת התביעה והסכומים שבמחלוקת מפורטים בחוות הדעת ובטבלת ההשוואה המצורפות לעיון ולבדיקה משפטית.\n\n${urlSection}\n\nבברכה,\nצוות ניהול תביעות — DALIA Claims`;
}
