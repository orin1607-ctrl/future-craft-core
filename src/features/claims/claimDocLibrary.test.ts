import { describe, expect, it } from 'vitest';
import { DOC_LIB_CATEGORIES, fileDocBucket, fileInLibCategory, libTypeLabel } from './claimDocLibrary';

describe('claimDocLibrary', () => {
  it('uses doc_kind before source', () => {
    expect(fileDocBucket({ id: '1', doc_kind: 'surveyor_report', source: 'gmail' })).toBe('surveyor_reports');
    expect(fileDocBucket({ id: '2', doc_kind: 'surveyor_photo', source: 'gmail' })).toBe('surveyor_photos');
    expect(fileDocBucket({ id: '3', doc_kind: 'garage_invoice', source: 'staff' })).toBe('invoice');
  });

  it('uses staff_type when kind is general', () => {
    expect(fileDocBucket({ id: '1', doc_kind: 'general', doc_meta: { staff_type: 'driver_license' } })).toBe('vehicle');
    expect(fileDocBucket({ id: '2', doc_kind: 'general', doc_meta: { staff_type: 'insurance_history' } })).toBe('insurer');
    expect(fileDocBucket({ id: '3', doc_kind: 'general', doc_meta: { staff_type: 'accident_notice' } })).toBe('forms');
    expect(fileDocBucket({ id: '4', doc_kind: 'general', doc_meta: { staff_type: 'damage_photos' } })).toBe('damage');
  });

  it('does not guess from the file name', () => {
    expect(fileDocBucket({ id: '1', original_name: 'surveyor-report.pdf', doc_kind: 'general', source: 'gmail' } as { id: string; source?: string; doc_kind?: string })).toBe('other');
  });

  it('puts unmatched customer uploads in client, not other', () => {
    expect(fileDocBucket({ id: '1', source: 'customer', doc_kind: 'general' })).toBe('client');
  });

  it('keeps surveyor reports and photos in separate gallery buckets', () => {
    const report = { id: 'r', doc_kind: 'surveyor_report' };
    const photo = { id: 'p', doc_kind: 'surveyor_photo' };
    const inv = { id: 'i', doc_kind: 'garage_invoice' };
    expect(fileInLibCategory(report, 'surveyor_reports')).toBe(true);
    expect(fileInLibCategory(photo, 'surveyor_reports')).toBe(false);
    expect(fileInLibCategory(photo, 'surveyor_photos')).toBe(true);
    expect(fileInLibCategory(report, 'surveyor_photos')).toBe(false);
    expect(fileInLibCategory(inv, 'surveyor_reports')).toBe(false);
    expect(libTypeLabel(report)).toBe('דוחות שמאי');
    expect(libTypeLabel(photo)).toBe('תמונות שמאי');
  });

  it('exposes the gallery category names', () => {
    expect(DOC_LIB_CATEGORIES.map((c) => c.label)).toEqual([
      'כל הגלריה', 'דוחות שמאי', 'תמונות שמאי', 'תמונות אירוע / נזק', 'מסמכי לקוח',
      'מסמכי רכב / נהג', 'מסמכי חברת ביטוח', 'חשבוניות / מוסך', 'טפסים / תצהירים', 'אחר',
    ]);
  });
});
