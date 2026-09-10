/** Customer-request helpers on existing claims_tasks + claims_doc_requests + claims_config. No new tables. */

import { CLAIM_DOC_TYPES, type ClaimRecord } from './claimsConstants';

export const CUSTOMER_REQUEST_TEMPLATE_KEY = 'CUSTOMER_REQUEST_TEMPLATES';

export type CustomerRequestKindKey =
  | 'send_doc'
  | 'complete_form'
  | 'sign_doc'
  | 'affidavit'
  | 'schedule_surveyor'
  | 'present_car'
  | 'contact'
  | 'free'
  | 'other';

export type CustomerRequestTemplate = {
  id: string;
  name: string;
  kind: CustomerRequestKindKey;
  letterTo: string;
  letterSubject: string;
  letterBody: string;
  needsSignature: boolean;
  builtin?: boolean;
};

export function fillClaimPlaceholders(text: string, claim: Record<string, string>) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => String(claim[k] || '').trim());
}

export function todayHeDate() {
  return new Date().toLocaleDateString('he-IL');
}

export const DEFAULT_REQUEST_TEMPLATES: CustomerRequestTemplate[] = [
  {
    id: 'tpl-affidavit-insurer',
    name: 'תצהיר לחברת ביטוח',
    kind: 'affidavit',
    letterTo: '{{insCompany}}',
    letterSubject: 'תצהיר — תביעה {{claimNum}} / רכב {{plate}}',
    letterBody:
      'אני הח״מ {{clientName}}, בעל/ת הרכב שמספרו {{plate}}, מצהיר/ה בזאת כי הפרטים שמסרתי בקשר לאירוע מיום {{eventDate}} נכונים ומדויקים.\n\nהנני מתחייב/ת להודיע על כל שינוי מהותי ולשתף פעולה לצורך בירור התביעה.\n\nולראיה באתי על החתום.',
    needsSignature: true,
    builtin: true,
  },
  {
    id: 'tpl-demand-insurer',
    name: 'דרישה לחברת ביטוח',
    kind: 'free',
    letterTo: '{{insCompany}}',
    letterSubject: 'דרישה — תביעה {{claimNum}} / {{clientName}} / {{plate}}',
    letterBody:
      'הנדון: דרישה להמשך טיפול / תשלום בגין תביעה {{claimNum}}.\n\nמבוטח: {{clientName}}\nרכב: {{plate}}\nאירוע: {{eventDate}}\n\nנודה לקבלת עדכון מנומק ולהשלמת הטיפול בהקדם.',
    needsSignature: false,
    builtin: true,
  },
  {
    id: 'tpl-client-declaration',
    name: 'אישור / הצהרת לקוח',
    kind: 'sign_doc',
    letterTo: '{{clientName}}',
    letterSubject: 'הצהרת לקוח — תביעה {{claimNum}}',
    letterBody:
      'שלום {{clientName}},\n\nנא לקרוא את ההצהרה שלהלן, לחתום במקום המיועד ולהחזיר בקישור.\n\nאני מאשר/ת כי הפרטים שנמסרו בקשר לתביעה {{claimNum}} (רכב {{plate}}) נכונים, וכי ידוע לי שהמסמך ישמר בתיק התביעה.',
    needsSignature: true,
    builtin: true,
  },
  {
    id: 'tpl-missing-doc',
    name: 'בקשת מסמך חסר',
    kind: 'send_doc',
    letterTo: '{{clientName}}',
    letterSubject: 'תביעה {{claimNum}} — מסמך חסר',
    letterBody:
      'שלום {{clientName}},\n\nבהמשך לתביעה {{claimNum}} עבור רכב {{plate}}, נבקש להעלות בקישור את המסמך החסר.\n\nתודה על שיתוף הפעולה.',
    needsSignature: false,
    builtin: true,
  },
];

export function parseRequestTemplates(raw: string): CustomerRequestTemplate[] {
  if (!String(raw || '').trim()) return DEFAULT_REQUEST_TEMPLATES.map((t) => ({ ...t }));
  try {
    const parsed = JSON.parse(raw) as CustomerRequestTemplate[];
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_REQUEST_TEMPLATES.map((t) => ({ ...t }));
    return parsed.filter((t) => t && t.id && t.name).map((t) => ({
      id: String(t.id),
      name: String(t.name),
      kind: (t.kind || 'free') as CustomerRequestKindKey,
      letterTo: String(t.letterTo || ''),
      letterSubject: String(t.letterSubject || ''),
      letterBody: String(t.letterBody || ''),
      needsSignature: t.needsSignature === true,
      builtin: t.builtin === true,
    }));
  } catch {
    return DEFAULT_REQUEST_TEMPLATES.map((t) => ({ ...t }));
  }
}

export function applyTemplateToClaim(tpl: CustomerRequestTemplate, claim: Record<string, string>) {
  return {
    kind: tpl.kind,
    letterTo: fillClaimPlaceholders(tpl.letterTo, claim),
    letterSubject: fillClaimPlaceholders(tpl.letterSubject, claim),
    letterBody: fillClaimPlaceholders(tpl.letterBody, claim),
    needsSignature: tpl.needsSignature,
  };
}

export function kindNeedsSignature(kind: string) {
  return kind === 'affidavit' || kind === 'sign_doc';
}

export function kindNeedsUpload(kind: string) {
  return kind === 'send_doc' || kind === 'complete_form' || kind === 'sign_doc' || kind === 'affidavit' || kind === 'free' || kind === 'other';
}

export function staffTypeForRequest(kind: string, docKey: string) {
  const hit = CLAIM_DOC_TYPES.find((t) => t.key === docKey);
  if (hit?.staffType) return hit.staffType;
  if (kind === 'affidavit' || kind === 'sign_doc') return 'consent_form';
  if (kind === 'complete_form') return 'demand_form';
  return 'other';
}

export function customerWaitSuffix(t: ClaimRecord): string {
  const kind = String(t.customerKind || '');
  if (kind === 'affidavit') return 'תצהיר';
  if (kind === 'sign_doc') return 'חתימה';
  if (kind === 'complete_form') return 'טופס';
  if (kind === 'schedule_surveyor') return 'תיאום שמאי';
  if (kind === 'present_car') return 'העמדת רכב';
  if (kind === 'contact') return 'יצירת קשר';
  const doc = String(t.docLabel || '').trim();
  if (doc) return doc.replace(/^צילום /, '').replace(/^טופס /, '');
  if (kind === 'send_doc') return 'מסמך חסר';
  const action = String(t.action || '').replace(/^בקשה ללקוח — /, '').trim();
  if (action && action !== 'בקשה ללקוח') return action;
  return 'בקשה';
}

export function customerTableLabel(t: ClaimRecord): string {
  const st = t.audience === 'customer' ? (t.customerStatus || (t.done === 'true' ? 'done' : 'pending')) : '';
  if (st === 'done' || st === 'cancelled' || t.done === 'true') return '';
  if (st === 'received') return 'התקבל — לבדיקה';
  return `ממתין ללקוח — ${customerWaitSuffix(t)}`;
}

export function publicLetterFromTask(rd: Record<string, string>) {
  return {
    title: rd.action || rd.letterSubject || '',
    date: rd.letterDate || '',
    to: rd.letterTo || '',
    subject: rd.letterSubject || '',
    body: rd.letterBody || rd.requestText || '',
    needsSignature: rd.needsSignature === 'true',
    kind: rd.customerKind || '',
    allowUpload: rd.allowUpload !== 'false',
  };
}
