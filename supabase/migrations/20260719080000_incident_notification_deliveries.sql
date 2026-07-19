-- Incident outbound delivery log + anti-duplicate (Staging + Production)
-- Does not touch emergency whatsapp_enabled.

CREATE TABLE IF NOT EXISTS public.incident_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  incident_kind text NOT NULL CHECK (incident_kind IN ('fault', 'accident')),
  incident_id uuid NOT NULL,
  event_number text NOT NULL DEFAULT '',
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'in_app')),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  payload_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS incident_notification_deliveries_dedupe_uidx
  ON public.incident_notification_deliveries (incident_kind, incident_id, channel, recipient);

CREATE INDEX IF NOT EXISTS incident_notification_deliveries_incident_idx
  ON public.incident_notification_deliveries (incident_kind, incident_id, created_at DESC);

ALTER TABLE public.incident_notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read incident deliveries" ON public.incident_notification_deliveries;
CREATE POLICY "Super admins read incident deliveries"
  ON public.incident_notification_deliveries FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Fleet managers read own company incident deliveries" ON public.incident_notification_deliveries;
CREATE POLICY "Fleet managers read own company incident deliveries"
  ON public.incident_notification_deliveries FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'fleet_manager'::app_role)
    AND company_name = get_user_company(auth.uid())
  );

COMMENT ON TABLE public.incident_notification_deliveries IS
  'Outbound Email/WhatsApp/in-app delivery log for faults/accidents. Deduped per incident×channel×recipient.';

COMMENT ON COLUMN public.company_settings.incident_notify_whatsapp IS
  'Paid add-on toggle for incident (fault/accident) WhatsApp. Independent of emergency whatsapp_enabled.';
