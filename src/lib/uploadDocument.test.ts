import { describe, it, expect } from 'vitest';
import { guessContentType, isPdfUrl } from './uploadDocument';
import { buildStoragePath, sanitizeFileName } from './storage';

describe('uploadDocument helpers', () => {
  it('detects PDF URLs with query strings', () => {
    expect(isPdfUrl('https://x.supabase.co/storage/v1/object/public/documents/uuid/f/file.pdf')).toBe(true);
    expect(isPdfUrl('https://x.supabase.co/file.PDF?token=1')).toBe(true);
    expect(isPdfUrl('https://x.supabase.co/file.jpg')).toBe(false);
  });

  it('guesses PDF content type from extension', () => {
    expect(guessContentType('policy.pdf', '')).toBe('application/pdf');
    expect(guessContentType('photo.heic', '')).toBe('image/heic');
  });

  it('builds safe storage paths with user id root', () => {
    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const path = buildStoragePath(userId, 'vehicle-docs', 'רישיון רכב.pdf');
    expect(path.startsWith(`${userId}/vehicle-docs/`)).toBe(true);
    expect(path).toMatch(/\.pdf$/);
    expect(path).not.toMatch(/[\u0590-\u05FF]/);
  });

  it('sanitizes Hebrew file names', () => {
    expect(sanitizeFileName('ביטוח.pdf')).toMatch(/\.pdf$/);
  });
});
