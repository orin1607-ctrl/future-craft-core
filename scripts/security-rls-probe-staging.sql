-- Staging RLS / privilege probe for security_* tables. Run via supabase db query as postgres.
-- Does not modify Production.

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_on,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'security_%'
ORDER BY 1;

SELECT policyname, tablename, cmd, roles
FROM pg_policies
WHERE tablename LIKE 'security_%'
ORDER BY tablename, policyname;
