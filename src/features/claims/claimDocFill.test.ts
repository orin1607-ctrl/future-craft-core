// Fictitious people and documents only.
import { describe, expect, it } from 'vitest';
import { applyClaimFieldEdit, resolveField } from '../../../supabase/functions/_shared/claimFieldEdit';
import {
  describeDocumentFill,
  findInDocuments,
  missingClaimFields,
  planDocumentFill,
} from '../../../supabase/functions/_shared/claimDocFill';

const drivingLicence = {
  name: 'רישיון נהיגה צד ג.jpg',
  text: [
    'מדינת ישראל',
    'רישיון נהיגה',
    '1. בדיקה',
    '2. נהג פיקטיבי',
    '3. 01.01.1980',
    '4d. 012345674',
    '5. 7654321',
  ].join('\n'),
};
const vehicleLicence = {
  name: 'רישיון רכב צד ג.pdf',
  text: [
    'רישיון רכב',
    'מספר רכב: 12-345-67',
    'תוצר: טויוטה  דגם: קורולה',
    'שם הבעלים: חברת השכרה בדיקה בע"מ',
  ].join('\n'),
};
const insurance = {
  name: 'תעודת ביטוח.pdf',
  text: 'תעודת ביטוח חובה\nהמבוטח: מבוטח פיקטיבי\nחברת ביטוח: ביטוח בדיקה בע״מ\nמספר פוליסה: 99-887766',
};
const docs = [drivingLicence, vehicleLicence, insurance];

const claim = {
  id: 'DAL-QA-FILL-0001',
  clientName: 'לקוח בדיקה',
  claimKind: 'תביעת צד ג׳',
  thirdParty: '',
  thirdPlate: '',
  thirdInsCompany: 'חברה אחרת',
  notes: 'לא נוגעים',
};

describe('third-party fields', () => {
  it('maps the Hebrew names people use to the form fields', () => {
    expect(resolveField('נהג צד ג׳')).toBe('thirdParty');
    expect(resolveField("רכב צד ג'")).toBe('thirdPlate');
    expect(resolveField('חברת הביטוח של צד ג׳')).toBe('thirdInsCompany');
    expect(resolveField('פוליסת צד ג׳')).toBe('thirdPolicy');
    expect(resolveField('צד ג׳ – מספר רישיון נהיגה')).toBe('thirdLicense');
    expect(resolveField('thirdDriver')).toBe('thirdParty');
  });

  it('keeps the driver name in both keys the claim screens read', () => {
    const applied = applyClaimFieldEdit({ thirdParty: '', thirdDriver: '' }, [
      { field: 'thirdParty', label: 'צד ג׳ – שם הנהג', before: '', after: 'נהג פיקטיבי' },
    ], { nowHe: 'x', actorName: 'QA' });
    expect(applied.ok && applied.rowData.thirdParty).toBe('נהג פיקטיבי');
    expect(applied.ok && applied.rowData.thirdDriver).toBe('נהג פיקטיבי');
  });
});

describe('findInDocuments', () => {
  it('finds numbers printed with separators, and never inside a longer number', () => {
    expect(findInDocuments('thirdPlate', '1234567', docs)?.doc).toBe(vehicleLicence.name);
    expect(findInDocuments('thirdId', '012345674', docs)?.doc).toBe(drivingLicence.name);
    expect(findInDocuments('thirdLicense', '7654321', docs)?.doc).toBe(drivingLicence.name);
    expect(findInDocuments('thirdLicense', '765432', docs)).toBeNull();
  });

  it('needs every word of a name in the same document', () => {
    expect(findInDocuments('thirdParty', 'נהג פיקטיבי בדיקה', docs)?.doc).toBe(drivingLicence.name);
    expect(findInDocuments('thirdParty', 'נהג אחר', docs)).toBeNull();
    expect(findInDocuments('thirdInsCompany', 'ביטוח בדיקה בע"מ', docs)?.doc).toBe(insurance.name);
  });
});

