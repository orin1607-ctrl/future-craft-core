-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Telemarketing microphone recordings: private bucket + metadata columns.
-- Does not change existing call / follow-up / notification RLS.
-- Rollback:
--   DROP POLICY IF EXISTS telemarketing_recordings_select ON storage.objects;
--   DROP POLICY IF EXISTS telemarketing_recordings_insert ON storage.objects;
--   DELETE FROM storage.objects WHERE bucket_id = 'telemarketing-recordings';
--   DELETE FROM storage.buckets WHERE id = 'telemarketing-recordings';
--   ALTER TABLE public.telemarketing_calls
--     DROP COLUMN IF EXISTS recording_path,
--     DROP COLUMN IF EXISTS recording_status,
--     DROP COLUMN IF EXISTS recording_mime;

ALTER TABLE public.telemarketing_calls
  ADD COLUMN IF NOT EXISTS recording_path text,
  ADD COLUMN IF NOT EXISTS recording_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recording_mime text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telemarketing_calls_recording_status_check'
  ) THEN
    ALTER TABLE public.telemarketing_calls
      ADD CONSTRAINT telemarketing_calls_recording_status_check
      CHECK (recording_status IN ('none', 'pending', 'ready', 'failed'));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'telemarketing-recordings',
  'telemarketing-recordings',
  false,
  52428800,
  ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'video/webm']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS telemarketing_recordings_select ON storage.objects;
CREATE POLICY telemarketing_recordings_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'telemarketing-recordings'
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

DROP POLICY IF EXISTS telemarketing_recordings_insert ON storage.objects;
CREATE POLICY telemarketing_recordings_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'telemarketing-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  )
  AND EXISTS (
    SELECT 1
    FROM public.telemarketing_calls c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.employee_id = auth.uid()
  )
);

-- No UPDATE / DELETE policies. No anon access. No public bucket.
