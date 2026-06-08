-- Align storage RLS with user-id based paths (buildStoragePath) and allow document_metadata inserts.

-- Storage: upload/read under auth.uid() as first path segment
CREATE POLICY "Users can upload to own uid folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own uid folder"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = get_user_company(auth.uid())
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- document_metadata: fleet managers already have FOR ALL; allow any company user to insert
CREATE POLICY "Company users can insert docs metadata"
ON public.document_metadata FOR INSERT TO authenticated
WITH CHECK (
  company_name = get_user_company(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
