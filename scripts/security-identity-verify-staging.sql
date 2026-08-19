-- Identity classification checks on Staging. Read-only besides counting.

SELECT source, actor_username, actor_email, access_kind, tool_name, identity_status,
       ssh_fingerprint IS NOT NULL AS has_fp, event_type, action_label, outcome
FROM public.security_audit_events
WHERE source_ref IN (
  'identity-seed-push-orin',
  'identity-seed-gha',
  'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
  'SHA256:LtTQ3mIOtB/Ke4iQAaXflVsDj5ONGo7uufDpCoEaIB8',
  'SHA256:+cjDBmC5TAOzoHndrQ5QM84kUwCbP7AgosH8ociBSME',
  'scan-identity-seed',
  'identity-seed-supabase'
)
ORDER BY occurred_at DESC;

SELECT count(*) AS leftover_fake_github_emails
FROM public.security_audit_events
WHERE actor_email LIKE '%@users.noreply.github.com';

SELECT count(*) AS github_with_username
FROM public.security_audit_events
WHERE source = 'github' AND actor_username IS NOT NULL;

SELECT
  current_setting('request.jwt.claim.role', true) AS jwt_role;
