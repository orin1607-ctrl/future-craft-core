import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ClaimsScreen } from '@/features/claims/ClaimsScreen';

export default function ClaimsPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'super_admin' && !user.hasClaimsAccess) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <div className="-m-4 md:-m-8 min-h-[calc(100dvh-4rem)] md:h-[calc(100dvh)] overflow-x-hidden md:overflow-hidden flex flex-col">
      <ClaimsScreen
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
