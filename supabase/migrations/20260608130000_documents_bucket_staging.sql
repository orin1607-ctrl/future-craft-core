-- dalia-staging ONLY — requires explicit approval before running.
-- Creates public documents bucket for vehicle file uploads.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_upload_authenticated'
  ) THEN
    CREATE POLICY "documents_upload_authenticated"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_read_public'
  ) THEN
    CREATE POLICY "documents_read_public"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'documents_delete_own'
  ) THEN
    CREATE POLICY "documents_delete_own"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
