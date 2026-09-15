import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Oren Car three production regressions — source guards', () => {
  it('keeps the large free-text notes field above the existing digital signature', () => {
    const page = readFileSync('src/pages/PrivateVehicleInspection.tsx', 'utf8');
    const notes = page.indexOf('<TriInspectionNotesField');
    const signature = page.indexOf('data-testid="tri-inspection-signature"');
    expect(notes).toBeGreaterThan(-1);
    expect(signature).toBeGreaterThan(notes);
    expect(page).toContain('DigitalSignaturePad');
    expect(page).toContain('composeInspectionNotes(odometer, generalNotes)');
  });

  it('uses the final accident signed-URL helper and session user id', () => {
    const page = readFileSync('src/pages/Accidents.tsx', 'utf8');
    const helper = readFileSync('src/lib/accidentDocuments.ts', 'utf8');
    expect(page).toContain('loadAccidentAttachedDocuments');
    expect(page).toContain('uploadAccidentAttachedFile');
    expect(page).toContain('resolveAccidentFileUrl');
    expect(page).toContain('currentAuthUserId');
    expect(page).toContain('העלאת תמונה');
    expect(page).toContain('העלאת קובץ');
    expect(page).not.toMatch(/getPublicUrl/);
    expect(helper).toContain('createSignedUrl');
    expect(helper).toContain('session?.user?.id');
    expect(helper).not.toMatch(/getPublicUrl/);
  });

  it('shows existing vehicles.internal_number and vehicles.department on reports', () => {
    const page = readFileSync('src/pages/Reports.tsx', 'utf8');
    expect(page).toContain("['מס\\' פנימי', 'מחלקה', 'מספר רכב'");
    expect(page).toContain("{ value: 'ops_treatments', label: 'טיפולים' }");
    expect(page).toContain("{ value: 'ops_accidents', label: 'תאונות' }");
    expect(page).not.toContain('טיפולים מפורט');
    expect(page).not.toContain('תאונות מפורטות');
    expect(page).not.toContain('internal_number_2');
    expect(page).not.toContain('מספר פנימי 2');
    expect(page).toContain('`${VEHICLE_EXPIRY_SELECT},department`');
  });
});
