import type { TeamChatStatus } from '@/features/telemarketing/types';

export function isChatClosed(status: TeamChatStatus): boolean {
  return status === 'הושלם' || status === 'ארכיון';
}

export function openDurationSeconds(openedAt: string, closedAt: string | null, now = Date.now()): number {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : now;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function formatOpenDuration(openedAt: string, closedAt: string | null, now = Date.now()): string {
  const total = openDurationSeconds(openedAt, closedAt, now);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h >= 2) return `פתוח ${h} שעות ו-${m} דקות`;
  if (h === 1) return `פתוח שעה ו-${m} דקות`;
  return `פתוח כבר ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function validateDaliaCare(care: {
  needsDaliaCare?: boolean;
  daliaCareType?: string;
  daliaCareTypeOther?: string;
  daliaCareDetail?: string;
}): string | null {
  if (!care.needsDaliaCare) return null;
  if (!care.daliaCareType) return 'חובה לבחור סוג טיפול של צוות דליה';
  if (care.daliaCareType === 'אחר' && !care.daliaCareTypeOther?.trim()) return 'סוג אחר — חובה לפרט';
  if (!care.daliaCareDetail?.trim()) return 'חובה לכתוב מה צריך לבצע';
  return null;
}
