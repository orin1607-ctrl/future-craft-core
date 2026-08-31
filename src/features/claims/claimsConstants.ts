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

export type ClaimsVehicleHit = {
  id: string;
  license_plate: string;
  company_name: string | null;
  manufacturer: string | null;
  model: string | null;
  internal_number: string | null;
};
