import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  approveExpiryRenewal,
  canApproveExpiryRenewal,
  formatExpiryHe,
  validateNewExpiryDate,
  type PendingExpiryItem,
} from '@/lib/expiryOfficerApproval';

export default function ExpiryRenewDialog({
  item,
  open,
  onOpenChange,
  onApproved,
}: {
  item: PendingExpiryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved?: (newDate: string) => void;
}) {
  const { user } = useAuth();
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);

  const allowed = canApproveExpiryRenewal(user?.role);
  const error = item ? validateNewExpiryDate(newDate, item.oldDate) : 'לא הוזן תאריך חדש';

  const close = () => {
    setNewDate('');
    onOpenChange(false);
  };

  const submit = async () => {
    if (!item || !user || error) return;
    setSaving(true);
    const result = await approveExpiryRenewal({
      item,
      newDate,
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        company_name: user.company_name,
      },
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('החידוש אושר והתאריך עודכן');
    onApproved?.(result.newDate);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>עדכן ואשר</DialogTitle>
          <DialogDescription>
            {item ? `${item.displayName} · ${item.kindLabel}` : ''}
          </DialogDescription>
        </DialogHeader>
        {item && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">סוג</p>
              <p className="font-bold">{item.kindLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">תאריך קודם</p>
              <p className="font-bold">{formatExpiryHe(item.oldDate)}</p>
            </div>
            <div>
              <label htmlFor="expiry-new-date" className="text-xs text-muted-foreground block mb-1">
                תאריך חדש
              </label>
              <input
                id="expiry-new-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
              />
              {newDate && error && <p className="text-xs text-destructive mt-1">{error}</p>}
            </div>
            {!allowed && (
              <p className="text-xs text-destructive">רק מנהל צי או מנהל מערכת יכולים לאשר חידוש.</p>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={close}>
            ביטול
          </Button>
          <Button type="button" disabled={!item || !!error || !allowed || saving} onClick={submit}>
            {saving ? 'מאשר…' : 'אשר חידוש'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
