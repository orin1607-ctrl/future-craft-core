import { useState, useEffect, useCallback } from 'react';
import { completeFollowUp, getFollowUps } from '@/features/telemarketing/services/telemarketingService';
import type { TelemarketingFollowUp } from '@/features/telemarketing/types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface FollowUpGroups {
  urgent: TelemarketingFollowUp[];
  today: TelemarketingFollowUp[];
  late: TelemarketingFollowUp[];
  future: TelemarketingFollowUp[];
  done: TelemarketingFollowUp[];
}

export function useFollowUps() {
  const [groups, setGroups] = useState<FollowUpGroups>({
    urgent: [],
    today: [],
    late: [],
    future: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [open, done] = await Promise.all([getFollowUps({ status: 'open' }), getFollowUps({ status: 'done' })]);
      const today = todayStr();
      const urgent: TelemarketingFollowUp[] = [];
      const todayList: TelemarketingFollowUp[] = [];
      const late: TelemarketingFollowUp[] = [];
      const future: TelemarketingFollowUp[] = [];

      for (const f of open) {
        if (f.urgency === 'דחוף') urgent.push(f);
        else if (f.dueDate < today) late.push(f);
        else if (f.dueDate === today) todayList.push(f);
        else future.push(f);
      }

      setGroups({ urgent, today: todayList, late, future, done });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת Follow-ups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markDone = useCallback(
    async (followUpId: string, completedBy: string) => {
      await completeFollowUp(followUpId, completedBy);
      await load();
    },
    [load],
  );

  return { groups, loading, error, reload: load, markDone };
}
