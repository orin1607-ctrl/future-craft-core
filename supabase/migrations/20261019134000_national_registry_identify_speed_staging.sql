-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Identify throughput (19.10.2026):
--  * the CPU-limit kills (546) came almost entirely from one quadratic regex on pages with very long lines (fixed in the
--    edge function); a site's work now costs ~30 ms CPU on average, so a call reads sites for a time budget instead of 4
--  * a call killed by the platform cannot release its worker lock or its claimed sites: both now expire after 1 / 3 minutes
--    instead of 110 seconds / 10 minutes, so a killed worker is back on the next minute
--  * the claim used one OR query over the whole queue (seq scan + sort of ~166k rows per call); it now requeues stale claims
--    first and then takes queued sites through the partial index
--  * sites set aside as "too heavy" after 3 interrupted calls are retried once: nearly all were victims of the regex
--    or shared a call with such a page. Nothing is deleted.
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
   WHERE q.domain IN (SELECT x.domain FROM public.nr_site_queue x WHERE x.status = 'queued'
                       ORDER BY x.priority, x.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_claim_site_queue(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_site_queue(int) TO service_role;
CREATE INDEX IF NOT EXISTS nr_site_queue_claimed ON public.nr_site_queue (claimed_at) WHERE status = 'claimed';

-- retry once the sites set aside by the old regex (attempts reset to 1 so a truly heavy page is set aside after 2 more kills)
UPDATE public.nr_site_queue SET status = 'queued', attempts = 1, note = 'נבדק שוב אחרי תיקון עומס עיבוד', checked_at = NULL
 WHERE status = 'error' AND note = 'הדף כבד מדי לעיבוד – הבדיקה נקטעה 3 פעמים';

-- sites per call (upper bound; the call also stops after its time budget)
UPDATE public.nr_control SET identify_batch = 24 WHERE id = 1;

SELECT (SELECT count(*) FROM public.nr_claim_site_queue(0)) claim_ok,
       (SELECT count(*) FROM public.nr_site_queue WHERE note = 'נבדק שוב אחרי תיקון עומס עיבוד') requeued,
       (SELECT identify_batch FROM public.nr_control WHERE id = 1) batch;
