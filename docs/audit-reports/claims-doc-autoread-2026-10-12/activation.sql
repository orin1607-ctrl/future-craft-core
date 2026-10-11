-- claims-doc-read activation — STAGING usfeoerkpcafxxlyuldl ONLY. NOT a migration; run by hand, one step at a time,
-- each step only after the owner's approval. Never run on Production (qasomfndnjuixgjmjwcm).
-- Nothing here sends document content anywhere: the function reads the PDF text layer itself and stores the result
-- in claims_documents.doc_meta. It uses the existing vault secret DALIA_EDGE_INTERNAL_SECRET (same as the Gmail scan).

-- ---------------------------------------------------------------------------------------------
-- STEP 1 — switches, all OFF. Safe: nothing runs.
-- ---------------------------------------------------------------------------------------------
insert into public.claims_config (key, value) values
  ('CLAIMS_DOC_READ_ENABLED', 'false'),
  ('CLAIMS_DOC_READ_FROM', now()::text),       -- only documents that arrive from now on
  ('CLAIMS_DOC_READ_BACKLOG', 'false'),        -- older gallery documents stay untouched
  ('CLAIMS_DOC_READ_MAX_PER_RUN', '3'),
  ('CLAIMS_DOC_READ_ONLY_CLAIMS', '<TEST_CLAIM_ID>')  -- pilot: one test claim with fictitious documents
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------------------------
-- STEP 2 — one manual call (status / dry_run / run). Returns counts and ids only.
-- Read the answer with: select status_code, content from net._http_response where id = <request id>;
-- ---------------------------------------------------------------------------------------------
select net.http_post(
  url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-doc-read',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')
  ),
  body := jsonb_build_object('action', 'status')   -- then 'dry_run', then 'run' (only with ENABLED = 'true')
);

-- ---------------------------------------------------------------------------------------------
-- STEP 3 — pilot on the test claim: turn the switch on, call 'run' (STEP 2), check the document in the chat.
-- ---------------------------------------------------------------------------------------------
-- update public.claims_config set value = 'true' where key = 'CLAIMS_DOC_READ_ENABLED';

-- ---------------------------------------------------------------------------------------------
-- STEP 4 — schedule (every 15 minutes). Separate approval.
-- ---------------------------------------------------------------------------------------------
-- select cron.schedule(
--   'claims-doc-read-staging',
--   '*/15 * * * *',
--   $$select net.http_post(
--       url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-doc-read',
--       headers := jsonb_build_object('Content-Type', 'application/json',
--         'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
--       body := '{"action":"run"}'::jsonb)$$
-- );

-- ---------------------------------------------------------------------------------------------
-- STEP 5 — all claims (customer documents): needs the code gate DOCUMENT_READ_CUSTOMER_DOCS = true in a reviewed
-- deploy, then clear the pilot list. Separate approval.
-- ---------------------------------------------------------------------------------------------
-- update public.claims_config set value = '' where key = 'CLAIMS_DOC_READ_ONLY_CLAIMS';

-- ---------------------------------------------------------------------------------------------
-- STEP 6 — older gallery documents (backlog). Separate approval. Processes MAX_PER_RUN per run, oldest first.
-- ---------------------------------------------------------------------------------------------
-- update public.claims_config set value = 'true' where key = 'CLAIMS_DOC_READ_BACKLOG';

-- ---------------------------------------------------------------------------------------------
-- STOP — any time, no deploy needed.
-- ---------------------------------------------------------------------------------------------
-- update public.claims_config set value = 'false' where key = 'CLAIMS_DOC_READ_ENABLED';
-- select cron.unschedule('claims-doc-read-staging');
