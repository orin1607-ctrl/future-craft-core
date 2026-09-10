import { useState, useEffect, useCallback } from 'react';
import { getAgentPerformance } from '@/features/telemarketing/services/telemarketingService';
import type { AgentPerformance } from '@/features/telemarketing/types';

export function useAgentPerformance() {
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAgents(await getAgentPerformance());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת ביצועי עובדים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { agents, loading, error, reload: load };
}
