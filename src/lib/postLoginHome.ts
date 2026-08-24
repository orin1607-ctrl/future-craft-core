export function homePathForRole(role?: string): string {
  if (role === 'telemarketing_agent') return '/telemarketing';
  return '/dashboard';
}

/** Agents always land on the caller home after login — never a chat overlay. */
export function postLoginPathForRole(role: string | undefined, intended: string): string {
  if (role === 'telemarketing_agent') return '/telemarketing';
  return intended;
}
