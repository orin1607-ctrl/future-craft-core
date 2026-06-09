-- dalia-staging ONLY (usfeoerkpcafxxlyuldl)
-- Auth OTP + 2FA approval + audit log + login lockout
-- Do NOT apply to production (qasomfndnjuixgjmjwcm).

-- ── 1. ENUM: OTP purposes ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.auth_otp_purpose AS ENUM (
    'login_2fa',
    'password_reset'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. ENUM: audit event types ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.auth_audit_event AS ENUM (
    'login_success',
    'login_failed',
    'otp_sent',
    'otp_verified',
    'otp_failed',
    'password_reset_completed',
    'two_factor_enabled',
    'two_factor_disabled',
    'account_locked',
    'account_unlocked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. profiles — admin-approved 2FA ──────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS two_factor_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_factor_approved_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.two_factor_approved IS
  'Admin-approved email OTP at login. Default false — opt-in only.';
COMMENT ON COLUMN public.profiles.two_factor_approved_at IS
  'When super_admin enabled 2FA for this user';
COMMENT ON COLUMN public.profiles.two_factor_approved_by IS
  'super_admin profile id who approved 2FA';

-- ── 4. auth_verification_codes — one-time OTP ─────────────────
CREATE TABLE IF NOT EXISTS public.auth_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  purpose public.auth_otp_purpose NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT auth_verification_codes_attempts_check
    CHECK (attempts_count >= 0 AND attempts_count <= max_attempts)
);

CREATE INDEX IF NOT EXISTS auth_verification_codes_email_purpose_idx
  ON public.auth_verification_codes (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_verification_codes_active_idx
  ON public.auth_verification_codes (email, purpose)
  WHERE consumed_at IS NULL;

ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to OTP codes"
  ON public.auth_verification_codes FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ── 5. auth_login_challenges — pending session before OTP ─────
CREATE TABLE IF NOT EXISTS public.auth_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_ip text
);

CREATE INDEX IF NOT EXISTS auth_login_challenges_active_idx
  ON public.auth_login_challenges (id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.auth_login_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to login challenges"
  ON public.auth_login_challenges FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ── 6. auth_account_lockouts — 15 min lock after 5 failures ───
CREATE TABLE IF NOT EXISTS public.auth_account_lockouts (
  email text PRIMARY KEY,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_account_lockouts_locked_idx
  ON public.auth_account_lockouts (locked_until)
  WHERE locked_until IS NOT NULL;

ALTER TABLE public.auth_account_lockouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to account lockouts"
  ON public.auth_account_lockouts FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ── 7. auth_audit_log — immutable auth event stream ───────────
CREATE TABLE IF NOT EXISTS public.auth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type public.auth_audit_event NOT NULL,
  success boolean NOT NULL DEFAULT true,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_audit_log_created_idx
  ON public.auth_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_log_user_idx
  ON public.auth_audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_log_email_idx
  ON public.auth_audit_log (email, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_log_event_idx
  ON public.auth_audit_log (event_type, created_at DESC);

ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read auth audit log"
  ON public.auth_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── 8. password reset tokens (post-OTP, one-time) ─────────────
CREATE TABLE IF NOT EXISTS public.auth_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_active_idx
  ON public.auth_password_reset_tokens (token_hash)
  WHERE consumed_at IS NULL;

ALTER TABLE public.auth_password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to reset tokens"
  ON public.auth_password_reset_tokens FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
