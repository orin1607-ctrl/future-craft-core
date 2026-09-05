import { ReactNode } from 'react';
import { useDriverActionVisibility } from '@/hooks/useDriverActionVisibility';
import { findActionByRoute } from '@/lib/driverAppActions';
import { useLocation } from 'react-router-dom';

/** Hides a driver page when Super Admin turned that action OFF. Does not remove the feature for managers. */
export default function DriverActionGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { loading, isPathVisible } = useDriverActionVisibility();
  const action = findActionByRoute(location.pathname);

  if (loading) {
    return (
      <div className="animate-fade-in text-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  if (!isPathVisible(location.pathname)) {
    return (
      <div className="animate-fade-in text-center py-16 card-elevated">
        <p className="text-xl font-bold mb-2">פעולה זו אינה זמינה</p>
        <p className="text-muted-foreground">
          {action ? `${action.label} הוסתרה לנהגי החברה.` : 'המסך הוסתר לנהגי החברה.'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
