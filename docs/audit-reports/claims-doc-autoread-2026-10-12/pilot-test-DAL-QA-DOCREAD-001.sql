-- Pilot test of server-side document reading — STAGING usfeoerkpcafxxlyuldl ONLY. Not a migration.
-- One fictitious claim, one fictitious PDF, one manual run. Each step needs the owner's approval.
-- Isolation: the code gate DOCUMENT_READ_CUSTOMER_DOCS stays false, so the function reads ONLY claims in
-- CLAIMS_DOC_READ_ONLY_CLAIMS, and only documents created after CLAIMS_DOC_READ_FROM. No schedule is created.
-- The test claim has no email or phone, so nothing can be sent to it. Never run on Production.

-- =============================================================================================
-- A. Create the test claim (approval A). Prefix DAL-QA- like earlier test claims; plate 99-001-17 is unused.
-- =============================================================================================
insert into public.claims_records (id, plate, client_name, status, row_data)
values (
  'DAL-QA-DOCREAD-001',
  '99-001-17',
  'בדיקה פיקטיבית – קריאת מסמכים',
  'חדש',
  jsonb_build_object(
    'id', 'DAL-QA-DOCREAD-001',
    'claimNum', 'QA-DOCREAD-001',
    'plate', '99-001-17',
    'clientName', 'בדיקה פיקטיבית – קריאת מסמכים',
    'insCompany', 'הראל (בדיקה)',
    'claimKind', 'בדיקה',
    'status', 'חדש',
    'notes', 'תיק בדיקה פיקטיבי לקריאת מסמכים בצד השרת. אין לקוח אמיתי. למחוק בסיום.',
    'createdAt', now()::text
  )
)
on conflict (id) do nothing;

-- =============================================================================================
-- B. Switches, still OFF (approval B). FROM = now, so only documents uploaded after this moment count.
-- =============================================================================================
insert into public.claims_config (key, value) values
  ('CLAIMS_DOC_READ_ENABLED', 'false'),
  ('CLAIMS_DOC_READ_FROM', now()::text),
  ('CLAIMS_DOC_READ_BACKLOG', 'false'),
  ('CLAIMS_DOC_READ_MAX_PER_RUN', '1'),
  ('CLAIMS_DOC_READ_ONLY_CLAIMS', 'DAL-QA-DOCREAD-001')
on conflict (key) do update set value = excluded.value;

-- =============================================================================================
-- C. Upload (by the owner, logged in): open claim DAL-QA-DOCREAD-001 and upload
--    docs/audit-reports/claims-doc-autoread-2026-10-12/test-assets/FICTITIOUS-survey-report-DAL-QA-DOCREAD-001.pdf
--    in the gallery. Do NOT ask the chat for it yet (the chat card would read it in the browser instead).
-- Check:
select id, original_name, content_sha256 is not null as has_fingerprint, doc_meta ? 'read_status' as has_read
from public.claims_documents where claim_id = 'DAL-QA-DOCREAD-001';

-- =============================================================================================
-- D. status, then dry_run (approval D). Read-only in the function. Expect would_take = 1 / would_read = [that id].
-- =============================================================================================
select net.http_post(
  url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-doc-read',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
  body := jsonb_build_object('action', 'dry_run')
) as request_id;
-- select status_code, content from net._http_response where id = <request_id>;

-- =============================================================================================
-- E. ONE run (approval E): switch on, call 'run' once, switch off right after.
-- =============================================================================================
update public.claims_config set value = 'true' where key = 'CLAIMS_DOC_READ_ENABLED';
select net.http_post(
  url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-doc-read',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
  body := jsonb_build_object('action', 'run')
) as request_id;
-- select status_code, content from net._http_response where id = <request_id>;   -- expect taken 1, ready 1
update public.claims_config set value = 'false' where key = 'CLAIMS_DOC_READ_ENABLED';

-- =============================================================================================
-- F. Verify — only the test document changed.
-- =============================================================================================
select id, doc_meta->>'read_status' as status, doc_meta->>'read_doc_type' as type, doc_meta->>'read_plates' as plates,
       doc_meta->>'read_amounts' as amounts, doc_meta->>'read_job_state' as job
from public.claims_documents where claim_id = 'DAL-QA-DOCREAD-001';
select count(*) as other_docs_touched from public.claims_documents
where claim_id <> 'DAL-QA-DOCREAD-001' and (doc_meta ? 'read_job_state' or doc_meta ? 'read_status');
-- Expected after a correct run: read_status ready, type דוח שמאי, plates 9900117, amounts 4,850, job done,
-- other_docs_touched = 0. Then in the chat (inside the test claim): "תביא לי את דוח השמאי".

-- =============================================================================================
-- G. Cleanup (approval G): soft-delete the test claim like earlier QA claims; remove the pilot list.
-- =============================================================================================
-- update public.claims_records set row_data = row_data || jsonb_build_object('deletedAt', now()::text) where id = 'DAL-QA-DOCREAD-001';
-- update public.claims_config set value = '' where key = 'CLAIMS_DOC_READ_ONLY_CLAIMS';
