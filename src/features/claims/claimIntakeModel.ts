import { CLAIM_KINDS } from './claimsConstants';

export type IntakeDraft = Record<string, string>;

export const INS_TYPES = ['חובה', 'מקיף', "צד ג'"] as const;
export const CAR_TYPES = ['פרטי', 'מסחרי', 'רכב כבד מעל 4 טון', 'רכב קל'] as const;
export const DAMAGE_ZONES = ['חזית', 'אחור', 'ימין', 'שמאל', 'גג'] as const;
export const TRIP_PURPOSES = [
  { key: 'work_to', label: 'בדרך לעבודה' },
  { key: 'work_from', label: 'בדרך ממקום העבודה' },
  { key: 'during_work', label: 'במהלך העבודה' },
  { key: 'other', label: 'אחר' },
] as const;

/** Binding 1:1 catalog vs טופס "הודעה על תאונת רכב". Keys persist in existing claims_records.row_data. */
export const ACCIDENT_NOTICE_FIELDS: Array<{
  key: string;
  formLabel: string;
  section: string;
  reuse: boolean;
  autofill: string;
}> = [
  { key: 'reporterName', formLabel: 'זהות המדווח', section: 'א. מבוטח ופוליסה', reuse: false, autofill: 'clientName' },
  { key: 'reporterId', formLabel: 'ת״ז מדווח', section: 'א. מבוטח ופוליסה', reuse: false, autofill: 'clientId' },
  { key: 'reporterPhone', formLabel: 'טלפון מדווח', section: 'א. מבוטח ופוליסה', reuse: false, autofill: 'clientPhone' },
  { key: 'clientName', formLabel: 'שם המבוטח', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'clientName' },
  { key: 'clientId', formLabel: 'מס׳ ת.ז.', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'clientId' },
  { key: 'licensedDealer', formLabel: 'עוסק מורשה כן/לא', section: 'א. מבוטח ופוליסה', reuse: false, autofill: '' },
  { key: 'clientAddress', formLabel: 'כתובת', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'clientAddress' },
  { key: 'addressStreet', formLabel: 'רחוב', section: 'א. מבוטח ופוליסה', reuse: false, autofill: 'clientAddress' },
  { key: 'addressCity', formLabel: 'ישוב', section: 'א. מבוטח ופוליסה', reuse: false, autofill: '' },
  { key: 'clientZip', formLabel: 'מיקוד', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'clientZip' },
  { key: 'phoneHome', formLabel: 'טלפון בית', section: 'א. מבוטח ופוליסה', reuse: false, autofill: '' },
  { key: 'phoneMobile', formLabel: 'טלפון נייד', section: 'א. מבוטח ופוליסה', reuse: false, autofill: 'clientPhone' },
  { key: 'clientPhone', formLabel: 'טלפון (קיים במערכת)', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'clientPhone' },
  { key: 'clientFax', formLabel: 'פקס', section: 'א. מבוטח ופוליסה', reuse: false, autofill: '' },
  { key: 'clientEmail', formLabel: 'דואר אלקטרוני', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'clientEmail' },
  { key: 'agentName', formLabel: 'שם הסוכן', section: 'א. מבוטח ופוליסה', reuse: false, autofill: '' },
  { key: 'policyNum', formLabel: 'מס׳ הפוליסה', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'policyNum' },
  { key: 'policyValidUntil', formLabel: 'בתוקף עד', section: 'א. מבוטח ופוליסה', reuse: false, autofill: '' },
  { key: 'insType', formLabel: 'סוג ביטוח', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'insType' },
  { key: 'insCompany', formLabel: 'חברת הביטוח', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'insCompany' },
  { key: 'claimNum', formLabel: 'מספר תביעה בחברת הביטוח', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'claimNum' },
  { key: 'claimKind', formLabel: 'סוג התביעה (פנימי קיים)', section: 'א. מבוטח ופוליסה', reuse: true, autofill: 'claimKind' },
  { key: 'carType', formLabel: 'סוג הרכב', section: 'א. רכב', reuse: true, autofill: 'carType' },
  { key: 'carMake', formLabel: 'תוצר', section: 'א. רכב', reuse: true, autofill: 'carMake' },
  { key: 'carModel', formLabel: 'דגם', section: 'א. רכב', reuse: true, autofill: 'carModel' },
  { key: 'carYear', formLabel: 'שנת ייצור', section: 'א. רכב', reuse: true, autofill: 'carYear' },
  { key: 'plate', formLabel: 'מס׳ רישוי', section: 'א. רכב', reuse: true, autofill: 'plate' },
  { key: 'vehicleOwnerName', formLabel: 'שם בעל הרכב', section: 'א. רכב', reuse: false, autofill: 'clientName' },
  { key: 'driverDifferent', formLabel: 'הנהג שונה מהמבוטח', section: 'ב. נהג', reuse: true, autofill: 'driverDifferent' },
  { key: 'driverName', formLabel: 'שם הנהג', section: 'ב. נהג', reuse: true, autofill: 'driverName|clientName' },
  { key: 'driverId', formLabel: 'מס׳ ת.ז. נהג', section: 'ב. נהג', reuse: true, autofill: 'driverId|clientId' },
  { key: 'driverAddress', formLabel: 'כתובת נהג', section: 'ב. נהג', reuse: false, autofill: 'clientAddress' },
  { key: 'driverStreet', formLabel: 'רחוב נהג', section: 'ב. נהג', reuse: false, autofill: '' },
  { key: 'driverCity', formLabel: 'ישוב נהג', section: 'ב. נהג', reuse: false, autofill: '' },
  { key: 'driverZip', formLabel: 'מיקוד נהג', section: 'ב. נהג', reuse: false, autofill: 'clientZip' },
  { key: 'driverPhoneHome', formLabel: 'טלפון בית נהג', section: 'ב. נהג', reuse: false, autofill: '' },
  { key: 'driverPhoneMobile', formLabel: 'טלפון נייד נהג', section: 'ב. נהג', reuse: false, autofill: 'driverPhone|clientPhone' },
  { key: 'driverPhone', formLabel: 'טלפון נהג (קיים)', section: 'ב. נהג', reuse: true, autofill: 'driverPhone' },
  { key: 'driverBirthDate', formLabel: 'תאריך לידה', section: 'ב. נהג', reuse: true, autofill: 'driverBirthDate' },
  { key: 'driverGender', formLabel: 'מין', section: 'ב. נהג', reuse: true, autofill: 'driverGender' },
  { key: 'driverLicense', formLabel: 'מס׳ רישיון נהיגה', section: 'ב. נהג', reuse: true, autofill: 'driverLicense' },
  { key: 'driverLicenseType', formLabel: 'סוג רישיון', section: 'ב. נהג', reuse: true, autofill: 'driverLicenseType' },
  { key: 'driverLicenseValid', formLabel: 'תוקף רישיון', section: 'ב. נהג', reuse: true, autofill: 'driverLicenseValid' },
  { key: 'driverLicenseYear', formLabel: 'שנת הוצאת רישיון', section: 'ב. נהג', reuse: true, autofill: 'driverLicenseYear' },
  { key: 'driverPermission', formLabel: 'האם נהג ברשות מבוטח', section: 'ב. נהג', reuse: true, autofill: 'driverPermission' },
  { key: 'eventDate', formLabel: 'תאריך התאונה', section: 'ג. תאונה', reuse: true, autofill: 'eventDate' },
  { key: 'eventTime', formLabel: 'שעה', section: 'ג. תאונה', reuse: true, autofill: 'eventTime' },
  { key: 'eventPlace', formLabel: 'מקום/כתובת אתר התאונה', section: 'ג. תאונה', reuse: true, autofill: 'eventPlace' },
  { key: 'eventCity', formLabel: 'ישוב אתר התאונה', section: 'ג. תאונה', reuse: true, autofill: 'eventCity' },
  { key: 'eventStreet', formLabel: 'רחוב אתר התאונה', section: 'ג. תאונה', reuse: true, autofill: 'eventStreet' },
  { key: 'police', formLabel: 'האם היה משטרה', section: 'ג. תאונה', reuse: true, autofill: 'police' },
  { key: 'tow', formLabel: 'האם היה גרר', section: 'ג. תאונה', reuse: true, autofill: 'tow' },
  { key: 'fireDept', formLabel: 'האם היה מכבי אש', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'policeStation', formLabel: 'נגבתה עדות בתחנת', section: 'ג. תאונה', reuse: true, autofill: 'policeStation' },
  { key: 'policeFile', formLabel: 'מס׳ תיק', section: 'ג. תאונה', reuse: true, autofill: 'policeFile' },
  { key: 'journalNumber', formLabel: 'מס׳ יומן', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'policeDate', formLabel: 'בתאריך (דיווח משטרה)', section: 'ג. תאונה', reuse: true, autofill: 'policeDate' },
  { key: 'eventDesc', formLabel: 'תיאור מפורט של התאונה', section: 'ג. תאונה', reuse: true, autofill: 'eventDesc' },
  { key: 'accidentDiagramNotes', formLabel: 'תרשים ממקום התאונה', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'damageDesc', formLabel: 'תיאור הנזק', section: 'ג. תאונה', reuse: true, autofill: 'damageDesc' },
  { key: 'damageLocation', formLabel: 'מיקום / איזורי פגיעה רכב מבוטח', section: 'ג. תאונה', reuse: true, autofill: 'damageLocation' },
  { key: 'witness1Name', formLabel: 'עד 1 — שם', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'witness1Address', formLabel: 'עד 1 — כתובת', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'witness2Name', formLabel: 'עד 2 — שם', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'witness2Address', formLabel: 'עד 2 — כתובת', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'witnesses', formLabel: 'עדים — הערות (קיים)', section: 'ג. תאונה', reuse: true, autofill: 'witnesses' },
  { key: 'tripPurpose', formLabel: 'המקרה אירע', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'garageName', formLabel: 'מוסך', section: 'ג. תאונה', reuse: false, autofill: '' },
  { key: 'surveyorName', formLabel: 'שמאי', section: 'ג. תאונה', reuse: false, autofill: 'surveyor' },
  { key: 'thirdDriver', formLabel: 'שם הנהג — צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdParty|thirdDriver' },
  { key: 'thirdId', formLabel: 'מס׳ ת.ז. צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdId' },
  { key: 'thirdPhone', formLabel: 'טלפון צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdPhone' },
  { key: 'thirdAddress', formLabel: 'כתובת צד ג׳', section: 'ד. צד ג׳', reuse: false, autofill: '' },
  { key: 'thirdOwner', formLabel: 'שם בעל הרכב — צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdOwner' },
  { key: 'thirdPlate', formLabel: 'מס׳ רישוי צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdPlate' },
  { key: 'thirdCarType', formLabel: 'סוג הרכב — צד ג׳', section: 'ד. צד ג׳', reuse: false, autofill: '' },
  { key: 'thirdMakeModel', formLabel: 'תוצר ודגם — צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdMakeModel' },
  { key: 'thirdInsCompany', formLabel: 'שם חברת הביטוח — צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdInsCompany' },
  { key: 'thirdPolicy', formLabel: 'מס׳ הפוליסה — צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdPolicy' },
  { key: 'thirdInsType', formLabel: 'סוג הביטוח — צד ג׳', section: 'ד. צד ג׳', reuse: false, autofill: '' },
  { key: 'thirdClaimNum', formLabel: 'מספר תביעה צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdClaimNum' },
  { key: 'thirdDamage', formLabel: 'תיאור הנזקים ברכב צד ג׳', section: 'ד. צד ג׳', reuse: true, autofill: 'thirdDamage' },
  { key: 'thirdDamageLocation', formLabel: 'איזורי פגיעה רכב צד ג׳', section: 'ד. צד ג׳', reuse: false, autofill: '' },
  { key: 'thirdClaimAgainstMe', formLabel: 'תביעת צד ג׳ שתוגש נגדי תטופל ע״י החברה', section: 'הצהרה', reuse: false, autofill: '' },
  { key: 'declarationAck', formLabel: 'הצהרת המבוטח', section: 'הצהרה', reuse: true, autofill: 'declarationAck' },
  { key: 'declarationDate', formLabel: 'תאריך הצהרה', section: 'הצהרה', reuse: false, autofill: 'today' },
  { key: 'formFilledBy', formLabel: 'הטופס מולא ע״י', section: 'הצהרה', reuse: true, autofill: 'formFilledBy' },
  { key: 'contactPrefEmail', formLabel: 'הודעות — דואר אלקטרוני', section: 'הצהרה', reuse: true, autofill: 'contactPrefEmail' },
  { key: 'contactPrefMobile', formLabel: 'הודעות — טלפון נייד', section: 'הצהרה', reuse: true, autofill: 'contactPrefMobile' },
  { key: 'contactPrefPost', formLabel: 'הודעות — דואר ישראל', section: 'הצהרה', reuse: true, autofill: 'contactPrefPost' },
  { key: 'missingFlags', formLabel: 'חסר להשלמה (קיים)', section: 'ד. צד ג׳', reuse: true, autofill: 'missingFlags' },
];

