-- STAGING only (usfeoerkpcafxxlyuldl). The legal-pages queue was filled once (20261022120000 / 130000), so sites that the
-- identify engine finishes later (new Common Crawl graphs, link discovery) never had their terms / accessibility pages
-- read for a company number – the step that tied 2,052 sites to registered companies. This tops it up hourly with the
-- same three selections as the original fill. Duplicates are ignored (domain is the key); no existing row changes.

create or replace function public.nr_legal_topup()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int := 0; k int;
begin
  insert into nr_legal_queue (domain, kind, web_business_id)
  select distinct on (d) d, 'web_created', id from (
    select public.nr_host(b.website) d, b.id from nr_businesses b
     where b.reg_id is null and b.website is not null and b.updated_at > now() - interval '3 days'
  ) x where d ~ '^[a-z0-9.-]+\.[a-z]{2,}$' order by d, id
  on conflict (domain) do nothing;
  get diagnostics k = row_count; n := n + k;
  insert into nr_legal_queue (domain, kind)
  select q.domain, 'review_site' from nr_site_queue q where q.status = 'review' and q.checked_at > now() - interval '3 days'
  on conflict (domain) do nothing;
  get diagnostics k = row_count; n := n + k;
  insert into nr_legal_queue (domain, kind)
  select q.domain, 'no_identity' from nr_site_queue q where q.status = 'no_identity' and q.checked_at > now() - interval '3 days'
  on conflict (domain) do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$function$;
revoke all on function public.nr_legal_topup() from public, anon, authenticated;

-- catch up once on everything finished since the original fill (the 3-day window above keeps the hourly run cheap)
insert into public.nr_legal_queue (domain, kind)
select q.domain, 'review_site' from public.nr_site_queue q where q.status = 'review' on conflict (domain) do nothing;
insert into public.nr_legal_queue (domain, kind)
select q.domain, 'no_identity' from public.nr_site_queue q where q.status = 'no_identity' on conflict (domain) do nothing;
insert into public.nr_legal_queue (domain, kind, web_business_id)
select distinct on (d) d, 'web_created', id from (
  select public.nr_host(b.website) d, b.id from public.nr_businesses b where b.reg_id is null and b.website is not null
) x where d ~ '^[a-z0-9.-]+\.[a-z]{2,}$' order by d, id
on conflict (domain) do nothing;

do $$ begin
  perform cron.unschedule('nr-legal-topup') where exists (select 1 from cron.job where jobname = 'nr-legal-topup');
  perform cron.schedule('nr-legal-topup', '47 * * * *',
    $j$ DO $b$ BEGIN IF public.nr_engine_on('identify') THEN PERFORM public.nr_legal_topup(); END IF; END $b$ $j$);
end $$;
