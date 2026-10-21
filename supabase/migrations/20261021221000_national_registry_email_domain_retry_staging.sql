-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Website discovery from business e-mail domains ran in Mumbai; 1,352 domains failed only on the network (timeouts,
-- HTTP 403 / 5xx, connection errors) – the pattern of Israeli sites that do not answer that region. The enrichment tick
-- now runs in Frankfurt, so those domains get one more try there. Previous statuses are backed up; nothing is deleted.
CREATE TABLE IF NOT EXISTS nr_backup_20261021.domain_queue_retry AS
  SELECT business_id, domain, status, note, checked_at FROM public.nr_domain_queue
   WHERE status = 'not_found' AND note ~* 'timed out|fetch failed|HTTP 403|HTTP 5\d\d|connect|reset|refused|certificate|tls|error sending';
UPDATE public.nr_domain_queue d SET status = 'queued', note = 'ניסיון חוזר מפרנקפורט: ' || left(coalesce(d.note, ''), 80), checked_at = NULL
  FROM nr_backup_20261021.domain_queue_retry b WHERE d.domain = b.domain AND d.business_id = b.business_id AND d.status = 'not_found';
SELECT (SELECT count(*) FROM nr_backup_20261021.domain_queue_retry) backed_up,
       (SELECT count(*) FROM public.nr_domain_queue WHERE status = 'queued') queued;
