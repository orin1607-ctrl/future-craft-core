import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import logo from '@/assets/logo.png';
import { consumePostLoginRedirect } from '@/lib/postLoginRedirect';
import {
  ACCOUNT_LOCKOUT_MESSAGE,
  invokeAuthLoginChallenge,
  invokeAuthSendOtp,
  invokeAuthVerifyOtp,
} from '@/lib/authOtpClient';

type LoginStep = 'credentials' | 'otp';

export default function Login() {
  const { signup, completeLoginSession } = useAuth();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginByPhone, setLoginByPhone] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (isSignup) {
      const { error: signupError } = await signup(email, password, { full_name: fullName, phone, company_name: companyName });
      setLoading(false);
      if (signupError) setError(signupError);
      else setSuccess('נרשמת בהצלחה! החשבון ממתין לאישור מנהל המערכת.');
      return;
    }

    const loginEmail = loginByPhone
      ? `${email.replace(/[^0-9]/g, '')}@nomail.fleet.local`
      : email;

    const result = await invokeAuthLoginChallenge(loginEmail, password);
    setLoading(false);

    if (!result.success) {
      if (result.locked_until || result.error === ACCOUNT_LOCKOUT_MESSAGE) {
        setError(ACCOUNT_LOCKOUT_MESSAGE);
      } else {
        setError(result.error || 'שם משתמש או סיסמה שגויים');
      }
      return;
    }

    if (result.requires_otp && result.challenge_id) {
      setChallengeId(result.challenge_id);
      setOtpEmail(result.email || loginEmail);
      setStep('otp');
      return;
    }

    if (result.session) {
      const { error: sessionError } = await completeLoginSession(result.session);
      if (sessionError) setError(sessionError);
      else navigate(consumePostLoginRedirect('/dashboard'));
      return;
    }

    setError('שגיאה בהתחברות');
  };

  const handleOtpVerify = async (code: string) => {
    setError('');
    setLoading(true);
    const result = await invokeAuthVerifyOtp({
      email: otpEmail,
      code,
      purpose: 'login_2fa',
      challenge_id: challengeId,
      password,
    });
    setLoading(false);

    if (!result.success || !result.session) {
      setError(result.error || 'קוד לא תקין');
      return;
    }

    const { error: sessionError } = await completeLoginSession(result.session);
    if (sessionError) setError(sessionError);
    else navigate(consumePostLoginRedirect('/dashboard'));
  };

  const handleOtpResend = async () => {
    setError('');
    const result = await invokeAuthSendOtp({
      email: otpEmail,
      purpose: 'login_2fa',
      challenge_id: challengeId,
    });
    if (result.cooldown_seconds) setResendCooldown(result.cooldown_seconds);
    if (result.error) setError(result.error);
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="דליה" className="h-24 mb-4 brightness-0 invert" />
          <h1 className="text-3xl font-bold text-primary-foreground">דליה</h1>
          <p className="text-primary-foreground/70 text-lg mt-1">פתרונות תפעול ותחזוקה לרכב</p>
        </div>

        <div className="bg-card rounded-3xl shadow-2xl p-8 space-y-5">
          {step === 'otp' ? (
            <OtpVerifyStep
              email={otpEmail}
              loading={loading}
              error={error}
              resendCooldown={resendCooldown}
              onVerify={handleOtpVerify}
              onResend={handleOtpResend}
              onBack={() => { setStep('credentials'); setError(''); }}
              title="אימות דו-שלבי"
              subtitle={`נשלח קוד OTP בן 6 ספרות ל-${otpEmail}`}
            />
          ) : (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              <h2 className="text-2xl font-bold text-center text-foreground">
                {isSignup ? 'הרשמה למערכת' : 'כניסה למערכת'}
              </h2>

              {error && (
                <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-center text-lg font-medium">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-success/10 text-success rounded-xl p-4 text-center text-lg font-medium">
                  {success}
                </div>
              )}

              {isSignup && (
                <>
                  <div>
                    <label className="block text-lg font-medium mb-2">שם מלא</label>
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                      className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors"
                      placeholder="הכנס שם מלא..." />
                  </div>
                  <div>
                    <label className="block text-lg font-medium mb-2">טלפון</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors"
                      placeholder="050-1234567" dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-lg font-medium mb-2">שם חברה</label>
                    <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                      className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors"
                      placeholder="שם החברה שלך..." />
                  </div>
                </>
              )}

              {!isSignup && (
                <div className="flex items-center gap-3 justify-center">
                  <button type="button" onClick={() => { setLoginByPhone(false); setEmail(''); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${!loginByPhone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    אימייל
                  </button>
                  <button type="button" onClick={() => { setLoginByPhone(true); setEmail(''); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${loginByPhone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    📱 טלפון
                  </button>
                </div>
              )}

              <div>
                <label className="block text-lg font-medium mb-2">
                  {!isSignup && loginByPhone ? 'מספר טלפון' : 'אימייל'}
                </label>
                <input
                  type={!isSignup && loginByPhone ? 'tel' : 'email'}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors"
                  placeholder={!isSignup && loginByPhone ? '050-1234567' : 'הכנס אימייל...'}
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
              </div>

              <div>
                <label className="block text-lg font-medium mb-2">סיסמה</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                    className="w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none transition-colors pl-12"
                    placeholder="••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground text-xl font-bold py-5 rounded-2xl shadow-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
                {loading ? 'טוען...' : isSignup ? 'הירשם' : 'התחבר'}
              </button>

              <button type="button" onClick={() => { setIsSignup(!isSignup); setError(''); setSuccess(''); }}
                className="w-full text-center text-primary font-medium text-lg py-2">
                {isSignup ? 'כבר יש לי חשבון - כניסה' : 'אין לי חשבון - הרשמה'}
              </button>

              {!isSignup && (
                <button type="button" onClick={() => navigate('/forgot-password')}
                  className="w-full text-center text-muted-foreground font-medium text-base py-1 hover:text-primary transition-colors">
                  שכחתי סיסמה
                </button>
              )}

              <button type="button" onClick={() => navigate('/about')}
                className="w-full text-center text-muted-foreground font-medium text-sm py-1 hover:text-primary transition-colors">
                ← חזרה לדף אודות המערכת
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
