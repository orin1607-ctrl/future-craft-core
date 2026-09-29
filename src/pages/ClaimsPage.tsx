import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ClaimsScreen } from '@/features/claims/ClaimsScreen';
import { CLAIMS_V2_PATH, isClaimsV2Enabled } from '@/features/claims-v2/claimsV2Flag';

export default function ClaimsPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'super_admin' && !user.hasClaimsAccess) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <div className="-m-4 md:-m-8 h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh)] overflow-hidden relative">
      <ClaimsScreen
        actor={{
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          hasClaimsAccess: user.hasClaimsAccess,
        }}
      />
      {isClaimsV2Enabled() ? (
        <Link
          to={CLAIMS_V2_PATH}
          data-testid="claims-v2-open"
          className="absolute bottom-3 left-3 z-40 rounded-full bg-[#1f3a68] px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-[#2a4b85]"
        >
          ממשק חדש – ניסיון
        </Link>
      ) : null}
    </div>
  );
}
