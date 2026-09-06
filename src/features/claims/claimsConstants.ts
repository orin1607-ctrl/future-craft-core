/** GAS v4 constants — unchanged business lists/templates. */

export const STATUSES = [
  'חדש', 'ממתין לטיפול', 'בטיפול',
  'ממתין לחברת ביטוח', 'ממתין לשמאי', 'ממתין למסמכים',
  'ממתין לתשלום', 'אושר לתשלום', 'תשלום חלקי', 'שולם',
  'נדחה', 'הועבר לטיפול משפטי', 'בטיפול משפטי', 'הסתיים',
];

export const LEGAL_REASONS = [
  'דחיית תביעה', 'תשלום חלקי', 'אי תגובה',
  'מחלוקת כספית', 'מחלוקת אחריות', 'עיכוב חריג', 'אחר',
];

export const CLOSE_REASONS = [
  'שולם מלא', 'שולם חלקי', 'נדחה', 'הועבר לטיפול משפטי',
  'נסגר ללא גבייה', 'טעות - ביטול', 'אחר',
];

export const MANDATORY_STATUSES = ['נדחה', 'תשלום חלקי', 'הועבר לטיפול משפטי', 'הסתיים'];

export const CLOSED_STATUSES = ['הסתיים', 'שולם', 'נדחה'];

export const STATUS_UNCHANGED = '__unchanged__';
export const STATUS_MANUAL = '__manual__';

export function isClosedStatus(status: string, archived?: string) {
  return archived === 'true' || CLOSED_STATUSES.includes(status);
}

export const CLAIM_KINDS = [
  'תביעה במסגרת פוליסת הלקוח',
  'תביעת צד ג׳',
] as const;

export const DOC_PRESETS: { key: string; label: string }[] = [
  { key: 'event_form', label: 'טופס אירוע / הודעה על מקרה' },
  { key: 'claim_form', label: 'טופס הגשת תביעה' },
  { key: 'no_claim_form', label: 'טופס אי-הגשת תביעה' },
  { key: 'license_driver', label: 'רישיון נהיגה – שני הצדדים' },
  { key: 'license_vehicle', label: 'רישיון רכב' },
  { key: 'damage_photos', label: 'תמונות נזק / אירוע' },
  { key: 'insurance_history', label: 'עבר ביטוחי' },
  { key: 'third_party', label: 'מסמכי צד ג׳' },
  { key: 'surveyor_report', label: 'דוח שמאי' },
  { key: 'garage_invoice', label: 'חשבונית מוסך' },
];

/** Claim-card document checklist. Keys reuse existing doc_key / staff_type. No doc_kind expansion. */
export type ClaimDocType = {
  key: string;
  label: string;
  group: boolean;
  formLater: boolean;
  staffType: string;
  docKind: string | null;
  extraDocKinds?: string[];
  aliases: string[];
};

