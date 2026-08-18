import { describe, expect, it } from 'vitest';
import { extractDocumentsStoragePath } from './documentUrl';

describe('extractDocumentsStoragePath', () => {
  it('returns storage paths as-is', () => {
    expect(extractDocumentsStoragePath('uid/driver-license/1.pdf')).toBe('uid/driver-license/1.pdf');
  });

  it('extracts path from public object URLs', () => {
    expect(
      extractDocumentsStoragePath(
        'https://x.supabase.co/storage/v1/object/public/documents/uid/f/file.pdf',
      ),
    ).toBe('uid/f/file.pdf');
  });

  it('extracts path from signed object URLs', () => {
    expect(
      extractDocumentsStoragePath(
        'https://x.supabase.co/storage/v1/object/sign/documents/uid/f/file.pdf?token=abc',
      ),
    ).toBe('uid/f/file.pdf');
  });

  it('returns null for data URLs', () => {
    expect(extractDocumentsStoragePath('data:image/png;base64,abc')).toBeNull();
  });

  it('returns null for unrelated URLs', () => {
    expect(extractDocumentsStoragePath('https://example.com/a.png')).toBeNull();
  });
});
