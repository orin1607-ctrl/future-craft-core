/** Official insurer claims-department emails. Only addresses published on the insurer's own site. */

export type VerifiedInsurerDept = {
  id: string;
  full_name: string;
  company_name: string;
  department: string;
  email: string;
  source: string;
  note: string;
};

/** Car-claims desks only. Health/life/pension mailboxes are omitted. */
export const VERIFIED_INSURER_DEPTS: VerifiedInsurerDept[] = [
  {
    id: 'CTC-OFFICIAL-CLAL-DESK',
    full_name: 'כלל ביטוח — דסק קדמי / קסקו רכב',
    company_name: 'כלל',
    department: 'תביעות רכב — דסק קדמי / קסקו',
    email: 'tviot-r@clal-ins.co.il',
    source: 'https://www.clalbit.co.il/claimscontactus/',
    note: 'מאומת מאתר כלל · תביעות — פרטי התקשרות נוספים · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-CLAL-TP',
    full_name: 'כלל ביטוח — תביעות רכב צד ג׳',
    company_name: 'כלל',
    department: 'תביעות רכב — צד ג׳',
    email: 'tviot-rg@clal-ins.co.il',
    source: 'https://www.clalbit.co.il/claimscontactus/',
    note: 'מאומת מאתר כלל · תביעות — פרטי התקשרות נוספים · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-CLAL-HOVA',
    full_name: 'כלל ביטוח — תביעות חובה',
    company_name: 'כלל',
    department: 'תביעות נזקי גוף — חובה',
    email: 'clal-hova@clal-ins.co.il',
    source: 'https://www.clalbit.co.il/claimscontactus/',
    note: 'מאומת מאתר כלל · תביעות — פרטי התקשרות נוספים · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-CLAL-SHIVUV',
    full_name: 'כלל ביטוח — שיבוב',
    company_name: 'כלל',
    department: 'שיבוב',
    email: 'tmshiv@clal-ins.co.il',
    source: 'https://www.clalbit.co.il/claimscontactus/',
    note: 'מאומת מאתר כלל · תביעות — פרטי התקשרות נוספים · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-MIGDAL-CART',
    full_name: 'מגדל — תביעות רכב רכוש',
    company_name: 'מגדל',
    department: 'תביעות רכב רכוש',
    email: 'cart@migdal.co.il',
    source: 'https://my.migdal.co.il/support/claims/centers',
    note: 'מאומת מאתר מגדל · מוקדי שירות ותביעות · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-MIGDAL-HOVA',
    full_name: 'מגדל — תביעות רכב חובה',
    company_name: 'מגדל',
    department: 'תביעות רכב חובה',
    email: 'tiviothova@migdal.co.il',
    source: 'https://my.migdal.co.il/support/claims/centers',
    note: 'מאומת מאתר מגדל · מוקדי שירות ותביעות · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-FNX-PROPERTY',
    full_name: 'הפניקס — תביעות רכב רכוש',
    company_name: 'הפניקס',
    department: 'תביעות רכב רכוש — מבוטח',
    email: 'ea5070@fnx.co.il',
    source: 'https://www.fnx.co.il/claims-customer-service/claims-car-insurance/claims-property-car-insurance/',
    note: 'מאומת מאתר הפניקס · תביעות רכב רכוש · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-FNX-BOX',
    full_name: 'הפניקס — תיבת תביעות רכב',
    company_name: 'הפניקס',
    department: 'תיבת תביעות רכב',
    email: 'TviotRechev@fnx.co.il',
    source: 'https://www.fnx.co.il/claims-customer-service/claims-car-insurance/claims-property-car-insurance/',
    note: 'מאומת מאתר הפניקס · מסמך שאינו טופס תביעה / השלמת מסמכים · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-FNX-TP',
    full_name: 'הפניקס — תביעות רכב צד ג׳',
    company_name: 'הפניקס',
    department: 'תביעות רכב צד ג׳',
    email: 'zadg@fnx.co.il',
    source: 'https://www.fnx.co.il/claims-customer-service/claims-car-insurance-third-party/',
    note: 'מאומת מאתר הפניקס · בירור סטטוס צד ג׳ · 2026-09-09',
  },
  {
    id: 'CTC-OFFICIAL-FNX-HOVA',
    full_name: 'הפניקס — תביעות רכב חובה',
    company_name: 'הפניקס',
    department: 'תביעות רכב חובה (גוף)',
    email: 'PtichotHova@fnx.co.il',
    source: 'https://www.fnx.co.il/claims-customer-service/claims-car-insurance/compulsory-motor-claims/',
    note: 'מאומת מאתר הפניקס · תביעות רכב חובה · 2026-09-09',
  },
];

export const UNPUBLISHED_INSURER_EMAIL_NOTE =
  'הראל, איילון, מנורה, ביטוח ישיר ושלמה — לא פורסמה כתובת מייל מחלקתית רשמית לדסק תביעות רכב באתר שלהן. לא הוזן ניחוש.';
