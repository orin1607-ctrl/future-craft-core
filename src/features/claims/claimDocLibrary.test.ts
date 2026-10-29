import { describe, expect, it } from 'vitest';
import { DOC_LIB_CATEGORIES, DOC_LIB_GROUPS, fileDocBucket, fileInLibCategory, generalLibFiles, isGarageLibFile, isTrashedLibFile, libTypeLabel } from './claimDocLibrary';

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
    expect(fileDocBucket({ id: '5', doc_kind: 'garage_photo', doc_meta: { staff_type: 'garage_photos' } })).toBe('garage_photos');
    expect(fileDocBucket({ id: '6', doc_kind: 'general', doc_meta: { staff_type: 'garage_photos' } })).toBe('garage_photos');
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
      'כל הגלריה', 'דוחות שמאי', 'תמונות שמאי', 'תמונות נזק / תאונה', 'מסמכי לקוח',
      'מסמכי רכב / נהג', 'מסמכי חברת ביטוח', 'חשבוניות / מוסך', 'טפסים / תצהירים', 'אחר',
      '🗑️ סל מחזור',
    ]);
    expect(DOC_LIB_GROUPS.map((g) => g.label)).toEqual(['תמונות', 'דוחות', 'מסמכים']);
    expect(DOC_LIB_CATEGORIES.some((c) => c.key === 'garage_photos')).toBe(false);
  });

  it('keeps garage photos classified but out of the general library', () => {
    const garage = { id: 'g', doc_kind: 'garage_photo', doc_meta: { staff_type: 'garage_photos' } };
    const damage = { id: 'd', doc_kind: 'general', doc_meta: { staff_type: 'damage_photos' } };
    expect(fileDocBucket(garage)).toBe('garage_photos');
    expect(isGarageLibFile(garage)).toBe(true);
    expect(fileInLibCategory(garage, 'all')).toBe(false);
    expect(fileInLibCategory(garage, 'damage')).toBe(false);
    expect(fileInLibCategory(damage, 'all')).toBe(true);
    expect(generalLibFiles([garage, damage]).map((f) => f.id)).toEqual(['d']);
  });

  it('filters trashed files into trash category and out of normal views', () => {
    const normal = { id: 'n', doc_kind: 'surveyor_report' };
    const trashed = { id: 't', doc_kind: 'surveyor_report', doc_meta: { trashed_at: '2026-10-29T08:00:00Z', trashed_by: 'qa' } };
    expect(isTrashedLibFile(normal)).toBe(false);
    expect(isTrashedLibFile(trashed)).toBe(true);
    expect(fileDocBucket(trashed)).toBe('trash');
    expect(fileInLibCategory(normal, 'all')).toBe(true);
    expect(fileInLibCategory(trashed, 'all')).toBe(false);
    expect(fileInLibCategory(normal, 'surveyor_reports')).toBe(true);
    expect(fileInLibCategory(trashed, 'surveyor_reports')).toBe(false);
    expect(fileInLibCategory(normal, 'trash')).toBe(false);
    expect(fileInLibCategory(trashed, 'trash')).toBe(true);
  });
});
