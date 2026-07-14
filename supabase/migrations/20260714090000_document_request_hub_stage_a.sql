-- Document Request Hub — Stage A (Staging only)
-- Universal entity_type + entity_id. No production apply.

-- 1) Catalog of document types (extensible without code changes)
CREATE TABLE IF NOT EXISTS public.document_type_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_he text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  entity_scopes text[] NOT NULL DEFAULT '{driver,vehicle}',
  requires_expiry boolean NOT NULL DEFAULT false,
  requires_manager_approval boolean NOT NULL DEFAULT true,
  allowed_mime_types text[] NOT NULL DEFAULT '{image/jpeg,image/png,image/webp,application/pdf}',
  max_file_bytes integer NOT NULL DEFAULT 10485760,
  allow_multiple boolean NOT NULL DEFAULT false,
  storage_folder text NOT NULL DEFAULT 'document-requests',
  message_template_he text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Requests (universal for any entity)
CREATE TABLE IF NOT EXISTS public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  document_type_key text NOT NULL REFERENCES public.document_type_defs(key),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_label text NOT NULL DEFAULT '',
  recipient_name text NOT NULL DEFAULT '',
  recipient_phone text NOT NULL DEFAULT '',
  recipient_email text NOT NULL DEFAULT '',
  recipient_user_id uuid,
  requested_by uuid,
  requested_by_name text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'link',
  token_hash text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'created',
  outbound_message_id text NOT NULL DEFAULT '',
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  uploaded_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  rejection_reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  current_version_id uuid,
  upload_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_requests_status_chk CHECK (
    status = ANY (ARRAY[
      'created'::text,
      'sent'::text,
      'delivered'::text,
      'opened'::text,
      'uploaded'::text,
      'pending_approval'::text,
      'approved'::text,
      'rejected'::text,
      'expired'::text,
      'cancelled'::text
    ])
  ),
  CONSTRAINT document_requests_channel_chk CHECK (
    channel = ANY (ARRAY['link'::text, 'whatsapp'::text, 'sms'::text, 'email'::text, 'app'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_document_requests_entity
  ON public.document_requests (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_requests_company
  ON public.document_requests (company_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_requests_status
  ON public.document_requests (status);
CREATE INDEX IF NOT EXISTS idx_document_requests_token_hash
  ON public.document_requests (token_hash);

-- 3) Event history
CREATE TABLE IF NOT EXISTS public.document_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_request_events_request
  ON public.document_request_events (request_id, created_at DESC);

-- 4) Versions — never delete prior files in normal flow
CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  document_type_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
  version_no integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  file_path text NOT NULL,
  public_url text NOT NULL DEFAULT '',
  original_name text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT '',
  file_size_bytes integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'request_link',
  uploaded_by uuid,
  metadata_id uuid,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_source_chk CHECK (
    source = ANY (ARRAY['request_link'::text, 'manager_upload'::text, 'import'::text, 'system'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_document_versions_entity
  ON public.document_versions (entity_type, entity_id, document_type_key, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_current
  ON public.document_versions (entity_type, entity_id, document_type_key)
  WHERE is_current = true;

ALTER TABLE public.document_requests
  DROP CONSTRAINT IF EXISTS document_requests_current_version_fk;
ALTER TABLE public.document_requests
  ADD CONSTRAINT document_requests_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.document_type_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Managers / super_admin can read catalog
DROP POLICY IF EXISTS "document_type_defs_select" ON public.document_type_defs;
CREATE POLICY "document_type_defs_select" ON public.document_type_defs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "document_type_defs_manage" ON public.document_type_defs;
CREATE POLICY "document_type_defs_manage" ON public.document_type_defs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Requests: company scope
DROP POLICY IF EXISTS "document_requests_select" ON public.document_requests;
CREATE POLICY "document_requests_select" ON public.document_requests
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR company_name = get_user_company(auth.uid())
  );

DROP POLICY IF EXISTS "document_requests_insert" ON public.document_requests;
CREATE POLICY "document_requests_insert" ON public.document_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'fleet_manager'::app_role)
  );

DROP POLICY IF EXISTS "document_requests_update" ON public.document_requests;
CREATE POLICY "document_requests_update" ON public.document_requests
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR company_name = get_user_company(auth.uid())
  );

DROP POLICY IF EXISTS "document_request_events_select" ON public.document_request_events;
CREATE POLICY "document_request_events_select" ON public.document_request_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.document_requests r
      WHERE r.id = request_id
        AND (
          has_role(auth.uid(), 'super_admin'::app_role)
          OR r.company_name = get_user_company(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "document_versions_select" ON public.document_versions;
CREATE POLICY "document_versions_select" ON public.document_versions
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR company_name = get_user_company(auth.uid())
  );

DROP POLICY IF EXISTS "document_versions_insert" ON public.document_versions;
CREATE POLICY "document_versions_insert" ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'fleet_manager'::app_role)
    OR company_name = get_user_company(auth.uid())
  );

-- Seed 20 document types
INSERT INTO public.document_type_defs (
  key, label_he, category, entity_scopes, requires_expiry, requires_manager_approval,
  allowed_mime_types, max_file_bytes, allow_multiple, storage_folder, message_template_he, sort_order
) VALUES
  ('driver_license', 'רישיון נהיגה', 'driver', '{driver}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'driver-licenses',
   'שלום {{recipient_name}}, אנא העלו רישיון נהיגה דרך הקישור המאובטח בלבד (אין לשלוח קבצים בתשובה להודעה): {{upload_url}}', 10),
  ('vehicle_license', 'רישיון רכב', 'vehicle', '{vehicle}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'vehicle-license',
   'שלום {{recipient_name}}, אנא העלו רישיון רכב דרך הקישור המאובטח בלבד: {{upload_url}}', 20),
  ('id_card', 'תעודת זהות', 'driver', '{driver,employee}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'id-cards',
   'שלום {{recipient_name}}, אנא העלו תעודת זהות דרך הקישור המאובטח בלבד: {{upload_url}}', 30),
  ('mandatory_insurance', 'ביטוח חובה', 'vehicle', '{vehicle}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'insurance',
   'שלום {{recipient_name}}, אנא העלו פוליסת ביטוח חובה דרך הקישור בלבד: {{upload_url}}', 40),
  ('comprehensive_insurance', 'ביטוח מקיף', 'vehicle', '{vehicle}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'comprehensive',
   'שלום {{recipient_name}}, אנא העלו פוליסת ביטוח מקיף דרך הקישור בלבד: {{upload_url}}', 50),
  ('insurance_certificate', 'אישור ביטוח', 'vehicle', '{vehicle,driver}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'insurance-certs',
   'שלום {{recipient_name}}, אנא העלו אישור ביטוח דרך הקישור בלבד: {{upload_url}}', 60),
  ('health_declaration', 'הצהרת בריאות', 'driver', '{driver}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'health-declarations',
   'שלום {{recipient_name}}, אנא העלו הצהרת בריאות דרך הקישור בלבד: {{upload_url}}', 70),
  ('medical_certificate', 'אישור רפואי', 'driver', '{driver,employee}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'medical',
   'שלום {{recipient_name}}, אנא העלו אישור רפואי דרך הקישור בלבד: {{upload_url}}', 80),
  ('driver_declaration', 'הצהרת נהג', 'driver', '{driver}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'driver-declarations',
   'שלום {{recipient_name}}, אנא העלו הצהרת נהג דרך הקישור בלבד: {{upload_url}}', 90),
  ('driving_fitness', 'טופס כשירות נהיגה', 'driver', '{driver}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'driving-fitness',
   'שלום {{recipient_name}}, אנא העלו טופס כשירות נהיגה דרך הקישור בלבד: {{upload_url}}', 100),
  ('no_claims', 'אישור העדר תביעות', 'vehicle', '{vehicle,driver}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'no-claims',
   'שלום {{recipient_name}}, אנא העלו אישור העדר תביעות דרך הקישור בלבד: {{upload_url}}', 110),
  ('vehicle_photo', 'תמונת רכב', 'vehicle', '{vehicle}', false, false,
   '{image/jpeg,image/png,image/webp}', 10485760, true, 'vehicle-photos',
   'שלום {{recipient_name}}, אנא העלו תמונת רכב דרך הקישור בלבד: {{upload_url}}', 120),
  ('invoice', 'חשבונית', 'expense', '{vehicle,driver,supplier,company}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'invoices',
   'שלום {{recipient_name}}, אנא העלו חשבונית דרך הקישור בלבד: {{upload_url}}', 130),
  ('receipt', 'קבלה', 'expense', '{vehicle,driver,supplier,company}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'receipts',
   'שלום {{recipient_name}}, אנא העלו קבלה דרך הקישור בלבד: {{upload_url}}', 140),
  ('quote', 'הצעת מחיר', 'expense', '{vehicle,supplier,company}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'quotes',
   'שלום {{recipient_name}}, אנא העלו הצעת מחיר דרך הקישור בלבד: {{upload_url}}', 150),
  ('surveyor_report', 'דוח שמאי', 'accident', '{vehicle,accident}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 15728640, true, 'surveyor',
   'שלום {{recipient_name}}, אנא העלו דוח שמאי דרך הקישור בלבד: {{upload_url}}', 160),
  ('accident_document', 'מסמך תאונה', 'accident', '{vehicle,driver,accident}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 15728640, true, 'accidents',
   'שלום {{recipient_name}}, אנא העלו מסמך תאונה דרך הקישור בלבד: {{upload_url}}', 170),
  ('service_approval', 'אישור טיפול', 'maintenance', '{vehicle}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'service-approvals',
   'שלום {{recipient_name}}, אנא העלו אישור טיפול דרך הקישור בלבד: {{upload_url}}', 180),
  ('power_of_attorney', 'ייפוי כוח', 'legal', '{driver,vehicle,employee,company}', true, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, false, 'power-of-attorney',
   'שלום {{recipient_name}}, אנא העלו ייפוי כוח דרך הקישור בלבד: {{upload_url}}', 190),
  ('general_document', 'מסמך כללי', 'general', '{driver,vehicle,employee,customer,supplier,accident,company}', false, true,
   '{image/jpeg,image/png,image/webp,application/pdf}', 10485760, true, 'general',
   'שלום {{recipient_name}}, אנא העלו מסמך דרך הקישור המאובטח בלבד (אין לשלוח קבצים בתשובה להודעה): {{upload_url}}', 200)
ON CONFLICT (key) DO UPDATE SET
  label_he = EXCLUDED.label_he,
  category = EXCLUDED.category,
  entity_scopes = EXCLUDED.entity_scopes,
  requires_expiry = EXCLUDED.requires_expiry,
  requires_manager_approval = EXCLUDED.requires_manager_approval,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  max_file_bytes = EXCLUDED.max_file_bytes,
  allow_multiple = EXCLUDED.allow_multiple,
  storage_folder = EXCLUDED.storage_folder,
  message_template_he = EXCLUDED.message_template_he,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMENT ON TABLE public.document_type_defs IS 'Catalog of document types — add rows to extend without code changes';
COMMENT ON TABLE public.document_requests IS 'Universal document request hub (entity_type + entity_id)';
COMMENT ON TABLE public.document_versions IS 'Immutable version history — do not delete prior versions in normal flow';
