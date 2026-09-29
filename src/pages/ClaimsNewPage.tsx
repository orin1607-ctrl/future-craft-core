import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ClaimsV2Screen from '@/features/claims-v2/ClaimsV2Screen';
import { isClaimsV2Enabled } from '@/features/claims-v2/claimsV2Flag';

/** STAGING-only trial of the new claims UI. Same access rule as ClaimsPage. */
export default function ClaimsNewPage() {
  const { user } = useAuth();
  if (!isClaimsV2Enabled()) return <Navigate to="/claims" replace />;
  if (!user) return null;
  if (user.role !== 'super_admin' && !user.hasClaimsAccess) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <div className="-m-4 md:-m-8 h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh)] overflow-hidden">
      <ClaimsV2Screen
        actor={{
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          hasClaimsAccess: user.hasClaimsAccess,
        }}
      />
    </div>
  );
}
