import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.png';
import { KeyRound, ArrowRight, Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
import OtpVerifyStep from '@/components/auth/OtpVerifyStep';
import {
  invokeAuthCompletePasswordReset,
  invokeAuthSendOtp,
  invokeAuthVerifyOtp,
} from '@/lib/authOtpClient';

type Step = 'email' | 'otp' | 'password' | 'done';

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await invokeAuthSendOtp({ email, purpose: 'password_reset' });
    setLoading(false);
    if (result.error && !result.success) {
      setError(result.error);
      return;
    }
    if (result.cooldown_seconds) setResendCooldown(result.cooldown_seconds);
    setStep('otp');
  };

  const handleOtpVerify = async (code: string) => {
    setError('');
    setLoading(true);
    const result = await invokeAuthVerifyOtp({ email, code, purpose: 'password_reset' });
    setLoading(false);
    if (!result.success || !result.reset_token) {
      setError(result.error || 'קוד לא תקין');
      return;
    }
    setResetToken(result.reset_token);
    setStep('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('סיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    setLoading(true);
    try {
      const result = await invokeAuthCompletePasswordReset({
        reset_token: resetToken,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      if (!result.success) {
        setError(result.error || 'שגיאה בעדכון הסיסמה');
        return;
      }
      setStep('done');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    const result = await invokeAuthSendOtp({ email, purpose: 'password_reset' });
    if (result.cooldown_seconds) setResendCooldown(result.cooldown_seconds);
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="דליה" className="h-24 mb-4 brightness-0 invert" />
        </div>

        <div className="bg-card rounded-3xl shadow-2xl p-8 space-y-5">
          {step === 'done' ? (
            <div className="text-center space-y-4">
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <h2 className="text-2xl font-bold text-foreground">הסיסמה עודכנה בהצלחה</h2>
              <p className="text-muted-foreground">כעת ניתן להתחבר עם הסיסמה החדשה.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-primary text-primary-foreground text-lg font-bold py-4 rounded-2xl mt-4 hover:opacity-90 transition-all"
              >
                חזרה להתחברות
              </button>
            </div>
          ) : step === 'otp' ? (
            <OtpVerifyStep
              email={email}
              loading={loading}
              error={error}
              resendCooldown={resendCooldown}
              onVerify={handleOtpVerify}
              onResend={handleResend}
              onBack={() => { setStep('email'); setError(''); }}
              title="אימות קוד"
              subtitle="הזן את הקוד שנשלח לאימייל שלך"
            />
          ) : step === 'password' ? (
            <>
              <div className="text-center">
                <KeyRound size={32} className="mx-auto mb-2 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">סיסמה חדשה</h2>
              </div>
              {error && (
                <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-center font-medium">{error}</div>
              )}
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-lg font-medium mb-2">סיסמה חדשה</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none pl-12"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-lg font-medium mb-2">אישור סיסמה</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-primary text-primary-foreground text-xl font-bold py-5 rounded-2xl disabled:opacity-50">
                  {loading ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'עדכן סיסמה'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center">
                <KeyRound size={32} className="mx-auto mb-2 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">שחזור סיסמה</h2>
                <p className="text-muted-foreground mt-1">הזן אימייל — נשלח קוד OTP לאימות</p>
              </div>
              {error && (
                <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-center font-medium">{error}</div>
              )}
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-lg font-medium mb-2">אימייל</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none"
                    placeholder="הכנס אימייל..." dir="ltr" style={{ textAlign: 'right' }}
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-primary text-primary-foreground text-xl font-bold py-5 rounded-2xl disabled:opacity-50">
                  {loading ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'שלח קוד OTP'}
                </button>
              </form>
              <button onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 text-primary font-medium text-lg py-2">
                <ArrowRight size={18} /> חזרה לכניסה
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
