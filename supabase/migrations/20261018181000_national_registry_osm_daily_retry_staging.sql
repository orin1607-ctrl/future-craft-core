-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- OpenStreetMap (catalog 27) depends on public Overpass servers: the main server rejects requests from the Supabase
-- region and the mirrors are intermittently down (HTTP 500 on 2026-10-18). After 5 failed attempts the collector marks
-- the source "error"; this job re-queues it once a day (keeping its checkpoint), so it completes without manual action
-- as soon as a mirror is back. Last in the queue (priority 95) so it never delays other sources.
UPDATE public.nr_sources SET priority = 95 WHERE key = 'cat:27';

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-osm-daily-retry';
END $$;
SELECT cron.schedule('nr-osm-daily-retry', '15 2 * * *', $cmd$
  UPDATE public.nr_sources
     SET status = 'pending', errors = 0,
         status_reason = 'ניסיון חוזר יומי אוטומטי – שרתי Overpass לא היו זמינים בניסיון הקודם (' || coalesce(last_error, '') || ')'
   WHERE key = 'cat:27' AND status = 'error'
$cmd$);