export const CLAIM_DOC_TYPES: ClaimDocType[] = [
  { key: 'notice_a', label: 'טופס הודאה א׳', group: false, formLater: true, staffType: 'notice_a', docKind: null, aliases: [] },
  { key: 'notice_ayin', label: 'טופס הודעה ע׳', group: false, formLater: true, staffType: 'notice_ayin', docKind: null, aliases: [] },
  { key: 'no_claim_form', label: 'אישור אי-הגשת תביעה', group: false, formLater: true, staffType: 'no_claim_form', docKind: null, aliases: ['טופס אי-הגשת תביעה'] },
  { key: 'insurance_history', label: 'אישור עבר ביטוחי', group: false, formLater: false, staffType: 'insurance_history', docKind: null, aliases: ['עבר ביטוחי'] },
  { key: 'consent_form', label: 'טופס הסכמה', group: false, formLater: true, staffType: 'consent_form', docKind: null, aliases: [] },
  { key: 'check_photo', label: 'צילום צ׳ק', group: false, formLater: false, staffType: 'check_photo', docKind: null, aliases: [] },
  { key: 'garage_invoice', label: 'חשבונית תיקון', group: false, formLater: false, staffType: 'garage_invoice', docKind: 'garage_invoice', aliases: ['חשבונית מוסך'] },
  { key: 'surveyor_report', label: 'דוח שמאי', group: false, formLater: false, staffType: 'surveyor_report', docKind: 'surveyor_report', extraDocKinds: ['surveyor_attachment'], aliases: [] },
  { key: 'surveyor_photos', label: 'תמונות שמאי', group: true, formLater: false, staffType: '', docKind: 'surveyor_photo', aliases: [] },
  { key: 'damage_photos', label: 'תמונות אירוע', group: true, formLater: false, staffType: 'damage_photos', docKind: null, aliases: ['תמונות נזק / אירוע', 'תמונות נזק'] },
  { key: 'license_driver', label: 'צילום רישיון נהיגה', group: true, formLater: false, staffType: 'driver_license', docKind: null, aliases: ['רישיון נהיגה – שני הצדדים', 'רישיון נהיגה'] },
  { key: 'accident_notice', label: 'טופס פתיחת תביעה חתום', group: false, formLater: false, staffType: 'accident_notice', docKind: null, aliases: ['טופס הודעה על תאונה'] },
  { key: 'license_vehicle', label: 'צילום רישיון רכב', group: false, formLater: false, staffType: 'vehicle_license', docKind: null, aliases: ['רישיון רכב'] },
  { key: 'power_of_attorney', label: 'ייפוי כוח', group: false, formLater: true, staffType: 'power_of_attorney', docKind: null, aliases: [] },
  { key: 'rejection_letter', label: 'מכתב דחייה', group: false, formLater: false, staffType: 'rejection_letter', docKind: null, aliases: [] },
  { key: 'demand_form', label: 'טופס דרישה', group: false, formLater: true, staffType: 'demand_form', docKind: null, aliases: [] },
];

export function claimDocTypeByKey(key: string) {
  return CLAIM_DOC_TYPES.find((t) => t.key === key);
}

export function isCustomerMultiDocKey(key: string) {
  return CLAIM_DOC_TYPES.some((t) => t.key === key && t.group);
}

export function isFormLaterDocKey(key: string) {
  return CLAIM_DOC_TYPES.some((t) => t.key === key && t.formLater);
}

