import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  accidentDocumentMatches,
  mergeAccidentDocuments,
  normalizeAccidentFilePath,
  parseAccidentImages,
} from './accidentDocuments';

const accident = { id: 'acc-1', claim_number: 'CL-77', vehicle_plate: '12-345-67' };

describe('accident document association', () => {
  it('parses stored accident image JSON, paths, and public URLs', () => {
    expect(parseAccidentImages('["uid/accidents/1.jpg","https://x.supabase.co/storage/v1/object/public/documents/uid/accidents/2.jpg"]')).toEqual([
      'uid/accidents/1.jpg',
      'https://x.supabase.co/storage/v1/object/public/documents/uid/accidents/2.jpg',
    ]);
    expect(parseAccidentImages('uid/accidents/only.png')).toEqual(['uid/accidents/only.png']);
    expect(parseAccidentImages('[{"file_path":"uid/accidents/obj.jpg"}]')).toEqual(['uid/accidents/obj.jpg']);
    expect(parseAccidentImages('')).toEqual([]);
  });

  it('normalizes public, signed, and documents-prefixed paths', () => {
    expect(normalizeAccidentFilePath('uid/accidents/a.jpg')).toBe('uid/accidents/a.jpg');
    expect(
      normalizeAccidentFilePath('https://x.supabase.co/storage/v1/object/public/documents/uid/accidents/a.jpg'),
    ).toBe('uid/accidents/a.jpg');
    expect(
      normalizeAccidentFilePath('https://x.supabase.co/storage/v1/object/sign/documents/uid/accidents/a.jpg?token=1'),
    ).toBe('uid/accidents/a.jpg');
    expect(normalizeAccidentFilePath('documents/uid/accidents/a.jpg')).toBe('uid/accidents/a.jpg');
    expect(normalizeAccidentFilePath('documents/documents/uid/accidents/a.jpg')).toBe('uid/accidents/a.jpg');
  });

  it('matches metadata by claim number or the same vehicle plate', () => {
    expect(accidentDocumentMatches({ claim_number: 'CL-77', vehicle_plate: '999' }, accident)).toBe(true);
    expect(accidentDocumentMatches({ claim_number: '', vehicle_plate: '1234567' }, accident)).toBe(true);
    expect(accidentDocumentMatches({ claim_number: 'OTHER', vehicle_plate: '12-345-67' }, accident)).toBe(false);
    expect(accidentDocumentMatches({ claim_number: '', vehicle_plate: '99-999-99' }, accident)).toBe(false);
    expect(accidentDocumentMatches({ display_name: 'CL-77 — police.pdf' }, accident)).toBe(true);
  });

  it('merges version rows with metadata and dedupes the same file_path', () => {
    const docs = mergeAccidentDocuments(
      [{ id: 'v1', file_path: 'uid/accident-documents/a.pdf', original_name: 'from-version.pdf', created_at: '2026-01-01' }],
      [
        { id: 'm1', file_path: 'uid/accident-documents/a.pdf', original_name: 'dup.pdf', claim_number: 'CL-77' },
        { id: 'm2', file_path: 'uid/accident-documents/b.pdf', original_name: 'from-meta.pdf', claim_number: 'CL-77' },
        { id: 'm3', file_path: 'uid/accident-documents/other.pdf', original_name: 'other.pdf', claim_number: 'ZZ' },
      ],
      accident,
    );
    expect(docs.map((d) => d.original_name)).toEqual(['from-version.pdf', 'from-meta.pdf']);
    expect(docs.every((d) => d.file_path.startsWith('uid/'))).toBe(true);
  });

  it('loads accident files from document_versions and document_metadata without a company_name filter', () => {
    const src = readFileSync('src/lib/accidentDocuments.ts', 'utf8');
    expect(src).toContain(".eq('entity_type', 'accident')");
    expect(src).toContain(".eq('entity_id', accident.id)");
    expect(src).toContain(".eq('category', 'accident-document')");
    expect(src).not.toMatch(/eq\('company_name'/);
    expect(src).toContain('createDocumentSignedUrl');
    expect(src).not.toMatch(/getPublicUrl/);
  });
});

describe('Accidents page uses the accident document helper only', () => {
  it('keeps upload/open/download on the existing Accidents page', () => {
    const src = readFileSync('src/pages/Accidents.tsx', 'utf8');
    expect(src).toContain('loadAccidentAttachedDocuments');
    expect(src).toContain('uploadAccidentAttachedFile');
    expect(src).toContain('resolveAccidentFileUrl');
    expect(src).toContain('העלאת תמונה');
    expect(src).toContain('העלאת קובץ');
    expect(src).toContain('currentAuthUserId');
    expect(src).not.toMatch(/query = query\.eq\('company_name', company\)/);
  });
});
