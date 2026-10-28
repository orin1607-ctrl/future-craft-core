import { useEffect, useState } from 'react';

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already running in standalone (installed app) mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsInstalled(isStandalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (): Promise<boolean> => {
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
        setPromptEvent(null);
        return true;
      }
    } catch (err) {
      console.warn('[PWA] install prompt failed:', err);
    }
    return false;
  };

  return {
    canInstall: Boolean(promptEvent),
    isInstalled,
    triggerInstall,
  };
}
