import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Regression: go-live commit removed assertClientStaging() but left calls on the
 * public /upload-request path → ReferenceError and a blank/broken customer link.
 */
describe('documentRequestClient public upload safety', () => {
  it('does not reference removed assertClientStaging helper', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'documentRequestClient.ts'), 'utf8');
    expect(src).not.toMatch(/assertClientStaging/);
    expect(src).toContain('export async function publicGetDocumentRequest');
    expect(src).toContain('export async function publicOpenDocumentRequest');
    expect(src).toContain('export async function publicUploadDocumentRequest');
  });
});
