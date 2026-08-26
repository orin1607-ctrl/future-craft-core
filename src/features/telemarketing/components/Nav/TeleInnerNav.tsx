import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmTeleLeave, createTeleCloserStack } from '@/features/telemarketing/lib/teleInnerNav';

type TeleOverlayNavValue = {
  pushCloser: (fn: () => void) => () => void;
  goBack: () => boolean;
  goHome: () => void;
  homePath: string;
  homeAnchorId: string;
};

const TeleOverlayNavContext = createContext<TeleOverlayNavValue | null>(null);

export function TeleOverlayNavProvider({
  homePath,
  homeAnchorId,
  children,
}: {
  homePath: string;
  homeAnchorId: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const stackRef = useRef(createTeleCloserStack());

  const pushCloser = useCallback((fn: () => void) => stackRef.current.push(fn), []);
  const goBack = useCallback(() => stackRef.current.goBack(), []);
  const goHome = useCallback(() => {
    stackRef.current.closeAll();
    navigate({ pathname: homePath, search: '', hash: '' });
    requestAnimationFrame(() => {
      document.getElementById(homeAnchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [homeAnchorId, homePath, navigate]);

  const value = useMemo(
    () => ({ pushCloser, goBack, goHome, homePath, homeAnchorId }),
    [pushCloser, goBack, goHome, homePath, homeAnchorId],
  );

  return <TeleOverlayNavContext.Provider value={value}>{children}</TeleOverlayNavContext.Provider>;
}

export function useOptionalTeleOverlayNav() {
  return useContext(TeleOverlayNavContext);
}

export function useRegisterTeleCloser(active: boolean, close: () => void) {
  const ctx = useContext(TeleOverlayNavContext);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active || !ctx) return;
    return ctx.pushCloser(() => closeRef.current());
  }, [active, ctx]);
}

export function TeleInnerNav({
  onBack,
  onHome,
  confirmLeave,
  backTestId = 'tele-nav-back',
  homeTestId = 'tele-nav-home',
}: {
  onBack?: () => void;
  onHome?: () => void;
  confirmLeave?: string | null;
  backTestId?: string;
  homeTestId?: string;
}) {
  const ctx = useOptionalTeleOverlayNav();
  const handleBack = () => {
    if (!confirmTeleLeave(confirmLeave)) return;
    if (onBack) onBack();
    else ctx?.goBack();
  };
  const handleHome = () => {
    if (!confirmTeleLeave(confirmLeave)) return;
    if (onHome) onHome();
    else ctx?.goHome();
  };
  if (!onBack && !onHome && !ctx) return null;
  return (
    <div
      className="sticky top-0 z-20 mb-3 space-y-2 bg-card/95 pb-2 pt-1 backdrop-blur"
      data-testid="tele-nav-bar"
    >
      <button
        type="button"
        data-testid={backTestId}
        data-dalia-back-telemarketing=""
        onClick={handleBack}
        className="min-h-12 w-full rounded-xl border border-border bg-background px-4 text-base font-black"
      >
        ← חזרה למסך הקודם
      </button>
      <button
        type="button"
        data-testid={homeTestId}
        data-dalia-back-agent-home=""
        onClick={handleHome}
        className="min-h-12 w-full rounded-xl bg-primary px-4 text-base font-black text-primary-foreground"
      >
        🏠 חזרה לדשבורד הראשי
      </button>
    </div>
  );
}
