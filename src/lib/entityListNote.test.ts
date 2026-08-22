import { describe, expect, it } from 'vitest';
import { compactListNote, LIST_NOTE_MAX_CHARS, vehicleHasListNote } from './entityListNote';

describe('entityListNote', () => {
  it('returns empty for blank notes so lists stay clean', () => {
    expect(compactListNote(null)).toBe('');
    expect(compactListNote('')).toBe('');
    expect(compactListNote('   \n\t  ')).toBe('');
    expect(vehicleHasListNote('  ')).toBe(false);
  });

  it('collapses newlines into a single compact line', () => {
    expect(compactListNote('שורה ראשונה\nשורה שנייה')).toBe('שורה ראשונה שורה שנייה');
  });

  it('truncates long notes with an ellipsis', () => {
    const long = 'א'.repeat(LIST_NOTE_MAX_CHARS + 20);
    const preview = compactListNote(long);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(LIST_NOTE_MAX_CHARS);
    expect(vehicleHasListNote(long)).toBe(true);
  });
});
