-- Project 001 — משימה 2: חברות ולקוחות (Single Source of Truth)
-- דליה customers = מקור האמת; טבלאות marketing_* = הרחבה שיווקית בלבד

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'fleet_only';

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_service_type_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_service_type_check
  CHECK (service_type IN ('fleet_only', 'marketing_only', 'fleet_and_marketing'));

COMMENT ON COLUMN public.customers.service_type IS
  'fleet_only | marketing_only | fleet_and_marketing — קובע אם נוצר כרטיס שיווק';

-- ─── פרופיל שיווק (לקוח אחד = שורה אחת) ───
CREATE TABLE IF NOT EXISTS public.marketing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  logo_url text DEFAULT '',
  theme_colors jsonb NOT NULL DEFAULT '{}'::jsonb,
  website text DEFAULT '',
  extra_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  setup_status text NOT NULL DEFAULT 'pending'
    CHECK (setup_status IN ('pending', 'provisioned', 'goals_ready')),
  provisioned_at timestamptz,
  synced_at timestamptz,
  dalia_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  contact_role text NOT NULL DEFAULT 'other',
  full_name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  domain text DEFAULT '',
  site_url text DEFAULT '',
  site_type text NOT NULL DEFAULT 'website'
    CHECK (site_type IN ('website', 'landing')),
  status text NOT NULL DEFAULT 'active',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  domain text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  dns_status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider)
);

CREATE TABLE IF NOT EXISTS public.marketing_api_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  label text DEFAULT '',
  provider text DEFAULT '',
  value_mask text DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  campaign_type text DEFAULT '',
  channel text DEFAULT '',
  budget numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  external_id text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_ai_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  opening_report text DEFAULT '',
  initial_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_profiles_customer ON public.marketing_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_customer ON public.marketing_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_sites_customer ON public.marketing_sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_customer ON public.marketing_campaigns(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_service_type ON public.customers(service_type);

-- RLS
ALTER TABLE public.marketing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_api_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ai_setup ENABLE ROW LEVEL SECURITY;

-- Helper: can access customer row
CREATE OR REPLACE FUNCTION public.marketing_can_access_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id
      AND (
        has_role(auth.uid(), 'super_admin'::app_role)
        OR (
          has_role(auth.uid(), 'fleet_manager'::app_role)
          AND c.company_name = get_user_company(auth.uid())
        )
      )
  );
$$;

-- Policies (all marketing_* tables)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_profiles', 'marketing_contacts', 'marketing_sites', 'marketing_domains',
    'marketing_connections', 'marketing_api_items', 'marketing_campaigns', 'marketing_ai_setup'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "marketing_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "marketing_all" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "marketing_select" ON public.%I FOR SELECT TO authenticated
       USING (public.marketing_can_access_customer(customer_id))', t);
    EXECUTE format(
      'CREATE POLICY "marketing_all" ON public.%I FOR ALL TO authenticated
       USING (public.marketing_can_access_customer(customer_id))
       WITH CHECK (public.marketing_can_access_customer(customer_id))', t);
  END LOOP;
END $$;

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.marketing_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_profiles_updated ON public.marketing_profiles;
CREATE TRIGGER trg_marketing_profiles_updated
  BEFORE UPDATE ON public.marketing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_connections_updated ON public.marketing_connections;
CREATE TRIGGER trg_marketing_connections_updated
  BEFORE UPDATE ON public.marketing_connections
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_marketing_ai_setup_updated ON public.marketing_ai_setup;
CREATE TRIGGER trg_marketing_ai_setup_updated
  BEFORE UPDATE ON public.marketing_ai_setup
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_updated_at();
