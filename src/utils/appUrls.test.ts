import { describe, expect, it } from 'vitest';
import { buildPublicAppUrl, buildSignDeclarationUrl, getAppBasePath } from '@/utils/appUrls';

describe('appUrls', () => {
  it('builds sign declaration URL with current origin', () => {
    const url = buildSignDeclarationUrl('abc123');
    expect(url).toContain('/sign-declaration?token=abc123');
    expect(url.startsWith('http')).toBe(true);
  });

  it('respects BASE_URL path prefix when present', () => {
    // BASE_URL comes from Vite; in tests it is usually '/'
    const base = getAppBasePath();
    const url = buildPublicAppUrl('/sign-declaration?token=x');
    if (base) {
      expect(url).toContain(`${base}/sign-declaration?token=x`);
    } else {
      expect(url).toContain('/sign-declaration?token=x');
    }
  });
});
