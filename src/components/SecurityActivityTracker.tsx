import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { securityEndSession, securityHeartbeat, securityStartSession } from '@/lib/securityAuditClient';

const HEARTBEAT_MS = 45_000;
const IDLE_MS = 5 * 60_000;

/** Counts real activity via heartbeat while the tab is visible and recently used. */
export default function SecurityActivityTracker() {
  const { isAuthenticated } = useAuth();
  const lastInput = useRef(Date.now());

  useEffect(() => {
    if (!isAuthenticated) return;

    const mark = () => {
      lastInput.current = Date.now();
    };
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    window.addEventListener('scroll', mark, { passive: true });

    let cancelled = false;
    securityStartSession().catch(() => undefined);

    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInput.current > IDLE_MS) return;
      securityHeartbeat().catch(() => undefined);
    }, HEARTBEAT_MS);

    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        securityHeartbeat().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
      window.removeEventListener('scroll', mark);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) return;
    securityEndSession('logout').catch(() => undefined);
  }, [isAuthenticated]);

  return null;
}
