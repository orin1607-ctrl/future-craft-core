import { useState, useEffect, useCallback, useRef } from 'react';
import { getDashboardData } from '@/features/telemarketing/services/telemarketingService';
import type { TelemarketingCall, TelemarketingDashboardSummary } from '@/features/telemarketing/types';

export interface CallWithPriority extends TelemarketingCall {
  isLate: boolean;
  isToday: boolean;
  priority: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function priorityScore(c: TelemarketingCall, isLate: boolean, isToday: boolean): number {
  let score = 0;
  if (c.followUpUrgency === 'דחוף' || c.leadRating === 'דחוף') score += 50;
  else if (c.leadRating === 'חם') score += 40;
  if (isLate) score += 35;
  if (isToday) score += 25;
  if (c.leadRating === 'פושר') score += 10;
  return score;
}

export function useTelemarketingDashboard(autoRefreshMs = 60000) {
  const [calls, setCalls] = useState<CallWithPriority[]>([]);
  const [summary, setSummary] = useState<TelemarketingDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { calls: rawCalls, summary: s } = await getDashboardData(300);
      const today = todayStr();
      const withPriority: CallWithPriority[] = rawCalls.map((c) => {
        const isLate = !!c.followUpDate && c.followUpDate < today && c.needsFollowUp;
        const isToday = !!c.followUpDate && c.followUpDate === today && c.needsFollowUp;
        return { ...c, isLate, isToday, priority: priorityScore(c, isLate, isToday) };
      });
      withPriority.sort((a, b) => b.priority - a.priority);
      setCalls(withPriority);
      setSummary(s);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => void load(), autoRefreshMs);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, autoRefreshMs, load]);

  return { calls, summary, loading, error, lastUpdated, reload: load, autoRefresh, setAutoRefresh };
}
