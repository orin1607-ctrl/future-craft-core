-- Marketing OS unified: leads, metrics cache, activity log (dalia-staging)
-- Single Client ID context across all hub modules

CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  source text DEFAULT '',
  channel text DEFAULT '',
  campaign text DEFAULT '',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost')),
  notes text DEFAULT '',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  provider text NOT NULL,
  metric_key text NOT NULL DEFAULT '',
  metric_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  period_start date,
  period_end date,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, provider, metric_key, period_start)
);

CREATE TABLE IF NOT EXISTS public.marketing_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  module text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  detail text DEFAULT '',
  actor_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_customer ON public.marketing_leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON public.marketing_leads(status);
CREATE INDEX IF NOT EXISTS idx_marketing_metrics_customer ON public.marketing_metrics(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_activity_customer ON public.marketing_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_activity_created ON public.marketing_activity_log(created_at DESC);

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_activity_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_leads', 'marketing_metrics', 'marketing_activity_log']
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

CREATE OR REPLACE FUNCTION public.marketing_touch_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_leads_updated ON public.marketing_leads;
CREATE TRIGGER trg_marketing_leads_updated
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_leads_updated_at();
