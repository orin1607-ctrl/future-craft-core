-- Staging only. Send journal numbers + tracking. No live scheduled send.
ALTER TABLE public.claims_gmail_outbox
  ADD COLUMN IF NOT EXISTS send_no integer,
  ADD COLUMN IF NOT EXISTS track_status text,
  ADD COLUMN IF NOT EXISTS track_due timestamptz,
  ADD COLUMN IF NOT EXISTS followup_days integer,
  ADD COLUMN IF NOT EXISTS followup_max integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_approved boolean NOT NULL DEFAULT false;

UPDATE public.claims_gmail_outbox o
SET send_no = s.n
FROM (
  SELECT id, row_number() OVER (ORDER BY coalesce(sent_at, created_at), id) AS n
  FROM public.claims_gmail_outbox
  WHERE kind = 'claim_send'
) s
WHERE o.id = s.id AND o.send_no IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS claims_gmail_outbox_send_no_uniq
  ON public.claims_gmail_outbox (send_no)
  WHERE send_no IS NOT NULL;
