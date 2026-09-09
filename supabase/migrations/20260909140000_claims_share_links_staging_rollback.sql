-- Staging ONLY rollback for claims_share_links. Do not run on Production.

DROP POLICY IF EXISTS claims_share_links_all ON public.claims_share_links;
DROP TABLE IF EXISTS public.claims_share_links;
