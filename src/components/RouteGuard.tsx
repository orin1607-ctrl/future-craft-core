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
    garagePhotographer: user.garagePhotographer,
  })) {
    const home = user.garagePhotographer
      ? '/garage'
      : user.claimsWorkerOnly
      ? '/claims'
      : user.role === 'telemarketing_agent'
        ? '/telemarketing'
        : '/dashboard';
    return <Navigate to={home} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