export const EMPTY_INTAKE: IntakeDraft = {
  clientName: '', clientPhone: '', clientEmail: '', clientId: '', clientAddress: '', clientZip: '',
  plate: '', carMake: '', carModel: '', carYear: '', carType: 'פרטי',
  insCompany: '', insType: '', policyNum: '', claimNum: '', claimKind: CLAIM_KINDS[0],
  driverDifferent: 'false', driverName: '', driverId: '', driverPhone: '', driverLicense: '',
  driverLicenseType: '', driverLicenseValid: '', driverLicenseYear: '', driverBirthDate: '',
  driverGender: '', driverPermission: 'true',
  eventDate: '', eventTime: '', eventPlace: '', eventCity: '', eventStreet: '', eventDesc: '',
  damageDesc: '', damageLocation: '', police: 'false', policeStation: '', policeFile: '', policeDate: '',
  tow: 'false', witnesses: '',
  thirdDriver: '', thirdOwner: '', thirdId: '', thirdPhone: '', thirdPlate: '', thirdMakeModel: '',
  thirdInsCompany: '', thirdPolicy: '', thirdClaimNum: '', thirdDamage: '',
  declarationAck: 'false', formFilledBy: '', contactPrefEmail: 'true', contactPrefMobile: 'true', contactPrefPost: 'false',
  missingFlags: '',
  reporterName: '', reporterId: '', reporterPhone: '',
  licensedDealer: '', agentName: '', policyValidUntil: '',
  phoneHome: '', phoneMobile: '', clientFax: '',
  addressStreet: '', addressCity: '', vehicleOwnerName: '',
  driverAddress: '', driverStreet: '', driverCity: '', driverZip: '',
  driverPhoneHome: '', driverPhoneMobile: '',
  fireDept: 'false', journalNumber: '', accidentDiagramNotes: '',
  witness1Name: '', witness1Address: '', witness2Name: '', witness2Address: '',
  tripPurpose: '', garageName: '', surveyorName: '',
  thirdAddress: '', thirdCarType: '', thirdInsType: '', thirdDamageLocation: '',
  thirdClaimAgainstMe: '', declarationDate: '',
};

