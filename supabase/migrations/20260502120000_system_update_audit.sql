-- System update audit log
-- Tracks every manual code/database update triggered from the Super Admin panel.

CREATE TABLE IF NOT EXISTS public.system_update_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('deploy', 'migrate')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_email TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed')),
  sha_before TEXT,
  sha_after TEXT,
  migrations_applied TEXT[],
  log_excerpt TEXT,
  error TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_update_audit_started
  ON public.system_update_audit(started_at DESC);

ALTER TABLE public.system_update_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin can view audit"
  ON public.system_update_audit
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
