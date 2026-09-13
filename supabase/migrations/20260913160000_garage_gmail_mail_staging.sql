-- STAGING ONLY. Project ref: usfeoerkpcafxxlyuldl
-- Do NOT apply to Production (qasomfndnjuixgjmjwcm / dalia-car.online).
-- Garage Gmail mailboxes, files, and history. Isolated from Claims.
-- Does not DROP/TRUNCATE/DELETE existing rows.
-- Gmail FKs to garage_cases / mail rows use ON DELETE RESTRICT (no CASCADE).
-- Profile actor FKs use ON DELETE SET NULL (does not delete mail rows).
-- No DELETE policies. No DELETE grants to anon/authenticated.
-- Does not GRANT garage_gmail_connection or garage_gmail_settings to anon/authenticated.
-- Does not touch claims_*, claims-docs, claims-gmail, or Production.

-- ---------------------------------------------------------------------------
-- 0) Existing objects reused (NOT recreated)
-- ---------------------------------------------------------------------------
-- public.garage_gmail_connection  -- token for yoni191177@gmail.com, service_role only
-- public.garage_cases             -- תיק מוסך (GM-YYYY-NNNN)
-- public.garage_customers
-- public.garage_vehicles
-- public.garage_media             -- file catalog, FK garage_cases
-- storage.buckets id = 'garage-media' (private, 20MB)
-- public.garage_is_staff(uuid)    -- currently super_admin only; reused, not broadened

-- ---------------------------------------------------------------------------
-- 1) Helper: can the current user work this garage case?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garage_can_work_case(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_case_id IS NOT NULL
    AND public.garage_is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.garage_cases c
      WHERE c.id = p_case_id
    );
$$;