export const DECLARATION_TEXT = `הנני מעוניין/ת כי תביעת צד ג' שתוגש נגדי תטופל ו/או תשולם על ידי החברה.
במידה וכן, הנני מתחייב/ת להעביר את ההשתתפות העצמית עפ״י תנאי הפוליסה מיד עם קבלת הדרישה להשתתפות עצמית.
הנני מתחייב/ת בזה להעביר מיידית לדליה ניהול תביעות כל הודעה, הזמנה, בקשה או תביעה שאקבל בקשר לתאונה זו.
הנני מצהיר/ה כי כל הפרטים דלעיל נכונים ומדויקים.
אני מאשר/ת שכל ההודעות הקשורות לנושא בירור התביעה ישלחו אליי באחד האמצעים שסימנתי.
**בהיעדר סימון מסמכי התביעה ישלחו בדואר ישראל.`;

function todayIsoDate() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function firstFilled(...vals: Array<string | undefined>) {
  for (const v of vals) {
    if (String(v || '').trim()) return String(v);
  }
  return '';
}

export function intakeFromClaim(c: Record<string, string>): IntakeDraft {
  const next = { ...EMPTY_INTAKE };
  for (const k of Object.keys(EMPTY_INTAKE)) {
    if (c[k]) next[k] = c[k];
  }
  next.clientName = c.clientName || next.clientName;
  next.clientPhone = c.clientPhone || next.clientPhone;
  next.clientEmail = c.clientEmail || next.clientEmail;
  next.plate = c.plate || next.plate;
  next.carModel = c.carModel || next.carModel;
  next.insCompany = c.insCompany || next.insCompany;
  next.policyNum = c.policyNum || next.policyNum;
  next.claimNum = c.claimNum || next.claimNum;
  next.claimKind = c.claimKind || CLAIM_KINDS[0];
  next.eventDate = c.eventDate || next.eventDate;
  next.thirdDriver = c.thirdParty || c.thirdDriver || '';
  next.thirdPlate = c.thirdPlate || '';
  next.thirdPhone = c.thirdPhone || '';
  next.driverDifferent = next.driverName && next.driverName !== next.clientName ? 'true' : (c.driverDifferent || next.driverDifferent);
  next.phoneMobile = firstFilled(c.phoneMobile, next.phoneMobile, c.clientPhone);
  next.phoneHome = firstFilled(c.phoneHome, next.phoneHome);
  next.addressStreet = firstFilled(c.addressStreet, next.addressStreet, c.clientAddress);
  next.addressCity = firstFilled(c.addressCity, next.addressCity);
  next.reporterName = firstFilled(c.reporterName, next.reporterName, c.clientName);
  next.reporterId = firstFilled(c.reporterId, next.reporterId, c.clientId);
  next.reporterPhone = firstFilled(c.reporterPhone, next.reporterPhone, c.clientPhone);
  next.vehicleOwnerName = firstFilled(c.vehicleOwnerName, next.vehicleOwnerName);
  next.driverPhoneMobile = firstFilled(c.driverPhoneMobile, next.driverPhoneMobile, next.driverPhone, next.driverDifferent === 'true' ? '' : c.clientPhone);
  next.driverAddress = firstFilled(c.driverAddress, next.driverAddress, next.driverDifferent === 'true' ? '' : c.clientAddress);
  next.driverZip = firstFilled(c.driverZip, next.driverZip, next.driverDifferent === 'true' ? '' : c.clientZip);
  next.surveyorName = firstFilled(c.surveyorName, next.surveyorName, c.surveyor);
  next.declarationDate = firstFilled(c.declarationDate, next.declarationDate) || todayIsoDate();
  if (next.driverDifferent !== 'true') {
    next.driverName = firstFilled(next.driverName, c.clientName);
    next.driverId = firstFilled(next.driverId, c.clientId);
    next.driverPhone = firstFilled(next.driverPhone, c.clientPhone);
    next.driverPhoneMobile = firstFilled(next.driverPhoneMobile, c.clientPhone);
  }
  return next;
}