export const TEMPLATES: Record<string, { name: string; subject?: string; body: string }> = {
  request_docs: {
    name: 'בקשת מסמכים',
    subject: 'תביעה {{claimNum}} – בקשת מסמכים',
    body: 'שלום {{clientName}},\n\nבהמשך לתביעה מספר {{claimNum}} עבור רכב {{plate}},\nנבקש בזה להעביר את המסמכים החסרים הבאים:\n\n{{docsList}}\n\nאנא העביר/י את המסמכים בהקדם האפשרי.\n\nבברכה,\nדליה ניהול תביעות',
  },
  status_request: {
    name: 'בקשת סטטוס מחברת ביטוח',
    subject: 'תביעה {{claimNum}} – בקשת עדכון סטטוס',
    body: 'שלום,\n\nאנו פונים בנוגע לתביעה מספר {{claimNum}} עבור מבוטח {{clientName}}, רכב {{plate}}.\n\nנבקש לקבל עדכון לגבי מצב הטיפול בתביעה.\n\nבברכה,\nדליה ניהול תביעות',
  },
  payment_demand: {
    name: 'דרישת תשלום',
    subject: 'תביעה {{claimNum}} – דרישת תשלום יתרה',
    body: 'שלום,\n\nבהמשך לאישורכם לתביעה מספר {{claimNum}},\nסכום שאושר: {{finApproved}}₪\nסכום ששולם: {{finPaid}}₪\nיתרה לתשלום: {{finBalance}}₪\n\nנבקש להעביר את יתרת התשלום בהקדם.\n\nבברכה,\nדליה ניהול תביעות',
  },
  client_reminder: {
    name: 'תזכורת ללקוח',
    subject: 'תיק תביעה {{claimNum}} – תזכורת',
    body: 'שלום {{clientName}},\n\nבהמשך לתביעה שלך מספר {{claimNum}},\nהסטטוס הנוכחי: {{status}}\n\nנבקש ליצור עמך קשר לצורך המשך טיפול.\nאנא פנה/י אלינו בהקדם.\n\nבברכה,\nדליה ניהול תביעות',
  },
  legal_transfer: {
    name: 'העברה לטיפול משפטי',
    subject: 'תביעה {{claimNum}} – הודעה על העברה לטיפול משפטי',
    body: 'שלום,\n\nלאחר מספר ניסיונות לפתרון תביעה מספר {{claimNum}} עבור {{clientName}},\nאנו נאלצים להודיע כי התיק מועבר לטיפול משפטי.\n\nסיבת ההעברה: {{legalReason}}\n\nכל פנייה מעכשיו תנותב לעורך הדין המטפל.\n\nבברכה,\nדליה ניהול תביעות',
  },
  wa_status: {
    name: 'WhatsApp – בקשת סטטוס',
    body: 'שלום, בהמשך לתביעה מס\' {{claimNum}} ({{clientName}} / {{plate}})\nנשמח לקבל עדכון לגבי מצב הטיפול. תודה.',
  },
  wa_docs: {
    name: 'WhatsApp – בקשת מסמכים',
    body: 'שלום {{clientName}}, בהמשך לתביעה שלך – נבקש לשלוח את המסמכים החסרים כדי שנוכל להמשיך בטיפול. תודה.',
  },
  wa_payment: {
    name: 'WhatsApp – תזכורת תשלום',
    body: 'שלום, בהמשך לאישור תביעה מס\' {{claimNum}} – ישנה יתרה פתוחה של {{finBalance}}₪. נבקש לסדר את התשלום. תודה.',
  },
};

export type ClaimsActor = {
  id: string;
  full_name: string;
  email?: string;
  role?: string;
  hasClaimsAccess?: boolean;
};

export type ClaimRecord = Record<string, string> & { id: string };

export const DOCS_ORDER: Array<{ key: string; label: string }> = [
  { key: 'needs_sort', label: 'תיק ישן / דורש סידור מסמכים' },
  { key: 'in_progress', label: 'בטיפול' },
  { key: 'organized', label: 'תיק מסודר' },
];

export function workClaimNum(c: { claimNum?: string } | null | undefined): string {
  return String(c?.claimNum || '').trim();
}

export function displayClaimNum(c: { claimNum?: string } | null | undefined): string {
  return workClaimNum(c) || 'טרם התקבל';
}

export function mailClaimLabel(c: { claimNum?: string; clientName?: string } | null | undefined): string {
  const num = workClaimNum(c);
  const name = String(c?.clientName || '').trim();
  if (num && name) return `תביעה ${num} – ${name}`;
  if (num) return `תביעה ${num}`;
  if (name) return `תביעה – ${name}`;
  return 'תביעה';
}

export function docsOrderOf(c: { docsOrderStatus?: string } | null | undefined): string {
  return String(c?.docsOrderStatus || '').trim();
}

export function docsOrderLabel(key: string): string {
  return DOCS_ORDER.find((x) => x.key === key)?.label || '';
}

export function claimNeedsReturn(c: ClaimRecord): boolean {
  if (isClosedStatus(c.status, c.archived)) return false;
  return Boolean(String(c.nextDate || '').trim());
}

export function claimHasNextAction(c: ClaimRecord): boolean {
  if (c.archived === 'true') return true;
  if (isClosedStatus(c.status, c.archived)) return true;
  return Boolean(String(c.nextDate || '').trim());
}

export type ClaimsVehicleHit = {
  id: string;
  license_plate: string;
  company_name: string | null;
  manufacturer: string | null;
  model: string | null;
  internal_number: string | null;
};
