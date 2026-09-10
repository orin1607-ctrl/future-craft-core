import { useEffect, useState } from 'react';
import { getFollowUpWorkItems } from '@/features/telemarketing/services/telemarketingService';
import { FollowUpBoard, dueCount } from '@/features/telemarketing/components/FollowUp/FollowUpBoard';
import type { FollowUpWorkItem, TelemarketingEmployee } from '@/features/telemarketing/types';

export function MyFollowUps({
  onStartReturn,
  reloadToken,
  currentEmployee,
  startLocked = false,
}: {
  onStartReturn: (item: FollowUpWorkItem) => void;
  reloadToken?: number;
  currentEmployee?: TelemarketingEmployee;
  startLocked?: boolean;
}) {
  const [items, setItems] = useState<FollowUpWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const badge = dueCount(items);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getFollowUpWorkItems()
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאה בטעינת החזרות');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return (
    <section id="my-followups" className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="tele-continue-treatment">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-black">המשך טיפול</h2>
        {badge > 0 && (
          <span className="min-w-8 rounded-full bg-destructive px-2 py-1 text-center text-sm font-bold text-destructive-foreground">
            {badge}
          </span>
        )}
      </div>
      {loading && <p className="text-sm text-muted-foreground">טוען החזרות...</p>}
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      {!loading && !error && (
        <FollowUpBoard
          items={items}
          hideEmployeeFilter
          allowStartReturn
          startLocked={startLocked}
          onStartReturn={onStartReturn}
          actor={currentEmployee ? { id: currentEmployee.id, displayName: currentEmployee.displayName } : undefined}
        />
      )}
    </section>
  );
}