/** New claim must not inherit the open card id. Edit may fall back to the open card. */
export function resolveStaffClaimSaveId(mode: 'new' | 'edit', formId: string, openClaimId: string) {
  if (mode === 'new') return '';
  return String(formId || openClaimId || '').trim();
}

/** New open always persists one notice PDF. Edit does not add a second copy. */
export function shouldAutoPersistNoticePdf(mode: 'new' | 'edit', existingNoticeCount: number) {
  if (mode === 'new') return true;
  return existingNoticeCount < 1;
}

export function mergeIntakeToClaim(base: Record<string, string>, d: IntakeDraft): Record<string, string> {
  const phone = firstFilled(d.clientPhone, d.phoneMobile, d.phoneHome);
  const address = firstFilled(d.clientAddress, [d.addressStreet, d.addressCity].filter(Boolean).join(', '));
  const driverPhone = firstFilled(d.driverPhone, d.driverPhoneMobile, d.driverPhoneHome);
  return {
    ...base,
    ...d,
    clientName: d.clientName,
    clientPhone: phone,
    clientEmail: d.clientEmail,
    clientAddress: address,
    plate: d.plate,
    carModel: [d.carMake, d.carModel].filter(Boolean).join(' ').trim() || d.carModel,
    insCompany: d.insCompany,
    policyNum: d.policyNum,
    claimNum: d.claimNum,
    claimKind: d.claimKind,
    eventDate: d.eventDate,
    thirdParty: d.thirdDriver,
    thirdPlate: d.thirdPlate,
    thirdPhone: d.thirdPhone,
    thirdEmail: base.thirdEmail || '',
    driverPhone,
    surveyor: firstFilled(base.surveyor, d.surveyorName),
    phoneMobile: firstFilled(d.phoneMobile, phone),
  };
}

