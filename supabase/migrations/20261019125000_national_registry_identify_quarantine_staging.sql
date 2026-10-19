-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- A site whose page made a worker call exceed its CPU allowance three times is set aside (status error, with the reason)
-- instead of staying "claimed" forever; the claim itself does this housekeeping.
-- (fixed 19.10.2026 09:45: output column names clashed with table columns – "column reference attempts is ambiguous")
CREATE OR REPLACE FUNCTION public.nr_claim_site_queue(p_limit int) RETURNS TABLE(domain text, attempts int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.nr_site_queue z SET status = 'error', note = 'הדף כבד מדי לעיבוד – הבדיקה נקטעה 3 פעמים', checked_at = now()
   WHERE z.status = 'claimed' AND z.attempts >= 3 AND z.claimed_at < now() - interval '10 minutes';
  RETURN QUERY
  UPDATE public.nr_site_queue q SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   WHERE q.domain IN (SELECT x.domain FROM public.nr_site_queue x
                       WHERE x.status = 'queued' OR (x.status = 'claimed' AND x.claimed_at < now() - interval '10 minutes' AND x.attempts < 3)
                       ORDER BY x.priority, md5(x.domain) LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.attempts;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_claim_site_queue(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_claim_site_queue(int) TO service_role;
