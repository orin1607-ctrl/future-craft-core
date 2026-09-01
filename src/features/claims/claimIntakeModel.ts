import { CLAIM_KINDS } from './claimsConstants';

export type IntakeDraft = Record<string, string>;

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
};

export const DECLARATION_TEXT = `אני מצהיר/ה כי כל הפרטים בטופס זה נכונים ומדויקים.
אני מתחייב/ת להעביר מיידית לדליה ניהול תביעות כל הודעה, הזמנה, בקשה או תביעה שאקבל בקשר לתאונה זו.
אני מאשר/ת שכל ההודעות הקשורות לבירור התביעה ישלחו אליי באמצעי הקשר שסימנתי.`;

export const DAMAGE_ZONES = ['חזית', 'אחור', 'ימין', 'שמאל', 'גג'] as const;

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
  next.driverDifferent = next.driverName ? 'true' : (c.driverDifferent || 'false');
  return next;
}

export function mergeIntakeToClaim(base: Record<string, string>, d: IntakeDraft): Record<string, string> {
  return {
    ...base,
    ...d,
    clientName: d.clientName,
    clientPhone: d.clientPhone,
    clientEmail: d.clientEmail,
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
  };
}

export function customerSteps(d: IntakeDraft) {
  const steps = [
    { key: 'client', label: 'הלקוח שלנו' },
    ...(d.driverDifferent === 'true' ? [{ key: 'driver', label: 'פרטי הנהג' }] : []),
    { key: 'event', label: 'פרטי האירוע' },
    ...(d.claimKind === 'תביעת צד ג׳' ? [{ key: 'third', label: 'צד ג׳' }] : []),
    { key: 'sign', label: 'הצהרה וחתימה' },
    { key: 'review', label: 'בדיקה ושליחה' },
  ];
  return steps;
}
