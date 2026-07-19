/** Persist intended post-login path (deep link to incident). */
const KEY = 'dalia_post_login_redirect';

export function setPostLoginRedirect(path: string) {
  try {
    if (!path || path === '/login' || path === '/about') return;
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumePostLoginRedirect(fallback = '/dashboard'): string {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (v && v.startsWith('/')) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function captureCurrentPathForLogin() {
  try {
    const path = `${window.location.pathname}${window.location.search}`;
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    let relative = path;
    if (base && path.startsWith(base)) relative = path.slice(base.length) || '/';
    if (!relative.startsWith('/')) relative = `/${relative}`;
    if (relative !== '/login' && relative !== '/about') setPostLoginRedirect(relative);
  } catch {
    /* ignore */
  }
}
