import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * CO.CO דליה — ניהול שיווק (Super Admin only)
 * Embedded inside Dalia Layout — same header, sidebar, permissions.
 * Staging / workspace only (route gated in routeAccess.ts).
 */
export default function AiMarketingPage() {
  const { user } = useAuth();

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const base = import.meta.env.BASE_URL || '/';
  const src = `${base}ai-marketing-platform?embedded=1`;

  return (
    <div
      className="fixed z-10 bg-background left-0 right-0 md:right-72 top-16 md:top-0 bottom-16 md:bottom-0 -mx-4 md:-mx-8 -mt-4 md:-mt-8"
      style={{ marginBottom: 0 }}
    >
      <iframe
        title="ניהול שיווק — CO.CO דליה"
        src={src}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
