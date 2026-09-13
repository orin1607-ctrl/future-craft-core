import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { GarageScreen } from '@/features/garage/GarageScreen';

export default function GaragePage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  return (
    <div className="-m-4 md:-m-8 h-[calc(100dvh-6.5rem)] md:h-[calc(100dvh)] overflow-hidden">
      <GarageScreen />
    </div>
  );
}
