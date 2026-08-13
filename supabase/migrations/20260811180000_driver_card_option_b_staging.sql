-- Oren Car Staging: Driver card Option B — document types + validity_years (additive only)

ALTER TABLE public.document_type_defs
  ADD COLUMN IF NOT EXISTS validity_years integer;

COMMENT ON COLUMN public.document_type_defs.validity_years IS
  'Optional auto-expiry: expiry_date = document issue date + validity_years on upload';

UPDATE public.document_type_defs
SET validity_years = 5, updated_at = now()
WHERE key = 'health_declaration';

INSERT INTO public.document_type_defs (
  key, label_he, category, entity_scopes, requires_expiry, requires_manager_approval,
  allowed_mime_types, max_file_bytes, allow_multiple, storage_folder, message_template_he, sort_order, validity_years
) VALUES
  (
    'traffic_info', 'מידע תעבורתי', 'driver', '{driver}', true, true,
    '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'traffic-info',
    'שלום {{recipient_name}}, אנא העלו מידע תעבורתי דרך הקישור המאובטח בלבד: {{upload_url}}', 65, 3
  ),
  (
    'traffic_ticket', 'דוח תעבורה', 'driver', '{driver}', false, true,
    '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'traffic-tickets',
    'שלום {{recipient_name}}, אנא העלו דוח תעבורה דרך הקישור המאובטח בלבד: {{upload_url}}', 66, NULL
  )
ON CONFLICT (key) DO UPDATE SET
  label_he = EXCLUDED.label_he,
  category = EXCLUDED.category,
  entity_scopes = EXCLUDED.entity_scopes,
  requires_expiry = EXCLUDED.requires_expiry,
  storage_folder = EXCLUDED.storage_folder,
  message_template_he = EXCLUDED.message_template_he,
  sort_order = EXCLUDED.sort_order,
  validity_years = EXCLUDED.validity_years,
  updated_at = now();