REVOKE ALL ON FUNCTION public.garage_can_work_case(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.garage_can_work_case(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.garage_can_work_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.garage_can_work_case(uuid) TO service_role;

-- Pending / unmatched inbox: staff only (same as current garage module).
CREATE OR REPLACE FUNCTION public.garage_gmail_can_review()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.garage_is_staff(auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.garage_gmail_can_review() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.garage_gmail_can_review() FROM anon;
GRANT EXECUTE ON FUNCTION public.garage_gmail_can_review() TO authenticated;
GRANT EXECUTE ON FUNCTION public.garage_gmail_can_review() TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Connection table: keep existing row; add optional metadata columns only
-- ---------------------------------------------------------------------------
ALTER TABLE public.garage_gmail_connection
  ADD COLUMN IF NOT EXISTS scopes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_sub text,
  ADD COLUMN IF NOT EXISTS connected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.garage_gmail_connection ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garage_gmail_connection_deny_clients ON public.garage_gmail_connection;
CREATE POLICY garage_gmail_connection_deny_clients
  ON public.garage_gmail_connection
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.garage_gmail_connection FROM PUBLIC;
REVOKE ALL ON TABLE public.garage_gmail_connection FROM anon;
REVOKE ALL ON TABLE public.garage_gmail_connection FROM authenticated;
-- service_role / postgres only. No refresh_token to the frontend.

-- ---------------------------------------------------------------------------
-- 3) Settings (service_role only). Allowed mailbox is Garage-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garage_gmail_settings (
  id text PRIMARY KEY,
  allowed_account text NOT NULL,
  send_enabled boolean NOT NULL DEFAULT true,
  package_limit_bytes bigint NOT NULL DEFAULT 18874368, -- 18 MiB, same idea as Claims
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_settings_account_chk
    CHECK (lower(allowed_account) = 'yoni191177@gmail.com')
);

INSERT INTO public.garage_gmail_settings (id, allowed_account, send_enabled)
VALUES ('staging', 'yoni191177@gmail.com', true)
ON CONFLICT (id) DO UPDATE
  SET allowed_account = EXCLUDED.allowed_account,
      updated_at = now();

ALTER TABLE public.garage_gmail_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garage_gmail_settings_deny_clients ON public.garage_gmail_settings;
CREATE POLICY garage_gmail_settings_deny_clients
  ON public.garage_gmail_settings
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.garage_gmail_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.garage_gmail_settings FROM anon;
REVOKE ALL ON TABLE public.garage_gmail_settings FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4) garage_cases: thread id for unique match (no Claims columns)
-- ---------------------------------------------------------------------------
ALTER TABLE public.garage_cases
  ADD COLUMN IF NOT EXISTS gmail_thread_id text;

CREATE INDEX IF NOT EXISTS idx_garage_cases_gmail_thread
  ON public.garage_cases (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_garage_cases_case_number
  ON public.garage_cases (case_number);

-- ---------------------------------------------------------------------------
-- 5) garage_media: Gmail file metadata on existing catalog + garage-media bucket
-- ---------------------------------------------------------------------------
ALTER TABLE public.garage_media
  DROP CONSTRAINT IF EXISTS garage_media_category_check;

ALTER TABLE public.garage_media
  ADD CONSTRAINT garage_media_category_check
  CHECK (category = ANY (ARRAY[
    'customer_order','quote_photos','intake','angles','damage','during_work','finish',
    'parts_invoices','quotes','customer_approvals','intake_docs','delivery','other',
    'gmail_in','gmail_out'
  ]));

ALTER TABLE public.garage_media
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS gmail_attachment_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS original_name text NOT NULL DEFAULT '';

ALTER TABLE public.garage_media
  DROP CONSTRAINT IF EXISTS garage_media_source_chk;
ALTER TABLE public.garage_media
  ADD CONSTRAINT garage_media_source_chk
  CHECK (source = ANY (ARRAY['staff','gmail_in','gmail_out']));

CREATE INDEX IF NOT EXISTS idx_garage_media_gmail_msg
  ON public.garage_media (garage_case_id, gmail_message_id);

-- Existing storage policies on bucket garage-media stay:
--   garage_media_storage_select / garage_media_storage_insert
--   USING/WITH CHECK: bucket_id = 'garage-media' AND garage_is_staff(auth.uid())
-- No new DELETE policy. No claims-docs policy change.
-- Path convention (enforced in Edge, not SQL):
--   assigned: {garage_case_id}/gmail/{gmail_message_id}/{safe_filename}
--   unmatched pending: _pending/{gmail_message_id}/{safe_filename}

-- ---------------------------------------------------------------------------
-- 6) Imports (inbound, assigned to one garage case)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garage_gmail_imports (
  id text PRIMARY KEY,
  garage_case_id uuid NOT NULL REFERENCES public.garage_cases(id) ON DELETE RESTRICT,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  rfc_message_id text,
  from_addr text,
  to_addr text,
  cc_addr text,
  subject text,
  snippet text,
  body_text text,
  sent_at timestamptz,
  direction text NOT NULL DEFAULT 'incoming',
  attachment_count integer NOT NULL DEFAULT 0,
  found_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_amount numeric,
  candidate_currency text,
  price_alert boolean NOT NULL DEFAULT false,
  price_reviewed_at timestamptz,
  price_reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_via text,
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  imported_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_imports_dir_chk CHECK (direction = ANY (ARRAY['incoming','outgoing'])),
  CONSTRAINT garage_gmail_imports_uniq UNIQUE (garage_case_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_garage_gmail_imports_case
  ON public.garage_gmail_imports (garage_case_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_garage_gmail_imports_thread
  ON public.garage_gmail_imports (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_garage_gmail_imports_msgid
  ON public.garage_gmail_imports (gmail_message_id);

ALTER TABLE public.garage_gmail_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garage_gmail_imports_all ON public.garage_gmail_imports;
DROP POLICY IF EXISTS garage_gmail_imports_select ON public.garage_gmail_imports;
DROP POLICY IF EXISTS garage_gmail_imports_insert ON public.garage_gmail_imports;
DROP POLICY IF EXISTS garage_gmail_imports_update ON public.garage_gmail_imports;
CREATE POLICY garage_gmail_imports_select ON public.garage_gmail_imports
  FOR SELECT TO authenticated
  USING (public.garage_can_work_case(garage_case_id));
CREATE POLICY garage_gmail_imports_insert ON public.garage_gmail_imports
  FOR INSERT TO authenticated
  WITH CHECK (public.garage_can_work_case(garage_case_id));
CREATE POLICY garage_gmail_imports_update ON public.garage_gmail_imports
  FOR UPDATE TO authenticated
  USING (public.garage_can_work_case(garage_case_id))
  WITH CHECK (public.garage_can_work_case(garage_case_id));

REVOKE ALL ON TABLE public.garage_gmail_imports FROM PUBLIC;
REVOKE ALL ON TABLE public.garage_gmail_imports FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_gmail_imports TO authenticated;
REVOKE DELETE ON TABLE public.garage_gmail_imports FROM PUBLIC;
REVOKE DELETE ON TABLE public.garage_gmail_imports FROM anon;
REVOKE DELETE ON TABLE public.garage_gmail_imports FROM authenticated;
-- no DELETE grant to authenticated

-- ---------------------------------------------------------------------------
-- 7) Outbox (send journal). Failed rows stay failed. Unique idempotency.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garage_gmail_outbox (
  id text PRIMARY KEY,
  garage_case_id uuid NOT NULL REFERENCES public.garage_cases(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'garage_send',
  idempotency_key text,
  status text NOT NULL DEFAULT 'pending',
  send_no integer,
  gmail_message_id text,
  gmail_thread_id text,
  rfc_message_id text,
  from_addr text NOT NULL DEFAULT 'yoni191177@gmail.com',
  to_addr text NOT NULL,
  cc_addr text,
  subject text,
  sender text,
  body_text text,
  body_excerpt text,
  media_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  package_bytes bigint,
  error_text text,
  sent_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_outbox_kind_chk CHECK (kind = ANY (ARRAY['garage_send','garage_reply'])),
  CONSTRAINT garage_gmail_outbox_status_chk CHECK (status = ANY (ARRAY['pending','sent','failed'])),
  CONSTRAINT garage_gmail_outbox_from_chk CHECK (lower(from_addr) = 'yoni191177@gmail.com')
);

CREATE UNIQUE INDEX IF NOT EXISTS garage_gmail_outbox_idempotency_uniq
  ON public.garage_gmail_outbox (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS garage_gmail_outbox_send_no_uniq
  ON public.garage_gmail_outbox (send_no)
  WHERE send_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_garage_gmail_outbox_case
  ON public.garage_gmail_outbox (garage_case_id, created_at DESC);

ALTER TABLE public.garage_gmail_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garage_gmail_outbox_all ON public.garage_gmail_outbox;
DROP POLICY IF EXISTS garage_gmail_outbox_select ON public.garage_gmail_outbox;
DROP POLICY IF EXISTS garage_gmail_outbox_insert ON public.garage_gmail_outbox;
DROP POLICY IF EXISTS garage_gmail_outbox_update ON public.garage_gmail_outbox;
CREATE POLICY garage_gmail_outbox_select ON public.garage_gmail_outbox
  FOR SELECT TO authenticated
  USING (public.garage_can_work_case(garage_case_id));
CREATE POLICY garage_gmail_outbox_insert ON public.garage_gmail_outbox
  FOR INSERT TO authenticated
  WITH CHECK (public.garage_can_work_case(garage_case_id));
CREATE POLICY garage_gmail_outbox_update ON public.garage_gmail_outbox
  FOR UPDATE TO authenticated
  USING (public.garage_can_work_case(garage_case_id))
  WITH CHECK (public.garage_can_work_case(garage_case_id));

REVOKE ALL ON TABLE public.garage_gmail_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.garage_gmail_outbox FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_gmail_outbox TO authenticated;
REVOKE DELETE ON TABLE public.garage_gmail_outbox FROM PUBLIC;
REVOKE DELETE ON TABLE public.garage_gmail_outbox FROM anon;
REVOKE DELETE ON TABLE public.garage_gmail_outbox FROM authenticated;

-- ---------------------------------------------------------------------------
-- 8) Pending unmatched inbound (no auto-guess into a case)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garage_gmail_pending (
  id text PRIMARY KEY,
  gmail_message_id text NOT NULL UNIQUE,
  gmail_thread_id text,
  rfc_message_id text,
  from_addr text,
  to_addr text,
  cc_addr text,
  subject text,
  snippet text,
  body_text text,
  sent_at timestamptz,
  attachment_count integer NOT NULL DEFAULT 0,
  pending_storage_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL DEFAULT 'needs_review',
  reason text,
  via text,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_case_id uuid REFERENCES public.garage_cases(id) ON DELETE RESTRICT,
  imported_id text,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_pending_decision_chk
    CHECK (decision = ANY (ARRAY['needs_review','assigned','ignored']))
);

CREATE INDEX IF NOT EXISTS idx_garage_gmail_pending_decision
  ON public.garage_gmail_pending (decision, created_at DESC);

ALTER TABLE public.garage_gmail_pending ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garage_gmail_pending_all ON public.garage_gmail_pending;
DROP POLICY IF EXISTS garage_gmail_pending_select ON public.garage_gmail_pending;
DROP POLICY IF EXISTS garage_gmail_pending_insert ON public.garage_gmail_pending;
DROP POLICY IF EXISTS garage_gmail_pending_update ON public.garage_gmail_pending;
CREATE POLICY garage_gmail_pending_select ON public.garage_gmail_pending
  FOR SELECT TO authenticated
  USING (public.garage_gmail_can_review());
CREATE POLICY garage_gmail_pending_insert ON public.garage_gmail_pending
  FOR INSERT TO authenticated
  WITH CHECK (public.garage_gmail_can_review());
CREATE POLICY garage_gmail_pending_update ON public.garage_gmail_pending
  FOR UPDATE TO authenticated
  USING (public.garage_gmail_can_review())
  WITH CHECK (public.garage_gmail_can_review());

REVOKE ALL ON TABLE public.garage_gmail_pending FROM PUBLIC;
REVOKE ALL ON TABLE public.garage_gmail_pending FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_gmail_pending TO authenticated;
REVOKE DELETE ON TABLE public.garage_gmail_pending FROM PUBLIC;
REVOKE DELETE ON TABLE public.garage_gmail_pending FROM anon;
REVOKE DELETE ON TABLE public.garage_gmail_pending FROM authenticated;

-- ---------------------------------------------------------------------------
-- 9) History (full chain inside the garage case; survives refresh)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.garage_gmail_history (
  id text PRIMARY KEY,
  garage_case_id uuid NOT NULL REFERENCES public.garage_cases(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  import_id text REFERENCES public.garage_gmail_imports(id) ON DELETE RESTRICT,
  outbox_id text REFERENCES public.garage_gmail_outbox(id) ON DELETE RESTRICT,
  pending_id text REFERENCES public.garage_gmail_pending(id) ON DELETE RESTRICT,
  gmail_message_id text,
  gmail_thread_id text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  summary text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_history_type_chk CHECK (event_type = ANY (ARRAY[
    'sent','send_failed','received','assigned','attachment','price_candidate','manual_assign','ignored'
  ]))
);

CREATE INDEX IF NOT EXISTS idx_garage_gmail_history_case
  ON public.garage_gmail_history (garage_case_id, created_at ASC);

ALTER TABLE public.garage_gmail_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS garage_gmail_history_all ON public.garage_gmail_history;
DROP POLICY IF EXISTS garage_gmail_history_select ON public.garage_gmail_history;
DROP POLICY IF EXISTS garage_gmail_history_insert ON public.garage_gmail_history;
DROP POLICY IF EXISTS garage_gmail_history_update ON public.garage_gmail_history;
CREATE POLICY garage_gmail_history_select ON public.garage_gmail_history
  FOR SELECT TO authenticated
  USING (public.garage_can_work_case(garage_case_id));
CREATE POLICY garage_gmail_history_insert ON public.garage_gmail_history
  FOR INSERT TO authenticated
  WITH CHECK (public.garage_can_work_case(garage_case_id));
CREATE POLICY garage_gmail_history_update ON public.garage_gmail_history
  FOR UPDATE TO authenticated
  USING (public.garage_can_work_case(garage_case_id))
  WITH CHECK (public.garage_can_work_case(garage_case_id));

REVOKE ALL ON TABLE public.garage_gmail_history FROM PUBLIC;
REVOKE ALL ON TABLE public.garage_gmail_history FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_gmail_history TO authenticated;
REVOKE DELETE ON TABLE public.garage_gmail_history FROM PUBLIC;
REVOKE DELETE ON TABLE public.garage_gmail_history FROM anon;
REVOKE DELETE ON TABLE public.garage_gmail_history FROM authenticated;

-- ---------------------------------------------------------------------------
-- 10) Explicit isolation / non-goals (documentation in SQL, no Claims objects)
-- ---------------------------------------------------------------------------
-- NOT created / NOT altered:
--   claims_gmail_connection, claims_gmail_imports, claims_gmail_outbox,
--   claims_gmail_pending, claims_documents, claims_history, claims_config,
--   storage.buckets claims-docs, any Production object.
-- NOT granted: refresh_token to the browser.
-- NOT dropped: existing garage_gmail_connection row for yoni191177@gmail.com.
