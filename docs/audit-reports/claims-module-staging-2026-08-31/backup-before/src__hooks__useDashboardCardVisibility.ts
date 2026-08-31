import { useAuth } from '@/contexts/AuthContext';
import { useHiddenButtons } from '@/hooks/useHiddenButtons';
import { useTransportModule } from '@/hooks/useTransportModule';

/** Dashboard card visible when not in hidden_buttons and transport master switch when relevant. */
export function useDashboardCardVisible(path: string): boolean {
  const { user } = useAuth();
  const hidden = useHiddenButtons();
  const { enabled: transportEnabled, loading } = useTransportModule();

  if (user?.role === 'super_admin') return true;
  if (hidden.includes(path)) return false;

  if (path === '/transport') {
    if (loading) return false;
    return transportEnabled;
  }

  return true;
}
