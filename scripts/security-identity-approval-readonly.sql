-- READ ONLY. Staging only.
SELECT
  to_char(timezone('Asia/Jerusalem', occurred_at), 'YYYY-MM-DD HH24:MI') AS local_il,
  source,
  source_ref,
  event_type,
  action_label,
  outcome,
  identity_status,
  actor_username,
  access_kind,
  tool_name,
  ssh_fingerprint,
  details->>'note' AS note
FROM public.security_audit_events
WHERE source IN ('supabase', 'hostinger_vps')
  AND occurred_at >= now() - interval '2 days'
ORDER BY occurred_at DESC
LIMIT 40;