describe('planDocumentFill', () => {
  const proposals = [
    { field: 'thirdParty', value: 'נהג פיקטיבי בדיקה' },
    { field: 'thirdId', value: '012345674' },
    { field: 'thirdLicense', value: '7654321' },
    { field: 'thirdPlate', value: '12-345-67' },
    { field: 'thirdMakeModel', value: 'טויוטה קורולה' },
    { field: 'thirdOwner', value: 'חברת השכרה בדיקה בע"מ' },
    { field: 'thirdInsured', value: 'מבוטח פיקטיבי' },
    { field: 'thirdInsCompany', value: 'ביטוח בדיקה בע״מ' },
    { field: 'thirdPolicy', value: '99-887766' },
  ];

  it('fills empty fields, keeps an existing different value as a conflict, and lists what is still missing', () => {
    const plan = planDocumentFill(claim, proposals, docs);
    expect(plan.fills.map((c) => c.field)).toEqual([
      'thirdParty', 'thirdId', 'thirdLicense', 'thirdPlate', 'thirdMakeModel', 'thirdOwner', 'thirdInsured', 'thirdPolicy',
    ]);
    expect(plan.conflicts).toEqual([expect.objectContaining({ field: 'thirdInsCompany', before: 'חברה אחרת', applied: false })]);
    expect(plan.changes.map((c) => c.field)).not.toContain('thirdInsCompany');
    expect(plan.missing).toEqual(['צד ג׳ – טלפון', 'צד ג׳ – כתובת', 'צד ג׳ – מספר תביעה']);
  });

  it('changes a conflicting field only when the user named it', () => {
    const plan = planDocumentFill(claim, proposals, docs, ['thirdInsCompany']);
    expect(plan.changes).toContainEqual(expect.objectContaining({ field: 'thirdInsCompany', before: 'חברה אחרת', after: 'ביטוח בדיקה בע״מ' }));
  });

  it('rejects a value that is not written in any document (no invented data)', () => {
    const plan = planDocumentFill(claim, [{ field: 'thirdPhone', value: '050-1234567' }, { field: 'thirdPlate', value: '7654321' }], docs);
    expect(plan.changes).toEqual([]);
    expect(plan.rejected.join(' ')).toContain('לא נמצא בטקסט של המסמכים');
  });

  it('refuses fields outside the claim form and never touches notes or status', () => {
    const plan = planDocumentFill(claim, [{ field: 'notes', value: 'x' }, { field: 'status', value: 'סגור' }], docs);
    expect(plan.changes).toEqual([]);
    expect(plan.rejected).toHaveLength(2);
  });

  it('reports a value already in the claim as unchanged', () => {
    const plan = planDocumentFill({ ...claim, thirdPlate: '12-345-67' }, [{ field: 'thirdPlate', value: '12-345-67' }], docs);
    expect(plan.same).toEqual(['צד ג׳ – מספר רכב']);
    expect(plan.changes).toEqual([]);
  });

  it('writes an approval text with the claim, additions, conflicts and missing fields', () => {
    const plan = planDocumentFill(claim, proposals, docs);
    const text = describeDocumentFill({ id: claim.id, clientName: claim.clientName }, plan, docs.map((d) => d.name));
    expect(text).toContain('תיק DAL-QA-FILL-0001 · לקוח: לקוח בדיקה');
    expect(text).toContain('יתווסף לתיק (שדות ריקים):');
    expect(text).toContain('סותר מידע קיים בתיק:');
    expect(text).toContain('לא יוחלף בלי אישור מפורש');
    expect(text).toContain('עדיין חסר בתיק:');
  });
});

describe('missingClaimFields', () => {
  it('lists empty claim and third-party fields', () => {
    const missing = missingClaimFields(claim);
    expect(missing.third_party_relevant).toBe(true);
    expect(missing.third_party).toContain('צד ג׳ – שם הנהג');
    expect(missing.third_party).not.toContain('צד ג׳ – חברת ביטוח');
    expect(missing.claim).toContain('מספר רכב');
  });
});
