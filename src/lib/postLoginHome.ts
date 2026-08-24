export function homePathForRole(role?: string): string {
  if (role === 'telemarketing_agent') return '/telemarketing';
  return '/dashboard';
}
