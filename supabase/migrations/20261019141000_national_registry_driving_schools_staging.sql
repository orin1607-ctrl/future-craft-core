-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Ministry of Transport open data – licensed driving schools (name, address, manager, phone, licence types taught).
-- Licence types are 0/1 flags, not vehicle counts: they are kept as an indication only.
INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config) VALUES
('dgov:driving_schools', NULL, 'בתי ספר לנהיגה – משרד התחבורה',
 'https://data.gov.il/api/3/action/datastore_search?resource_id=3f06e2f2-e2ad-41ac-9665-37d0625537f2', 'data.gov.il', 'ckan',
 ARRAY['phone', 'person', 'address']::text[], 'data.gov.il – מידע ציבורי פתוח (רישיון שימוש חופשי במידע ממשלתי)', 'pending', NULL, 40,
 '{"rid":"3f06e2f2-e2ad-41ac-9665-37d0625537f2","mapper":"driving_schools"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
SELECT key, status FROM public.nr_sources WHERE key = 'dgov:driving_schools';
