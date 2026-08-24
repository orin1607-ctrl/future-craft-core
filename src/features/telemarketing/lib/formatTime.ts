import { localDateStr } from '@/features/telemarketing/lib/localDate';

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString('he-IL');
}

export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '-';
  return `${formatDay(iso)} ${formatClock(iso)}`;
}

export function formatTimeRange(startedAt: string | null | undefined, endedAt: string | null | undefined): string {
  if (!startedAt) return '-';
  return `${formatClock(startedAt)}–${endedAt ? formatClock(endedAt) : 'פעיל'}`;
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds == null) return '-';
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function dayKey(iso: string): string {
  return localDateStr(new Date(iso));
}

export function inDayRange(iso: string, from?: string, to?: string): boolean {
  const day = dayKey(iso);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
