-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Isolation of sites that were in flight when a call was cut off by the CPU limit (546):
--  * such a site goes back to the queue with attempts >= 1; normal batches take only fresh sites (attempts = 0)
--  * each call first takes ONE such site and reads it alone, so a really heavy page only costs itself and is set aside
--    with the right reason after repeated cut-offs, while the innocent sites of that call are read normally
--  * per-call upper bound 14 sites (the remaining cut-offs were total CPU of ~16 sites per call, not one page)
CREATE OR REPLACE FUNCTION public.nr_claim_site_queue(p_limit int) RETURNS TABLE(domain text, attempts int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.nr_site_queue z SET status = 'error', note = 'הדף כבד מדי לעיבוד – הבדיקה נקטעה 3 פעמים', checked_at = now()
   WHERE z.status = 'claimed' AND z.attempts >= 3 AND z.claimed_at < now() - interval '3 minutes';
  UPDATE public.nr_site_queue z SET status = 'queued'
   WHERE z.status = 'claimed' AND z.attempts < 3 AND z.claimed_at < now() - interval '3 minutes';
  RETURN QUERY
  UPDATE public.nr_site_queue q SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   WHERE q.domain IN (SELECT x.domain FROM public.nr_site_queue x WHERE x.status = 'queued' AND x.attempts = 0
                       ORDER BY x.priority, x.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.nr_claim_site_suspect() RETURNS TABLE(domain text, attempts int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  UPDATE public.nr_site_queue q SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   WHERE q.domain IN (SELECT x.domain FROM public.nr_site_queue x WHERE x.status = 'queued' AND x.attempts >= 1
                       ORDER BY x.priority, x.queued_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.attempts;
END;
$$;
CREATE INDEX IF NOT EXISTS nr_site_queue_suspect ON public.nr_site_queue (priority, queued_at) WHERE status = 'queued' AND attempts >= 1;
REVOKE ALL ON FUNCTION public.nr_claim_site_queue(int), public.nr_claim_site_suspect() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_site_queue(int), public.nr_claim_site_suspect() TO service_role;

-- the innocent sites set aside after the regex fix get one more (isolated) try
UPDATE public.nr_site_queue SET status = 'queued', attempts = 2, note = 'נבדק שוב בנפרד אחרי קטיעת עיבוד', checked_at = NULL
 WHERE status = 'error' AND note = 'הדף כבד מדי לעיבוד – הבדיקה נקטעה 3 פעמים' AND checked_at > '2026-10-19 08:56:00+00';

UPDATE public.nr_control SET identify_batch = 14 WHERE id = 1;

SELECT (SELECT count(*) FROM public.nr_site_queue WHERE status = 'queued' AND attempts >= 1) suspects_waiting,
       (SELECT identify_batch FROM public.nr_control WHERE id = 1) batch;
