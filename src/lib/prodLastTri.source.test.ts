import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Production last-tri display is surgical', () => {
  it('shows last tri date from vehicle_inspections without touching notes or signature', () => {
    const src = readFileSync('src/pages/PrivateVehicleInspection.tsx', 'utf8');
    const notesAt = src.indexOf('<TriInspectionNotesField');
    const signatureAt = src.indexOf('data-testid="tri-inspection-signature"');
    const lastAt = src.indexOf('data-testid="tri-last-inspection-date"');
    expect(lastAt).toBeGreaterThan(0);
    expect(notesAt).toBeGreaterThan(lastAt);
    expect(signatureAt).toBeGreaterThan(notesAt);
    expect(src).toContain('DigitalSignaturePad');
    expect(src).toContain("eq('inspection_type', TRI_SEMI_INSPECTION_TYPE)");
    expect(src).toContain('pickLatestTriInspectionDate');
    expect(src).toContain('composeInspectionNotes(odometer, generalNotes)');
  });

  it('does not rewrite Accidents or Reports in this patch', () => {
    const accidents = readFileSync('src/pages/Accidents.tsx', 'utf8');
    const reports = readFileSync('src/pages/Reports.tsx', 'utf8');
    expect(accidents).toContain('loadAccidentAttachedDocuments');
    expect(accidents).toContain('resolveAccidentFileUrl');
    expect(accidents).not.toMatch(/getPublicUrl/);
    expect(reports).toContain("'מחלקה'");
    expect(reports).toContain("{ value: 'ops_treatments', label: 'טיפולים' }");
    expect(reports).toContain("{ value: 'ops_accidents', label: 'תאונות' }");
    expect(reports).not.toContain('טיפולים מפורט');
    expect(reports).not.toContain('תאונות מפורטות');
  });
});
