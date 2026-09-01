import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/routeAccess';

/** UI-level route guard — redirects unauthorized roles to dashboard. */
export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  if (!canAccessRoute(location.pathname, user.role, {
    hasClaimsAccess: user.hasClaimsAccess,
    claimsWorkerOnly: user.claimsWorkerOnly,
  })) {
    void import('@/lib/securityAuditClient').then(({ securityRecordClientEvent }) => {
      securityRecordClientEvent('unauthorized_page', {
        action: 'גישה לעמוד מוגן',
        result: 'נדחה',
      }).catch(() => undefined);
    });
    return <Navigate to={user.claimsWorkerOnly ? '/claims' : '/dashboard'} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
