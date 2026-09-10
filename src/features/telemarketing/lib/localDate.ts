export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTimeStr(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type FollowUpBucket = 'late' | 'today' | 'future' | 'done';

export function followUpBucket(dueDate: string, dueTime: string | null, status: 'open' | 'done'): FollowUpBucket {
  if (status === 'done') return 'done';
  const today = localDateStr();
  if (dueDate < today) return 'late';
  if (dueDate > today) return 'future';
  if (dueTime && dueTime.slice(0, 5) < localTimeStr()) return 'late';
  return 'today';
}
