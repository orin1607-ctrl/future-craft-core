export type TeleEntryMode = 'work' | 'inspect';

const AGENT_PREFIX = 'tele_entry_mode_v1:';
const ADMIN_PREFIX = 'tele_admin_inspect_v1:';

export const TELE_AUDIT_ACTION = {
  choseWork: 'טלמיטינג: כניסה לעבודה',
  choseInspect: 'טלמיטינג: כניסה לבדיקה',
  switchToWork: 'טלמיטינג: מעבר למצב עבודה',
  adminOn: 'טלמיטינג: מצב בדיקת מנהל־על הופעל',
  adminOff: 'טלמיטינג: מצב בדיקת מנהל־על כובה',
} as const;

function store(): Storage | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

export function agentModeKey(userId: string): string {
  return `${AGENT_PREFIX}${userId}`;
}

export function adminInspectKey(userId: string): string {
  return `${ADMIN_PREFIX}${userId}`;
}

export function getAgentEntryMode(userId: string): TeleEntryMode | null {
  if (!userId) return null;
  const raw = store()?.getItem(agentModeKey(userId));
  if (raw === 'work' || raw === 'inspect') return raw;
  return null;
}

export function setAgentEntryMode(userId: string, mode: TeleEntryMode): void {
  if (!userId) return;
  store()?.setItem(agentModeKey(userId), mode);
}

export function needsPurposeChoice(userId: string): boolean {
  return Boolean(userId) && getAgentEntryMode(userId) === null;
}

export function isAgentInspect(userId: string): boolean {
  return getAgentEntryMode(userId) === 'inspect';
}

export function getAdminInspect(userId: string): boolean {
  if (!userId) return false;
  return store()?.getItem(adminInspectKey(userId)) === '1';
}

export function setAdminInspect(userId: string, on: boolean): void {
  if (!userId) return;
  store()?.setItem(adminInspectKey(userId), on ? '1' : '0');
}

export function businessActionsBlocked(mode: TeleEntryMode | null, adminInspect = false): boolean {
  return mode === 'inspect' || adminInspect;
}

export function clearTeleModesForUser(userId: string): void {
  if (!userId) return;
  const s = store();
  if (!s) return;
  s.removeItem(agentModeKey(userId));
  s.removeItem(adminInspectKey(userId));
}

export function clearAllTeleModes(): void {
  const s = store();
  if (!s) return;
  const keys: string[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (key && (key.startsWith(AGENT_PREFIX) || key.startsWith(ADMIN_PREFIX))) keys.push(key);
  }
  keys.forEach((key) => s.removeItem(key));
}

export function employeeFirstName(displayName: string | null | undefined): string {
  const trimmed = String(displayName || '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}
