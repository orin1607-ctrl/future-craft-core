/**
 * carPartBridge.ts
 * Car-Part (car-part.co.il) bridge for the claims module — STAGING.
 *
 * Car-Part has no public API and its login cookie has no SameSite=None, so it cannot run logged-in
 * inside an iframe of our site. The bridge therefore:
 *  - opens Car-Part in a named side window (the user's own subscription / browser session),
 *  - detects mobile vs desktop devices and opens either desktop or mobile site accordingly,
 *  - remembers which claim the window was opened from (localStorage, no passwords stored),
 *  - saves the tender PDF the user produced in Car-Part into that claim's documents through the
 *    existing claims-docs `staff_upload`, tagged with claim number + vehicle plate.
 * Nothing here talks to Car-Part servers directly.
 */

export const CARPART_ORIGIN = 'https://car-part.co.il';
/** Desktop "find parts" screen */
export const CARPART_FIND_PARTS_URL = `${CARPART_ORIGIN}/csm/client/requestpart/findparts.jsp`;
/** Desktop "my requests" screen — where tender answers and print reports live. */
export const CARPART_REQUESTS_URL = `${CARPART_ORIGIN}/csm/client/requestpart/requestedPartsStatus.jsp`;
/** Mobile site entrance — Car-Part dedicated mobile view */
export const CARPART_MOBILE_URL = `${CARPART_ORIGIN}/m/`;
/** Mobile search / parts screen */
export const CARPART_MOBILE_SEARCH_URL = `${CARPART_ORIGIN}/m/search_car.jsp`;
export const CARPART_HOME_URL = `${CARPART_ORIGIN}/`;

/** Marker kept in doc_meta.staff_title / staff_note so Car-Part documents can be listed per claim. */
export const CARPART_TITLE_PREFIX = 'Car-Part – מכרז חלקי חילוף';
export const CARPART_NOTE_TAG = '[carpart_tender]';
/** Existing server-side staff type (claims-docs STAFF_TYPES) — no backend change needed. */
export const CARPART_STAFF_TYPE = 'other';

const SESSION_KEY = 'dalia.claims.carpart.session.v1';
/** A Car-Part session context older than this is not offered for auto-linking. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type CarPartClaimContext = {
  claimId: string;
  claimNum: string;
  plate: string;
  carModel: string;
  clientName: string;
};

export type CarPartSession = CarPartClaimContext & { openedAt: string };

export type CarPartFileLike = {
  id: string;
  original_name: string;
  created_at: string;
  mime_type?: string;
  doc_meta?: Record<string, string> | null;
};

function clean(v: unknown) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

/** Check if current client is mobile browser */
export function isCarPartMobileClient(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) || window.innerWidth <= 768;
}

/**
 * Returns the best URL for opening Car-Part based on device type:
 * Desktop -> full CRM client/findparts.jsp
 * Mobile -> dedicated /m/ interface
 */
export function getCarPartTenderUrl(isMobile = isCarPartMobileClient()): string {
  return isMobile ? CARPART_MOBILE_URL : CARPART_FIND_PARTS_URL;
}

export function getCarPartRequestsUrl(isMobile = isCarPartMobileClient()): string {
  return isMobile ? CARPART_MOBILE_URL : CARPART_REQUESTS_URL;
}

/** Israeli plates are stored with or without dashes — keep digits only for matching / file names. */
export function plateDigits(plate: string) {
  return clean(plate).replace(/\D/g, '');
}

export function contextFromClaim(c: Record<string, string | undefined> & { id: string }): CarPartClaimContext {
  return {
    claimId: clean(c.id),
    claimNum: clean(c.claimNum),
    plate: clean(c.plate),
    carModel: clean([c.carMake, c.carModel].filter(Boolean).join(' ')),
    clientName: clean(c.clientName),
  };
}

/** Title shown in the claim's document gallery (claims-docs trims to 120 chars). */
export function buildTenderTitle(ctx: CarPartClaimContext, tenderRef = '') {
  const parts = [CARPART_TITLE_PREFIX];
  parts.push(`תביעה ${ctx.claimNum || ctx.claimId}`);
  if (ctx.plate) parts.push(`רכב ${ctx.plate}`);
  const ref = clean(tenderRef);
  if (ref) parts.push(`בקשה ${ref}`);
  return parts.join(' · ').slice(0, 120);
}

