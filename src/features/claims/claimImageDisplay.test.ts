import { describe, expect, it } from 'vitest';
import { isTiff } from './claimImageDisplay';

describe('claim image format detection', () => {
  it('recognizes either TIFF byte order independently of MIME', () => {
    expect(isTiff(new Uint8Array([73, 73, 42, 0]))).toBe(true);
    expect(isTiff(new Uint8Array([77, 77, 0, 42]))).toBe(true);
  });
  it('does not treat JPEG, truncated data or BigTIFF as supported TIFF', () => {
    for (const bytes of [[255,216,255,224], [73,73], [73,73,43,0]]) {
      expect(isTiff(new Uint8Array(bytes))).toBe(false);
    }
  });
});
