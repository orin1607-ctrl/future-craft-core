-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Phase 2: assignment + isolated claims documents. No app_role change.
-- Does not alter vehicles, accidents, telemarketing, or document_requests.

ALTER TABLE public.claims_records
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claims_records_assigned ON public.claims_records (assigned_to);

CREATE TABLE IF NOT EXISTS public.claims_doc_requests (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  label text NOT NULL,
  doc_key text NOT NULL DEFAULT 'custom',
  status text NOT NULL DEFAULT 'requested',
  received_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_doc_requests_status_chk CHECK (status = ANY (ARRAY['requested','received','missing']))
);
CREATE INDEX IF NOT EXISTS idx_claims_doc_requests_claim ON public.claims_doc_requests (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_upload_links (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_upload_links_claim ON public.claims_upload_links (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_documents (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  doc_request_id text REFERENCES public.claims_doc_requests(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT '',
  byte_size integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'customer',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_documents_source_chk CHECK (source = ANY (ARRAY['customer','staff']))
);
CREATE INDEX IF NOT EXISTS idx_claims_documents_claim ON public.claims_documents (claim_id);

CREATE OR REPLACE FUNCTION public.claims_can_work_claim(p_claim_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.has_claims_access(auth.uid())
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.claims_records r
        WHERE r.id = p_claim_id
          AND (r.assigned_to = auth.uid() OR r.created_by = auth.uid())
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.claims_protect_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NULL AND auth.uid() IS NOT NULL
       AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      NEW.assigned_to := auth.uid();
      NEW.assigned_at := now();
      NEW.assigned_by := auth.uid();
    END IF;
    IF NEW.assigned_to IS NOT NULL AND coalesce(NEW.assigned_to_name, '') = '' THEN
      SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.assigned_to;
      NEW.assigned_to_name := coalesce(v_name, NEW.assigned_to_name);
      NEW.assigned_at := coalesce(NEW.assigned_at, now());
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RAISE EXCEPTION 'claims: only super_admin can change assigned_to';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claims_protect_assignment ON public.claims_records;
CREATE TRIGGER trg_claims_protect_assignment
  BEFORE INSERT OR UPDATE ON public.claims_records
  FOR EACH ROW EXECUTE FUNCTION public.claims_protect_assignment();

CREATE OR REPLACE FUNCTION public.claims_assign(p_claim_id text, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_prev text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'claims_assign: super_admin only';
  END IF;
  IF NOT public.has_claims_access(p_user_id) THEN
    RAISE EXCEPTION 'claims_assign: target has no claims access';
  END IF;
  SELECT assigned_to_name INTO v_prev FROM public.claims_records WHERE id = p_claim_id;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = p_user_id;
  UPDATE public.claims_records
    SET assigned_to = p_user_id,
        assigned_to_name = coalesce(v_name, ''),
        assigned_at = now(),
        assigned_by = auth.uid(),
        updated_at = now(),
        last_activity_at = now()
    WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claims_assign: claim not found';
  END IF;
  INSERT INTO public.claims_history (id, claim_id, row_data)
  VALUES (
    'HIS-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6),
    p_claim_id,
    jsonb_build_object(
      'id', 'assign',
      'claimId', p_claim_id,
      'action', 'הקצאת מטפל',
      'note', coalesce(v_name, ''),
      'type', 'assign',
      'valueBefore', coalesce(v_prev, ''),
      'valueAfter', coalesce(v_name, ''),
      'by', coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid()), ''),
      'at', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
    )
  );
  INSERT INTO public.claims_notifications (id, claim_id, row_data)
  VALUES (
    'NTF-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6),
    p_claim_id,
    jsonb_build_object(
      'claimId', p_claim_id,
      'type', 'assign',
      'message', 'הוקצתה אליך תביעה: ' || p_claim_id,
      'read', 'false',
      'createdAt', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
    )
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_list_assignees()
RETURNS TABLE (
  id uuid,
  full_name text,
  company_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.company_name
  FROM public.profiles p
  WHERE public.has_claims_access(auth.uid())
    AND public.has_claims_access(p.id)
    AND coalesce(p.is_active, true) = true
  ORDER BY p.full_name;
$$;

ALTER TABLE public.claims_doc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_upload_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_records_all ON public.claims_records;
CREATE POLICY claims_records_select ON public.claims_records
  FOR SELECT TO authenticated
  USING (public.claims_can_work_claim(id));
CREATE POLICY claims_records_insert ON public.claims_records
  FOR INSERT TO authenticated
  WITH CHECK (public.has_claims_access(auth.uid()));
CREATE POLICY claims_records_update ON public.claims_records
  FOR UPDATE TO authenticated
  USING (public.claims_can_work_claim(id))
  WITH CHECK (public.claims_can_work_claim(id));
CREATE POLICY claims_records_delete ON public.claims_records
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS claims_comm_log_all ON public.claims_comm_log;
CREATE POLICY claims_comm_log_all ON public.claims_comm_log
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

DROP POLICY IF EXISTS claims_tasks_all ON public.claims_tasks;
CREATE POLICY claims_tasks_all ON public.claims_tasks
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

DROP POLICY IF EXISTS claims_reminders_all ON public.claims_reminders;
CREATE POLICY claims_reminders_all ON public.claims_reminders
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

DROP POLICY IF EXISTS claims_history_all ON public.claims_history;
CREATE POLICY claims_history_all ON public.claims_history
  FOR ALL TO authenticated
  USING (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  WITH CHECK (claim_id IS NULL OR public.claims_can_work_claim(claim_id));

DROP POLICY IF EXISTS claims_notifications_all ON public.claims_notifications;
CREATE POLICY claims_notifications_all ON public.claims_notifications
  FOR ALL TO authenticated
  USING (claim_id IS NULL OR public.claims_can_work_claim(claim_id) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (claim_id IS NULL OR public.claims_can_work_claim(claim_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS claims_doc_requests_all ON public.claims_doc_requests;
CREATE POLICY claims_doc_requests_all ON public.claims_doc_requests
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

DROP POLICY IF EXISTS claims_upload_links_all ON public.claims_upload_links;
CREATE POLICY claims_upload_links_all ON public.claims_upload_links
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

DROP POLICY IF EXISTS claims_documents_all ON public.claims_documents;
CREATE POLICY claims_documents_all ON public.claims_documents
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

REVOKE ALL ON TABLE public.claims_doc_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_upload_links FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_documents FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_doc_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_upload_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_documents TO authenticated;

GRANT EXECUTE ON FUNCTION public.claims_can_work_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_assign(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_list_assignees() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'claims-docs',
  'claims-docs',
  false,
  15728640,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS claims_docs_block_clients ON storage.objects;
CREATE POLICY claims_docs_block_clients ON storage.objects
  AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'claims-docs')
  WITH CHECK (bucket_id <> 'claims-docs');
