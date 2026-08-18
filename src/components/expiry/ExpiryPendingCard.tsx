import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { loadPendingExpiryItems } from '@/lib/expiryOfficerApproval';

export default function ExpiryPendingCard({ companyFilter }: { companyFilter: string | null }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPendingExpiryItems(companyFilter)
      .then((items) => {
        if (!cancelled) setCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [companyFilter]);

  const pending = count ?? 0;
  const loading = count === null;
  const hasPending = pending > 0;

  return (
    <Link
      to="/expiry-approvals"
      className={`block rounded-xl border px-4 py-3 min-h-[72px] transition-colors ${
        hasPending
          ? 'border-destructive/50 bg-destructive/5 hover:border-destructive'
          : 'border-border bg-card hover:border-primary/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck size={18} className={hasPending ? 'text-destructive shrink-0' : 'text-muted-foreground shrink-0'} />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">ממתינים לאישור קצין רכב</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? 'טוען…' : hasPending ? 'פגי תוקף שטרם חודשו' : 'אין ממתינים'}
            </p>
          </div>
        </div>
        <span
          className={`text-lg font-black tabular-nums ${
            hasPending ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
          {loading ? '…' : pending}
        </span>
      </div>
    </Link>
  );
}
