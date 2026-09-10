import { useState } from 'react';
import { Button } from '@/components/ui/button';
import ExpiryRenewDialog from '@/components/expiry/ExpiryRenewDialog';
import { canApproveExpiryRenewal, type PendingExpiryItem } from '@/lib/expiryOfficerApproval';
import { useAuth } from '@/contexts/AuthContext';

export default function ExpiryPendingInline({
  item,
  onApproved,
}: {
  item: PendingExpiryItem;
  onApproved?: (newDate: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const canApprove = canApproveExpiryRenewal(user?.role);

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <p className="text-xs font-bold text-destructive">
        {item.kindLabel} — פג תוקף — ממתין לאישור
      </p>
      {canApprove && (
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
          עדכן ואשר
        </Button>
      )}
      <ExpiryRenewDialog item={item} open={open} onOpenChange={setOpen} onApproved={onApproved} />
    </div>
  );
}
