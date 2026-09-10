import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  securityEndSession,
  securityHeartbeat,
  securityRecordClientEvent,
  securityStartSession,
} from '@/lib/securityAuditClient';

const HEARTBEAT_MS = 45_000;
const IDLE_MS = 5 * 60_000;
const PAGE_VIEW_THROTTLE_MS = 30_000;

/** Counts real activity via heartbeat while the tab is visible and recently used. */
export default function SecurityActivityTracker() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const lastInput = useRef(Date.now());
  const lastPageView = useRef<{ path: string; at: number }>({ path: '', at: 0 });

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

  useEffect(() => {
    if (!isAuthenticated) return;
    const path = location.pathname;
    const now = Date.now();
    if (path === lastPageView.current.path && now - lastPageView.current.at < PAGE_VIEW_THROTTLE_MS) return;
    lastPageView.current = { path, at: now };
    securityRecordClientEvent('page_view', {
      action: 'צפייה בעמוד',
      result: 'הצליח',
      path,
      objectType: 'page',
    }).catch(() => undefined);
  }, [isAuthenticated, location.pathname]);

  return null;
}
