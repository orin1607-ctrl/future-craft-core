import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { setTwoFactorApproved } from '@/lib/authOtpClient';

interface TwoFactorApprovalSectionProps {
  userId: string;
  approved: boolean;
  approvedAt?: string | null;
  approvedByName?: string | null;
  disabled?: boolean;
  onUpdated: (approved: boolean) => void;
}

export default function TwoFactorApprovalSection({
  userId,
  approved,
  approvedAt,
  approvedByName,
  disabled,
  onUpdated,
}: TwoFactorApprovalSectionProps) {
  const [saving, setSaving] = useState(false);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    const result = await setTwoFactorApproved(userId, next);
    setSaving(false);
    if (result.success) {
      onUpdated(next);
    }
  };

  const formattedDate = approvedAt
    ? new Date(approvedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
          <Shield size={16} className="text-primary" />
          מאושר לאימות דו-שלבי
        </h3>
        <Badge variant="outline" className={approved ? 'border-green-500/40 text-green-700' : ''}>
          {approved ? '2FA מאושר' : '2FA לא מאושר'}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Two Factor Authentication Approved</span>
        <div className="flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          <Switch checked={approved} disabled={disabled || saving} onCheckedChange={handleToggle} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground border-t border-border pt-3">
        <div className="flex justify-between gap-2">
          <span>תאריך אישור:</span>
          <span className="font-medium text-foreground">{formattedDate}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>אושר על ידי:</span>
          <span className="font-medium text-foreground">{approvedByName || '—'}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        OTP באימייל בלבד — מופעל רק לאחר אישור מנהל. ברירת מחדל: לא מאושר.
      </p>
    </div>
  );
}
