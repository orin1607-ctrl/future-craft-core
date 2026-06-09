import { Mail, RefreshCw, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  type AccessCodeConfig,
  generateAccessCode,
  FUTURE_ROTATION_POLICY,
} from '@/lib/accessCodeTypes';

interface AccessCodePanelProps {
  config: AccessCodeConfig;
  onChange: (next: AccessCodeConfig) => void;
  loginEmail?: string;
  disabled?: boolean;
}

export default function AccessCodePanel({ config, onChange, loginEmail, disabled }: AccessCodePanelProps) {
  const set = (patch: Partial<AccessCodeConfig>) => onChange({ ...config, ...patch });

  const handleGenerate = () => {
    set({ mode: 'auto', code: generateAccessCode() });
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <KeyRound size={18} className="text-primary" />
          קוד גישה והרשאות
        </h3>
        <Badge variant="outline" className="text-xs">staging</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={config.mode === 'manual' ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => set({ mode: 'manual' })}
        >
          קוד ידני
        </Button>
        <Button
          type="button"
          size="sm"
          variant={config.mode === 'auto' ? 'default' : 'outline'}
          disabled={disabled}
          onClick={handleGenerate}
          className="gap-1.5"
        >
          <RefreshCw size={14} />
          קוד אוטומטי
        </Button>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">קוד גישה</label>
        <Input
          value={config.code}
          onChange={(e) => set({ mode: 'manual', code: e.target.value.toUpperCase() })}
          placeholder="הזן או צור קוד"
          dir="ltr"
          className="text-right font-mono tracking-widest"
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={config.sendToEmail}
            onCheckedChange={(v) => set({ sendToEmail: v })}
            disabled={disabled || !loginEmail}
          />
          <span className="text-sm flex items-center gap-1.5">
            <Mail size={14} />
            שליחת קוד לאימייל
          </span>
        </div>
        {!loginEmail && (
          <span className="text-xs text-muted-foreground">נדרש אימייל התחברות</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={config.requireVerification}
            onCheckedChange={(v) => set({ requireVerification: v })}
            disabled={disabled}
          />
          <span className="text-sm flex items-center gap-1.5">
            <ShieldCheck size={14} />
            אימות קוד על ידי המשתמש
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-bold text-foreground">תכנון עתידי — רוטציה אוטומטית</p>
        <p>
          כל {FUTURE_ROTATION_POLICY.intervalMonths} חודשים: המערכת תייצר קוד חדש, תשלח למשתמש, ותבטל את הקוד הקודם.
          המשתמש יתחבר עם הקוד החדש לאחר אימות.
        </p>
        <p className="opacity-70">סטטוס: מוכן במבנה · לא מופעל · דורש טבלת user_access_codes</p>
      </div>
    </div>
  );
}
