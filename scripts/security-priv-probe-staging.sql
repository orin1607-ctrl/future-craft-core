SELECT
  has_table_privilege('anon','public.security_audit_events','SELECT') AS anon_select,
  has_table_privilege('anon','public.security_audit_events','INSERT') AS anon_insert,
  has_table_privilege('anon','public.security_audit_events','UPDATE') AS anon_update,
  has_table_privilege('anon','public.security_audit_events','DELETE') AS anon_delete,
  has_table_privilege('authenticated','public.security_audit_events','SELECT') AS auth_select,
  has_table_privilege('authenticated','public.security_audit_events','UPDATE') AS auth_update,
  has_table_privilege('authenticated','public.security_audit_events','DELETE') AS auth_delete;
