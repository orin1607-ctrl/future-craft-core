-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- The deep crawl (contact / about / careers pages → social links, e-mails, people, jobs) still ran in Mumbai.
-- Measured 21.10.2026: of 103 companies matched from sites that answer only Frankfurt, the deep crawl "checked" 98 but
-- produced findings for 4 and social links for 6 – it could not open the sites. The deep-crawl and enrichment ticks now
-- run in Frankfurt too (only the region header is added; schedule and gating unchanged), and those companies are
-- scheduled for a new deep crawl (enr_site_checked_at is a scheduling field; no data is removed).
SELECT cron.alter_job(jobid, command := replace(command,
         $q$'Content-Type', 'application/json',$q$, $q$'Content-Type', 'application/json', 'x-region', 'eu-central-1',$q$))
  FROM cron.job WHERE jobname IN ('nr-deep-2', 'nr-enrich-tick') AND command NOT LIKE '%eu-central-1%';

UPDATE public.nr_businesses b SET enr_site_checked_at = NULL
 WHERE b.id IN (SELECT q.business_id FROM public.nr_site_queue q JOIN nr_backup_20261021.unreachable_retry_all u USING (domain)
                 WHERE q.status IN ('matched', 'created') AND q.business_id IS NOT NULL);

SELECT jobname, command LIKE '%eu-central-1%' frankfurt FROM cron.job WHERE jobname IN ('nr-deep-2', 'nr-enrich-tick');
