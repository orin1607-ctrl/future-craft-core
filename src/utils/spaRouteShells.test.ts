import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SPA route shells', () => {
  it('includes claims-share so the public surveyor link is HTTP 200 on Pages', () => {
    const src = readFileSync(join(process.cwd(), 'scripts/generate-spa-route-shells.mjs'), 'utf8');
    expect(src).toContain("'claims-upload'");
    expect(src).toContain("'claims-share'");
  });
});
