import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { checkExistingCustomer } from '@/features/telemarketing/services/telemarketingService';
import type { CustomerRef, ExistingCustomerLookup } from '@/features/telemarketing/types';

export function CustomerCallCard({ customer, leadNumber }: { customer: CustomerRef; leadNumber?: string | null }) {
  const [lookup, setLookup] = useState<ExistingCustomerLookup | null>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!customer.phone && !customer.companyName) return;
    setLoadingLookup(true);
    checkExistingCustomer(customer.phone, customer.companyName)
      .then((res) => {
        if (!cancelled) setLookup(res);
      })
      .finally(() => {
        if (!cancelled) setLoadingLookup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer.phone, customer.companyName]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">
            {leadNumber ? `ליד #${leadNumber} — ` : ''}
            {customer.companyName || 'ללא שם חברה'}
          </h2>
          {customer.contactName && (
            <p className="text-sm text-muted-foreground">
              {customer.contactName}
              {customer.contactRole ? ` · ${customer.contactRole}` : ''}
            </p>
          )}
        </div>
        {customer.vehicleCount != null && (
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {customer.vehicleCount} רכבים
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
          >
            <Phone size={18} /> {customer.phone}
          </a>
        )}
        {customer.city && <span className="rounded-xl bg-muted px-3 py-2 text-muted-foreground">{customer.city}</span>}
        {customer.email && <span className="rounded-xl bg-muted px-3 py-2 text-muted-foreground break-all">{customer.email}</span>}
      </div>

      {loadingLookup && <p className="mt-3 text-xs text-muted-foreground">בודק היסטוריה קודמת...</p>}

      {lookup?.found && (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <p className="font-bold">לקוח קיים</p>
          <p>
            שיחה אחרונה: {lookup.lastCallDate} {lookup.lastCallTime} · תוצאה: {lookup.lastResult || '-'}
          </p>
          {lookup.lastSummary && <p className="mt-1 text-muted-foreground">"{lookup.lastSummary}"</p>}
          {lookup.openFollowUp && (
            <p className="mt-1 font-semibold">
              יש Follow-up פתוח למועד {lookup.openFollowUp.dueDate} — {lookup.openFollowUp.actionNeeded}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
