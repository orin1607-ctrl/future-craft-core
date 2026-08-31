-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Claims mail follow-up Dry Run. No Gmail, no OAuth, no real send.
-- Cron is scheduled by scripts/apply-claims-mail-dryrun-staging.mjs after project-ref check.

INSERT INTO public.claims_config (key, value, updated_at)
VALUES ('MAIL_DISPATCH_MODE', 'dry_run', now())
ON CONFLICT (key) DO UPDATE SET value = 'dry_run', updated_at = now();

ALTER TABLE public.claims_reminders
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS mail_kind text,
  ADD COLUMN IF NOT EXISTS mail_to text,
  ADD COLUMN IF NOT EXISTS mail_subject text,
  ADD COLUMN IF NOT EXISTS mail_body text,
  ADD COLUMN IF NOT EXISTS attach_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS repeat_every_days integer,
  ADD COLUMN IF NOT EXISTS stop_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS allow_on_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.claims_reminders DROP CONSTRAINT IF EXISTS claims_reminders_action_chk;
ALTER TABLE public.claims_reminders
  ADD CONSTRAINT claims_reminders_action_chk CHECK (action = ANY (ARRAY['note','send_email']));

ALTER TABLE public.claims_reminders DROP CONSTRAINT IF EXISTS claims_reminders_mail_kind_chk;
ALTER TABLE public.claims_reminders
  ADD CONSTRAINT claims_reminders_mail_kind_chk CHECK (mail_kind IS NULL OR mail_kind = ANY (ARRAY['email_once','email_repeat']));

ALTER TABLE public.claims_reminders DROP CONSTRAINT IF EXISTS claims_reminders_status_chk;
ALTER TABLE public.claims_reminders
  ADD CONSTRAINT claims_reminders_status_chk CHECK (status = ANY (ARRAY['scheduled','completed','cancelled','failed']));

ALTER TABLE public.claims_reminders DROP CONSTRAINT IF EXISTS claims_reminders_attach_chk;
ALTER TABLE public.claims_reminders
  ADD CONSTRAINT claims_reminders_attach_chk CHECK (attach_mode = ANY (ARRAY['none','received']));

CREATE INDEX IF NOT EXISTS idx_claims_reminders_action_next
  ON public.claims_reminders (action, status, next_run_at)
  WHERE action = 'send_email';

CREATE TABLE IF NOT EXISTS public.claims_mail_jobs (
  id text PRIMARY KEY,
  reminder_id text NOT NULL REFERENCES public.claims_reminders(id) ON DELETE CASCADE,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  planned_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  claimed_at timestamptz,
  finished_at timestamptz,
  fail_reason text,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_mail_jobs_status_chk CHECK (status = ANY (ARRAY['pending','sending','dry_run_sent','failed','cancelled'])),
  CONSTRAINT claims_mail_jobs_uniq UNIQUE (reminder_id, planned_at)
);
CREATE INDEX IF NOT EXISTS idx_claims_mail_jobs_due ON public.claims_mail_jobs (status, planned_at);

ALTER TABLE public.claims_mail_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claims_mail_jobs_all ON public.claims_mail_jobs;
CREATE POLICY claims_mail_jobs_all ON public.claims_mail_jobs
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

REVOKE ALL ON TABLE public.claims_mail_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_mail_jobs TO authenticated;
