import { describe, expect, it } from 'vitest';
import { documentPreviewState } from './DocumentViewer';

describe('document preview state', () => {
  it('waits for the requested file instead of reusing the closed dialog result', () => {
    expect(documentPreviewState('company/vehicles_19807/memo.pdf', { raw: '', resolved: '' })).toEqual({
      ready: false,
      resolved: '',
    });
  });

  it('shows the signed file only after that same path has resolved', () => {
    expect(documentPreviewState('company/vehicles_19807/memo.pdf', {
      raw: 'company/vehicles_19807/memo.pdf',
      resolved: 'https://example.test/memo.pdf',
    })).toEqual({
      ready: true,
      resolved: 'https://example.test/memo.pdf',
    });
  });

  it('reports a real failure only after the requested path comes back empty', () => {
    expect(documentPreviewState('company/vehicles_19807/memo.pdf', {
      raw: 'company/vehicles_19807/memo.pdf',
      resolved: '',
    })).toEqual({ ready: true, resolved: '' });
  });
});
