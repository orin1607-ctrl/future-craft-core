-- dalia-staging ONLY (usfeoerkpcafxxlyuldl) — User Management schema
-- Do NOT apply to production (qasomfndnjuixgjmjwcm).

-- 1. New role: business customer
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'business_customer';

-- 2. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approval_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.nickname IS 'Display nickname — NOT user_number';
COMMENT ON COLUMN public.profiles.approval_status IS 'pending | approved | rejected';

-- 3. Extend customers (user_id added after profiles exist; FK to auth.users via profiles)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS activity_field text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_unique
  ON public.customers (user_id) WHERE user_id IS NOT NULL;

-- 4. Access codes (hashed; plain text only sent via email once)
CREATE TABLE IF NOT EXISTS public.user_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('manual', 'auto')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  verified_at timestamptz,
  sent_to_email_at timestamptz,
  next_rotation_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS user_access_codes_user_id_idx ON public.user_access_codes (user_id);
CREATE INDEX IF NOT EXISTS user_access_codes_active_idx ON public.user_access_codes (user_id, is_active);

ALTER TABLE public.user_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage access codes"
  ON public.user_access_codes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users view own access codes"
  ON public.user_access_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 5. Self-registration requests (future login page)
CREATE TABLE IF NOT EXISTS public.registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_role public.app_role NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS registration_requests_status_idx ON public.registration_requests (status, created_at DESC);

ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage registration requests"
  ON public.registration_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated can insert registration requests"
  ON public.registration_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Backfill existing active users as approved (new column default pending would break existing)
UPDATE public.profiles
SET approval_status = 'approved'
WHERE approval_status = 'pending' AND is_active = true;
