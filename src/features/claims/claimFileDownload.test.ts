import { describe, expect, it } from 'vitest';
import { withAttachmentParam } from './claimFileDownload';

describe('claimFileDownload', () => {
  it('adds a download query so Storage serves Content-Disposition: attachment', () => {
    const url = withAttachmentParam('https://example.test/object/sign/a.jpg?token=abc', 'photo 1.jpg');
    expect(url).toContain('download=photo+1.jpg');
    expect(url).toContain('token=abc');
  });

  it('keeps a malformed URL unchanged', () => {
    expect(withAttachmentParam('not-a-url', 'x.bin')).toBe('not-a-url');
  });
});
