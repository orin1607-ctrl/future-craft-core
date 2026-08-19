SELECT public.security_ingest_external(
  'hostinger_vps', 'ssh_login_success', 'SSH login מוצלח', 'הצליח', 'success',
  'identity_unavailable', 'high', 'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
  '79.181.173.191', 'publickey', NULL, 'ssh:root',
  '2026-08-19T10:50:36.055126+00:00'::timestamptz,
  jsonb_build_object('note','SSH user+IP only — no app user guess')
);

SELECT public.security_ingest_external(
  'hostinger_vps', 'ssh_login_failed', 'SSH login שנכשל', 'נכשל', 'failure',
  'identity_unavailable', 'warning', 'scan-34.47.75.22',
  '34.47.75.22', 'password', NULL, 'ssh:root',
  '2026-08-19T09:03:48.350187+00:00'::timestamptz,
  jsonb_build_object('note','Failed password for root — no app user guess')
);
