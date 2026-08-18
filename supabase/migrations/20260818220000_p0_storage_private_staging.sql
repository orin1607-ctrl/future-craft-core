-- P0-A Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production without Owner approval.
-- Makes documents bucket private and drops bucket-wide SELECT/INSERT policies.
-- Access is uid / company / token-folder scoped. Anonymous SELECT on the bucket is removed.
-- Rollback: SET public=true and restore previous policies (see docs in security-remediation-staging.json).

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

-- Wide / leftover SELECT and INSERT policies (names from audit + historical migrations).
DROP POLICY IF EXISTS "documents_read_public" ON storage.objects;
DROP POLICY IF EXISTS "public_read_documents" ON storage.objects;
DROP POLICY IF EXISTS "auth_read_documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "documents_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents to own company folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own company documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own uid folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own uid folder" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous can view declaration signatures" ON storage.objects;
DROP POLICY IF EXISTS "auth_select_documents_scoped" ON storage.objects;
DROP POLICY IF EXISTS "auth_insert_documents_scoped" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous can upload declaration signatures" ON storage.objects;

CREATE POLICY "auth_select_documents_scoped"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR (storage.foldername(name))[1] = public.get_user_company(auth.uid())
    OR (storage.foldername(name))[1] = 'declarations'
    OR (
      (storage.foldername(name))[1] IN ('admin-uploads', 'request-uploads', 'exchanges', 'qa-samples', 'qa-security')
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role)
        OR public.has_role(auth.uid(), 'fleet_manager'::app_role)
      )
    )
  )
);

CREATE POLICY "auth_insert_documents_scoped"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR (storage.foldername(name))[1] = public.get_user_company(auth.uid())
    OR (storage.foldername(name))[1] = 'declarations'
    OR (
      (storage.foldername(name))[1] IN ('admin-uploads', 'exchanges')
      AND (
        public.has_role(auth.uid(), 'super_admin'::app_role)
        OR public.has_role(auth.uid(), 'fleet_manager'::app_role)
      )
    )
  )
);

-- Anonymous may upload a signature file for the sign-by-link flow only.
-- They cannot list or download other objects; viewers use authenticated signed URLs.
CREATE POLICY "Anonymous can upload declaration signatures"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'declarations'
);
