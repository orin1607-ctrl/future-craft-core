import { localDateStr } from '@/features/telemarketing/lib/localDate';

export type ActivityDatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export function activityDatePreset(kind: ActivityDatePreset, now = new Date()): { from: string; to: string } {
  const today = localDateStr(now);
  if (kind === 'today') return { from: today, to: today };
  if (kind === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const day = localDateStr(y);
    return { from: day, to: day };
  }
  if (kind === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    return { from: localDateStr(start), to: today };
  }
  if (kind === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localDateStr(start), to: today };
  }
  return { from: today, to: today };
}
