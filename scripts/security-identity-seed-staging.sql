-- Staging identity examples. No secrets. No Production.

SELECT public.security_ingest_external(
  'github', 'PushEvent', 'Push', 'הצליח', 'success',
  'identified', 'info', 'identity-seed-push-orin',
  NULL, NULL, NULL, 'github_actor',
  now() - interval '25 minutes',
  jsonb_build_object(
    'actor', 'orin1607-ctrl',
    'actor_id', 1,
    'repo', 'orin1607-ctrl/future-craft-core',
    'branch', 'feat/incident-alerts-staging',
    'object_type', 'repository'
  )
);

SELECT public.security_ingest_external(
  'github', 'WorkflowRunEvent', 'Workflow — Deploy Staging', 'הצליח', 'success',
  'identified', 'info', 'identity-seed-gha',
  NULL, NULL, NULL, 'github_actor',
  now() - interval '20 minutes',
  jsonb_build_object(
    'actor', 'github-actions[bot]',
    'repo', 'orin1607-ctrl/future-craft-core',
    'branch', 'feat/incident-alerts-staging',
    'object_type', 'repository'
  )
);

SELECT public.security_ingest_external(
  'hostinger_vps', 'ssh_login_success', 'כניסת SSH', 'הצליח', 'success',
  'identified', 'high', 'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
  '79.181.173.191', 'publickey', NULL, 'ssh:root',
  now() - interval '40 minutes',
  jsonb_build_object(
    'ssh_user', 'root',
    'fingerprint', 'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
    'object_type', 'ssh_session',
    'note', 'tool proven by authorized_keys comment cursor-dalia-vps'
  )
);

SELECT public.security_ingest_external(
  'hostinger_vps', 'ssh_login_success', 'כניסת SSH', 'הצליח', 'success',
  'identified', 'high', 'SHA256:LtTQ3mIOtB/Ke4iQAaXflVsDj5ONGo7uufDpCoEaIB8',
  NULL, 'publickey', NULL, 'ssh:root',
  now() - interval '18 minutes',
  jsonb_build_object(
    'ssh_user', 'root',
    'fingerprint', 'SHA256:LtTQ3mIOtB/Ke4iQAaXflVsDj5ONGo7uufDpCoEaIB8',
    'object_type', 'ssh_session',
    'note', 'tool proven by authorized_keys comment github-actions-dalia-deploy'
  )
);

SELECT public.security_ingest_external(
  'hostinger_vps', 'ssh_login_success', 'כניסת SSH', 'הצליח', 'success',
  'identified', 'high', 'SHA256:+cjDBmC5TAOzoHndrQ5QM84kUwCbP7AgosH8ociBSME',
  '79.181.173.191', 'publickey', NULL, 'ssh:root',
  now() - interval '12 minutes',
  jsonb_build_object(
    'ssh_user', 'root',
    'fingerprint', 'SHA256:+cjDBmC5TAOzoHndrQ5QM84kUwCbP7AgosH8ociBSME',
    'object_type', 'ssh_session',
    'note', 'key has no identifying comment — tool not guessed'
  )
);

SELECT public.security_ingest_external(
  'hostinger_vps', 'ssh_login_failed', 'כניסת SSH שנכשלה', 'נכשל', 'failure',
  'unidentified', 'warning', 'scan-identity-seed',
  '34.47.75.22', 'password', NULL, 'ssh:root',
  now() - interval '8 minutes',
  jsonb_build_object(
    'ssh_user', 'root',
    'auth_method', 'password',
    'object_type', 'ssh_session',
    'note', 'failed password — person not identified, not labeled attacker'
  )
);

SELECT public.security_ingest_external(
  'supabase', 'auth_audit', 'אירוע Auth', 'זהות לא זמינה', 'unknown',
  'identity_unavailable', 'info', 'identity-seed-supabase',
  NULL, NULL, NULL, NULL,
  now() - interval '5 minutes',
  jsonb_build_object(
    'object_type', 'auth',
    'note', 'Supabase did not supply actor — identity unavailable'
  )
);