export function customerSteps(_d?: IntakeDraft) {
  return [
    { key: 'client', label: 'המבוטח והפוליסה' },
    { key: 'driver', label: 'פרטי הנהג' },
    { key: 'event', label: 'פרטי התאונה' },
    { key: 'third', label: 'צד ג׳' },
    { key: 'sign', label: 'הצהרה וחתימה' },
    { key: 'review', label: 'בדיקה ושליחה' },
  ];
}

export function staffFormKeys() {
  return ['client', 'driver', 'event', 'third', 'sign'] as const;
}

export function hasZone(csv: string | undefined, zone: string) {
  return String(csv || '').split(',').map((s) => s.trim()).filter(Boolean).includes(zone);
}

export function toggleCsv(csv: string | undefined, token: string) {
  const cur = String(csv || '').split(',').map((s) => s.trim()).filter(Boolean);
  const next = cur.includes(token) ? cur.filter((x) => x !== token) : [...cur, token];
  return next.join(',');
}

export function tripPurposeLabel(key: string) {
  return TRIP_PURPOSES.find((p) => p.key === key)?.label || key || '—';
}

export function displayDriverName(d: IntakeDraft) {
  return firstFilled(d.driverName, d.driverDifferent === 'true' ? '' : d.clientName);
}

export function displayDriverId(d: IntakeDraft) {
  return firstFilled(d.driverId, d.driverDifferent === 'true' ? '' : d.clientId);
}

export function displayDriverPhone(d: IntakeDraft) {
  return firstFilled(d.driverPhoneMobile, d.driverPhone, d.driverDifferent === 'true' ? '' : d.phoneMobile, d.driverDifferent === 'true' ? '' : d.clientPhone);
}
