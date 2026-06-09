export const AUTH_AUDIT_LABELS: Record<string, string> = {
  login_success: 'כניסה מוצלחת',
  login_failed: 'כניסה נכשלה',
  otp_sent: 'OTP נשלח',
  otp_verified: 'OTP אומת',
  otp_failed: 'OTP נכשל',
  password_reset_completed: 'איפוס סיסמה הושלם',
  two_factor_enabled: '2FA הופעל',
  two_factor_disabled: '2FA בוטל',
  account_locked: 'חשבון ננעל',
  account_unlocked: 'חשבון שוחרר',
};

export const AUTH_AUDIT_COLORS: Record<string, string> = {
  login_success: 'border-green-500/40 text-green-700',
  login_failed: 'border-destructive/40 text-destructive',
  otp_sent: 'border-primary/40 text-primary',
  otp_verified: 'border-green-500/40 text-green-700',
  otp_failed: 'border-destructive/40 text-destructive',
  password_reset_completed: 'border-green-500/40 text-green-700',
  two_factor_enabled: 'border-amber-500/40 text-amber-700',
  two_factor_disabled: 'border-muted-foreground/40 text-muted-foreground',
  account_locked: 'border-destructive/40 text-destructive',
  account_unlocked: 'border-green-500/40 text-green-700',
};
