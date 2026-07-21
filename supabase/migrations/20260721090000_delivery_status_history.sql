-- Append-only status history for Gupshup DLR (Staging)
ALTER TABLE public.incident_notification_deliveries
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.incident_notification_deliveries.status_history IS
  'Ordered list of status transitions: [{at, status, dlr_event, error_code, error_message}]';
