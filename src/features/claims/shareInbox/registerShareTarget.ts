/**
 * "שתף לדליה" — Staging only. Adds the web app manifest (with share_target) and the share
 * service worker, so that after "Install app" in Chrome for Android, Dalia appears in the share sheet.
 * On any other build nothing is added and a previously installed share worker is removed.
 * Kill switch on a device: localStorage 'dalia-share-target' = 'off'.
 */
import { STAGING_PROJECT_ID } from '@/features/fleet-dalia-ai/stagingGate';

export const SHARE_KILL_KEY = 'dalia-share-target';
export const SHARE_SW_FILE = 'dalia-share-sw.js';
export const SHARE_MANIFEST_FILE = 'dalia-share.webmanifest';
/** The earlier staging share worker (registered from index.html). Replaced by SHARE_SW_FILE at the same scope. */
export const LEGACY_SW_FILE = 'sw-share.js';

function killed() {
  try {
    return localStorage.getItem(SHARE_KILL_KEY) === 'off';
  } catch {
    return false;
  }
}

export function isShareTargetEnabled(opts?: { projectId?: string; killed?: boolean }): boolean {
  const projectId = opts && 'projectId' in opts
    ? opts.projectId
    : (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined);
  const isKilled = opts && 'killed' in opts ? !!opts.killed : killed();
  return !isKilled && projectId === STAGING_PROJECT_ID;
}

async function removeShareWorker() {
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    const url = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
    if (url.endsWith(`/${SHARE_SW_FILE}`) || url.endsWith(`/${LEGACY_SW_FILE}`)) await reg.unregister();
  }
}

export function registerShareTarget() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!isShareTargetEnabled()) {
    void removeShareWorker().catch(() => undefined);
    return;
  }
  const base = import.meta.env.BASE_URL || '/';
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = `${base}${SHARE_MANIFEST_FILE}`;
    document.head.appendChild(link);
  }
  void navigator.serviceWorker.register(`${base}${SHARE_SW_FILE}`, { scope: base }).catch(() => undefined);
}
