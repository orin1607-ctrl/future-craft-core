import { describe, expect, it } from 'vitest';
import { fileNameFromDocument, getDocumentKind, isImageDocument } from './documentDisplayUtils';

describe('documentDisplayUtils', () => {
  it('detects image and pdf kinds', () => {
    expect(getDocumentKind('photo.jpg')).toBe('image');
    expect(getDocumentKind('https://x/y/doc.png?token=1')).toBe('image');
    expect(getDocumentKind('report.pdf')).toBe('pdf');
    expect(getDocumentKind('sheet.xlsx')).toBe('other');
    expect(isImageDocument('a.webp')).toBe(true);
  });

  it('extracts readable file names', () => {
    expect(fileNameFromDocument('https://host/uuid/folder/license-123.pdf', 'מסמך')).toBe('license-123.pdf');
    expect(fileNameFromDocument('https://host/uuid/only-path', 'מסמך')).toBe('only-path');
  });
});
