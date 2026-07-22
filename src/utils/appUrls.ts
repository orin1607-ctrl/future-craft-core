/**
 * Build absolute public app URLs that respect Vite BASE_URL
 * (e.g. Staging GitHub Pages at /future-craft-core/).
 */
export function getAppBasePath(): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
}

export function buildPublicAppUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = getAppBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${base}${normalized}`;
}

export function buildSignDeclarationUrl(token: string): string {
  return buildPublicAppUrl(`/sign-declaration?token=${encodeURIComponent(token)}`);
}
