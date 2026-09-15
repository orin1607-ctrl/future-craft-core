import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Production three approved fixes stay surgical', () => {
  it('task 1: tri table can scroll horizontally and still keeps notes + signature', () => {
    const src = readFileSync('src/pages/PrivateVehicleInspection.tsx', 'utf8');
    expect(src).toContain('data-testid="tri-inspection-table"');
    expect(src).toContain('overflow-x-auto');
    expect(src).not.toContain('overflow-hidden mb-6');
    const notesAt = src.indexOf('<TriInspectionNotesField');
    const signatureAt = src.indexOf('data-testid="tri-inspection-signature"');
    const tableAt = src.indexOf('data-testid="tri-inspection-table"');
    expect(tableAt).toBeGreaterThan(0);
    expect(notesAt).toBeGreaterThan(tableAt);
    expect(signatureAt).toBeGreaterThan(notesAt);
    expect(src).toContain('DigitalSignaturePad');
    expect(src).toContain('composeInspectionNotes(odometer, generalNotes)');
  });

  it('task 2: last inspection uses vehicle_inspections tri_semi_annual copy', () => {
    const src = readFileSync('src/pages/PrivateVehicleInspection.tsx', 'utf8');
    const helper = readFileSync('src/lib/triInspectionDisplay.ts', 'utf8');
    expect(src).toContain('ביקורת אחרונה:');
    expect(src).toContain("eq('inspection_type', TRI_SEMI_INSPECTION_TYPE)");
    expect(src).toContain('pickLatestTriInspectionDate');
    expect(helper).toContain("לא קיימת ביקורת קודמת");
    expect(helper).not.toContain('לא קיימת בדיקה קודמת');
  });

  it('task 3: vehicle/insurance/document open uses signed URLs, not getPublicUrl', () => {
    const viewer = readFileSync('src/components/documents/DocumentViewer.tsx', 'utf8');
    const hub = readFileSync('src/lib/vehicleHubData.ts', 'utf8');
    const dash = readFileSync('src/components/vehicles/VehicleDashboard.tsx', 'utf8');
    const docs = readFileSync('src/pages/Documents.tsx', 'utf8');
    const accidents = readFileSync('src/pages/Accidents.tsx', 'utf8');
    const reports = readFileSync('src/pages/Reports.tsx', 'utf8');
    expect(viewer).toContain('resolvePrivateDocumentUrl');
    expect(viewer).not.toMatch(/getPublicUrl/);
    expect(hub).not.toMatch(/getPublicUrl/);
    expect(dash).toContain('PrivateDocumentOpenLink');
    expect(dash).toContain('פתח ביטוח צד ג׳');
    expect(docs).toContain('url={doc.file_path}');
    expect(docs).not.toMatch(/getPublicUrl/);
    expect(accidents).toContain('resolveAccidentFileUrl');
    expect(accidents).not.toMatch(/getPublicUrl/);
    expect(reports).toContain("'מחלקה'");
    expect(reports).toContain("{ value: 'ops_treatments', label: 'טיפולים' }");
    expect(reports).toContain("{ value: 'ops_accidents', label: 'תאונות' }");
    expect(reports).not.toContain('טיפולים מפורט');
  });
});
