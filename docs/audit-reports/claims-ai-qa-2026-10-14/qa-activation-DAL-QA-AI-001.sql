-- QA activation of the claims AI — STAGING usfeoerkpcafxxlyuldl ONLY. Not a migration. Never on Production.
-- One fictitious claim (DAL-QA-AI-001), two fictitious documents, document reading with the computer off.
-- Prerequisite: help-ai-chat v150 and claims-doc-read v4 from commit f20324f2 (QA scope + explicit approval list).
-- RUN 2026-10-14 ~18:40-18:54 UTC by approval: steps A, B, D (cron job id 12, owner postgres).
-- Isolation: customer gates stay off in code, so claims-doc-read reads ONLY DAL-QA-* claims on the pilot list
-- (a real claim id put there is ignored) and only QA documents may go to OCR (Gemini). The chat sends
-- document text to the model for DAL-QA-* claims only.
-- The claim has no e-mail address. Its phone numbers are placeholders: open wa.me links to check them, never send.

-- =============================================================================================
-- A. The QA claim (approval A).
-- =============================================================================================
insert into public.claims_records (id, plate, client_name, status, row_data)
values (
  'DAL-QA-AI-001', '99-002-18', 'לקוח בדיקה פיקטיבי', 'חדש',
  jsonb_build_object(
    'id', 'DAL-QA-AI-001',
    'claimNum', 'QA-AI-001',
    'plate', '99-002-18',
    'clientName', 'לקוח בדיקה פיקטיבי',
    'clientPhone', '050-0000001',
    'surveyor', 'שמאי בדיקה פיקטיבי',
    'survPhone', '052-0000002',
    'insCompany', 'הראל (בדיקה)',
    'claimKind', 'בדיקה',
    'status', 'חדש',
    'isQa', 'true',
    'notes', 'תיק בדיקה פיקטיבי ל-AI ניהול תביעות. אין לקוח אמיתי. אין לשלוח ממנו הודעות.',
    'createdAt', now()::text
  )
)
on conflict (id) do nothing;

-- =============================================================================================
-- B. Reading switches for the QA claim, still OFF (approval B).
-- =============================================================================================
insert into public.claims_config (key, value) values
  ('CLAIMS_DOC_READ_ENABLED', 'false'),
  ('CLAIMS_DOC_READ_FROM', now()::text),
  ('CLAIMS_DOC_READ_BACKLOG', 'false'),
  ('CLAIMS_DOC_READ_MAX_PER_RUN', '3'),
  ('CLAIMS_DOC_READ_ONLY_CLAIMS', 'DAL-QA-AI-001'),
  ('CLAIMS_DOC_READ_OCR', 'true')   -- effective for QA claims only while the customer gates are off
on conflict (key) do update set value = excluded.value;

-- =============================================================================================
-- C. Owner, logged in: open DAL-QA-AI-001 and upload in the gallery
--    test-assets/FICTITIOUS-survey-report-DAL-QA-AI-001.pdf and test-assets/FICTITIOUS-invoice-scan-DAL-QA-AI-001.png
-- =============================================================================================
select id, original_name, content_sha256 is not null as has_fingerprint from public.claims_documents where claim_id = 'DAL-QA-AI-001';

-- =============================================================================================
-- D. Switch on and schedule every 10 minutes (approval D). Runs with the computer off.
-- =============================================================================================
update public.claims_config set value = 'true' where key = 'CLAIMS_DOC_READ_ENABLED';
select cron.schedule(
  'claims-doc-read-staging',
  '*/10 * * * *',
  $$select net.http_post(
      url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-doc-read',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 120000)$$   -- pg_net default (5 s) is shorter than a cold start
);

-- =============================================================================================
-- E. Verify after ~10 minutes: both QA documents read, nothing else touched.
-- =============================================================================================
select id, doc_meta->>'read_status' status, doc_meta->>'read_source' source, doc_meta->>'read_doc_type' type,
       doc_meta->>'read_claim_nums' claim_nums, doc_meta->>'read_plates' plates, doc_meta->>'read_amounts' amounts,
       doc_meta->>'read_job_state' job
from public.claims_documents where claim_id = 'DAL-QA-AI-001';
-- expected: survey pdf_text / דוח שמאי / QA-AI-001 / 9900218 / 3,850; invoice ocr / חשבונית תיקון / QA-AI-001 / 9900218 / 4,543.00
select count(*) as other_docs_touched from public.claims_documents
where claim_id <> 'DAL-QA-AI-001' and (doc_meta ? 'read_job_state' or (doc_meta->>'read_source') in ('pdf_text', 'ocr') and doc_meta ? 'read_job_at');
select status, count(*) from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'claims-doc-read-staging') group by 1;

-- =============================================================================================
-- STOP — any time, no deploy needed.
-- =============================================================================================
-- update public.claims_config set value = 'false' where key = 'CLAIMS_DOC_READ_ENABLED';
-- update public.claims_config set value = 'false' where key = 'CLAIMS_DOC_READ_OCR';
-- select cron.unschedule('claims-doc-read-staging');

-- =============================================================================================
-- CLEANUP after acceptance (approval): soft-delete like earlier QA claims. No hard delete.
-- =============================================================================================
-- update public.claims_records set row_data = row_data || jsonb_build_object('deletedAt', now()::text) where id = 'DAL-QA-AI-001';
-- update public.claims_config set value = '' where key = 'CLAIMS_DOC_READ_ONLY_CLAIMS';
