-- Gupshup DLR tracking — create table if missing (Staging) + expand for webhook events

CREATE TABLE IF NOT EXISTS public.incident_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  incident_kind text NOT NULL,
  incident_id uuid NOT NULL,
  event_number text NOT NULL DEFAULT '',
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'in_app')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  error_message text,
  payload_excerpt text,
  dlr_event text,
  dlr_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incident_notification_deliveries
  ADD COLUMN IF NOT EXISTS dlr_event text;

ALTER TABLE public.incident_notification_deliveries
  ADD COLUMN IF NOT EXISTS dlr_error_code text;

ALTER TABLE public.incident_notification_deliveries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Relax / replace checks for DLR statuses and probe kind
ALTER TABLE public.incident_notification_deliveries
  DROP CONSTRAINT IF EXISTS incident_notification_deliveries_status_check;

ALTER TABLE public.incident_notification_deliveries
  ADD CONSTRAINT incident_notification_deliveries_status_check
  CHECK (status IN (
    'pending',
    'submitted',
    'enqueued',
    'sent',
    'delivered',
    'read',
    'failed',
    'rejected',
    'skipped'
  ));

ALTER TABLE public.incident_notification_deliveries
  DROP CONSTRAINT IF EXISTS incident_notification_deliveries_incident_kind_check;

ALTER TABLE public.incident_notification_deliveries
  ADD CONSTRAINT incident_notification_deliveries_incident_kind_check
  CHECK (incident_kind IN ('fault', 'accident', 'whatsapp_probe'));

CREATE UNIQUE INDEX IF NOT EXISTS incident_notification_deliveries_dedupe_uidx
  ON public.incident_notification_deliveries (incident_kind, incident_id, channel, recipient);

CREATE INDEX IF NOT EXISTS incident_notification_deliveries_incident_idx
  ON public.incident_notification_deliveries (incident_kind, incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS incident_notification_deliveries_provider_message_id_idx
  ON public.incident_notification_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.incident_notification_deliveries ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default; keep a simple read policy for super_admin if helper exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'has_role' AND n.nspname = 'public'
  ) THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "Super admins read incident deliveries" ON public.incident_notification_deliveries;
      CREATE POLICY "Super admins read incident deliveries"
        ON public.incident_notification_deliveries FOR SELECT TO authenticated
        USING (has_role(auth.uid(), 'super_admin'::app_role));
    $p$;
  END IF;
END $$;

COMMENT ON COLUMN public.incident_notification_deliveries.provider_message_id IS
  'Gupshup messageId / gsId — used to match DLR webhook events';
