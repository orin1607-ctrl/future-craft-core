export function homePathForRole(role?: string, extras?: { claimsWorkerOnly?: boolean }): string {
  if (extras?.claimsWorkerOnly) return '/claims';
  if (role === 'telemarketing_agent') return '/telemarketing';
  return '/dashboard';
}

/** Agents always land on the caller home after login — never a chat overlay. */
export function postLoginPathForRole(
  role: string | undefined,
  intended: string,
  extras?: { claimsWorkerOnly?: boolean },
): string {
  if (extras?.claimsWorkerOnly) return '/claims';
  if (role === 'telemarketing_agent') return '/telemarketing';
  return intended;
}

/** Full document load of work home so a cached SPA cannot keep a previous chat screen. */
export function replaceToAgentWorkHome() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const v = String(import.meta.env.VITE_BUILD_COMMIT || Date.now()).slice(0, 7);
  window.location.replace(`${base}/telemarketing?v=${encodeURIComponent(v)}`);
}
