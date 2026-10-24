import { describe, expect, it } from 'vitest';
import { collapseRepeats, mergeRecognitionResults } from './daliaSpeechText';

const r = (transcript: string, isFinal = true) => ({ isFinal, 0: { transcript } });

describe('mergeRecognitionResults — every sentence once', () => {
  it('desktop Chrome: separate final phrases are joined', () => {
    expect(mergeRecognitionResults([r('משה'), r('כהן')]).full).toBe('משה כהן');
  });
  it('Android Chrome: cumulative finals do not duplicate', () => {
    expect(mergeRecognitionResults([r('שלום'), r('שלום מה שלומך')]).full).toBe('שלום מה שלומך');
  });
  it('Android Chrome: a re-delivered final phrase is ignored', () => {
    expect(mergeRecognitionResults([r('תמצאי לי את התיק'), r('תמצאי לי את התיק')]).full).toBe('תמצאי לי את התיק');
  });
  it('interim that repeats the final is not added twice', () => {
    expect(mergeRecognitionResults([r('כמה תיקים'), r('כמה תיקים פתוחים', false)]).full).toBe('כמה תיקים פתוחים');
  });
  it('final + new interim', () => {
    expect(mergeRecognitionResults([r('רכב'), r('1234567', false)]).full).toBe('רכב 1234567');
  });
  it('repeated phrase inside one result is collapsed', () => {
    expect(mergeRecognitionResults([r('מה שלומך מה שלומך')]).full).toBe('מה שלומך');
  });
  it('legitimate single-word repeats stay ("לא לא")', () => {
    expect(collapseRepeats('לא לא תשמרי')).toBe('לא לא תשמרי');
  });
  it('empty input', () => {
    expect(mergeRecognitionResults([]).full).toBe('');
  });
});