/** Internal note: the fixed link between the tender and the claim / vehicle (claims-docs trims to 500). */
export function buildTenderNote(ctx: CarPartClaimContext, opts: { tenderRef?: string; savedAt?: Date; userNote?: string } = {}) {
  const at = (opts.savedAt || new Date()).toISOString();
  const lines = [
    CARPART_NOTE_TAG,
    `מזהה תיק: ${ctx.claimId}`,
    `מספר תביעה: ${ctx.claimNum || '—'}`,
    `מספר רכב: ${ctx.plate || '—'}`,
  ];
  if (ctx.carModel) lines.push(`דגם: ${ctx.carModel}`);
  if (ctx.clientName) lines.push(`לקוח: ${ctx.clientName}`);
  const ref = clean(opts.tenderRef);
  if (ref) lines.push(`מספר בקשה ב-Car-Part: ${ref}`);
  lines.push(`נשמר: ${at}`);
  const note = clean(opts.userNote);
  if (note) lines.push(`הערה: ${note}`);
  return lines.join('\n').slice(0, 500);
}

function safeFilePart(v: string) {
  return clean(v).replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function extOf(name: string, mime: string) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name || '');
  if (m) return m[1].toLowerCase();
  if (/pdf/i.test(mime)) return 'pdf';
  if (/png/i.test(mime)) return 'png';
  if (/jpe?g/i.test(mime)) return 'jpg';
  return 'pdf';
}

/** Stored file name: CarPart-מכרז-<claim>-<plate>-<yyyy-mm-dd>.<ext> */
export function buildTenderFileName(ctx: CarPartClaimContext, originalName: string, mime = '', now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const parts = ['CarPart', 'מכרז', safeFilePart(ctx.claimNum || ctx.claimId)];
  const plate = plateDigits(ctx.plate);
  if (plate) parts.push(plate);
  parts.push(day);
  return `${parts.filter(Boolean).join('-')}.${extOf(originalName, mime)}`;
}

/** File types the claims-docs upload accepts that make sense for a tender document. */
export function isAcceptedTenderFile(name: string, mime: string) {
  const n = String(name || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf' || n.endsWith('.pdf')) return true;
  if (/^image\/(png|jpe?g|webp)$/.test(m) || /\.(png|jpe?g|webp)$/.test(n)) return true;
  return false;
}

export function isCarPartFile(f: CarPartFileLike) {
  const meta = f.doc_meta && typeof f.doc_meta === 'object' ? f.doc_meta : {};
  if (String(meta.staff_note || '').includes(CARPART_NOTE_TAG)) return true;
  if (String(meta.staff_title || '').startsWith(CARPART_TITLE_PREFIX)) return true;
  return /^CarPart-מכרז-/i.test(String(f.original_name || ''));
}

export function carPartFiles<T extends CarPartFileLike>(files: T[]): T[] {
  return files.filter(isCarPartFile).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function rememberSession(ctx: CarPartClaimContext, now = new Date(), store: StorageLike | null = storage()): CarPartSession {
  const session: CarPartSession = { ...ctx, openedAt: now.toISOString() };
  try { store?.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private mode */ }
  return session;
}

export function readSession(now = new Date(), store: StorageLike | null = storage()): CarPartSession | null {
  try {
    const raw = store?.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<CarPartSession>;
    if (!s || !s.claimId || !s.openedAt) return null;
    const age = now.getTime() - new Date(s.openedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > SESSION_MAX_AGE_MS) return null;
    return {
      claimId: clean(s.claimId),
      claimNum: clean(s.claimNum),
      plate: clean(s.plate),
      carModel: clean(s.carModel),
      clientName: clean(s.clientName),
      openedAt: s.openedAt,
    };
  } catch {
    return null;
  }
}

export function clearSession(store: StorageLike | null = storage()) {
  try { store?.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Window name per claim, so re-clicking focuses the same Car-Part window instead of opening many. */
export function carPartWindowName(claimId: string) {
  return `carpart_${clean(claimId).replace(/[^A-Za-z0-9_]/g, '_') || 'claim'}`;
}

/**
 * Window features:
 * - On phone/mobile: do not pass tiny popup bounds that break browser mobile tabs; open natural full tab/window.
 * - On desktop: side-by-side window positioned nicely on the screen.
 */
export function carPartWindowFeatures(screenW: number, screenH: number, isMobile = isCarPartMobileClient()): string {
  if (isMobile || (screenW && screenW <= 768)) {
    return '';
  }
  const w = Math.max(900, Math.round((screenW || 1400) * 0.6));
  const h = Math.max(700, Math.round((screenH || 900) * 0.9));
  return `popup=yes,width=${w},height=${h},left=0,top=0,resizable=yes,scrollbars=yes`;
}
