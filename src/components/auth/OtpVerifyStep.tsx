import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Button } from '@/components/ui/button';

interface OtpVerifyStepProps {
  email: string;
  loading?: boolean;
  error?: string;
  resendCooldown?: number;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
}

export default function OtpVerifyStep({
  email,
  loading,
  error,
  resendCooldown = 0,
  onVerify,
  onResend,
  onBack,
  title = 'אימות קוד',
  subtitle,
}: OtpVerifyStepProps) {
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(resendCooldown);

  useEffect(() => {
    setCooldown(resendCooldown);
  }, [resendCooldown]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (code.length === 6 && !loading) {
      onVerify(code);
    }
  }, [code, loading, onVerify]);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <ShieldCheck size={32} className="mx-auto mb-2 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {subtitle ?? `נשלח קוד בן 6 ספרות ל-${email}`}
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-center font-medium text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-center" dir="ltr">
        <InputOTP maxLength={6} value={code} onChange={setCode} disabled={loading}>
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {loading && (
        <div className="flex justify-center">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={cooldown > 0 || loading}
        onClick={() => {
          onResend();
          setCooldown(60);
        }}
      >
        {cooldown > 0 ? `שלח שוב (${cooldown}s)` : 'שלח קוד שוב'}
      </Button>

      {onBack && (
        <button type="button" onClick={onBack} className="w-full text-center text-muted-foreground text-sm py-1">
          חזרה
        </button>
      )}
    </div>
  );
}
