-- Dalia CRM module — leads, tasks, activity log, AI stub (no external keys)
-- customer_id = Client ID SSOT (public.customers.id)

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text DEFAULT '',
  source text NOT NULL DEFAULT 'form'
    CHECK (source IN (
      'google_ads', 'google_organic', 'google_business', 'facebook', 'instagram',
      'linkedin', 'whatsapp', 'form', 'call', 'referral', 'email', 'other'
    )),
  status text NOT NULL DEFAULT 'new_lead'
    CHECK (status IN ('new_lead', 'in_progress', 'quote', 'active', 'closed_won', 'closed_lost', 'on_hold')),
  score smallint NOT NULL DEFAULT 2 CHECK (score >= 1 AND score <= 3),
  service_type text DEFAULT 'marketing_only'
    CHECK (service_type IS NULL OR service_type IN ('fleet_only', 'marketing_only', 'fleet_and_marketing', 'undecided')),
  owner_name text DEFAULT '',
  campaign text DEFAULT '',
  landing_page text DEFAULT '',
  keyword text DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  assigned_to text DEFAULT '',
  ai_hint text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.crm_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  action_type text NOT NULL DEFAULT 'note'
    CHECK (action_type IN (
      'note', 'call', 'email', 'whatsapp', 'meeting', 'status_change',
      'lead_created', 'task_created', 'task_done', 'customer_linked', 'report', 'ai_insight'
    )),
  title text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_label text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  insight_type text NOT NULL DEFAULT 'daily_summary'
    CHECK (insight_type IN ('daily_summary', 'lead_score', 'task_priority', 'report_draft', 'agent_stub')),
  status text NOT NULL DEFAULT 'stub'
    CHECK (status IN ('stub', 'pending', 'ready', 'error')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_customer ON public.crm_leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON public.crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created ON public.crm_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer ON public.crm_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON public.crm_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON public.crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_crm_activity_customer ON public.crm_activity_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_activity_created ON public.crm_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_ai_customer ON public.crm_ai_insights(customer_id);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.crm_can_access_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = p_lead_id
      AND (
        has_role(auth.uid(), 'super_admin'::app_role)
        OR (
          has_role(auth.uid(), 'fleet_manager'::app_role)
          AND (
            l.company_name = get_user_company(auth.uid())
            OR (l.customer_id IS NOT NULL AND public.marketing_can_access_customer(l.customer_id))
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.crm_can_access_row(p_customer_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (p_customer_id IS NOT NULL AND public.marketing_can_access_customer(p_customer_id))
    OR (p_lead_id IS NOT NULL AND public.crm_can_access_lead(p_lead_id))
    OR has_role(auth.uid(), 'super_admin'::app_role);
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_leads', 'crm_tasks', 'crm_activity_log', 'crm_ai_insights']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "crm_select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "crm_all" ON public.%I', t);
    IF t = 'crm_leads' THEN
      EXECUTE format(
        'CREATE POLICY "crm_select" ON public.%I FOR SELECT TO authenticated
         USING (
           has_role(auth.uid(), ''super_admin''::app_role)
           OR (customer_id IS NOT NULL AND public.marketing_can_access_customer(customer_id))
           OR (has_role(auth.uid(), ''fleet_manager''::app_role) AND company_name = get_user_company(auth.uid()))
         )', t);
      EXECUTE format(
        'CREATE POLICY "crm_all" ON public.%I FOR ALL TO authenticated
         USING (
           has_role(auth.uid(), ''super_admin''::app_role)
           OR (customer_id IS NOT NULL AND public.marketing_can_access_customer(customer_id))
           OR (has_role(auth.uid(), ''fleet_manager''::app_role) AND company_name = get_user_company(auth.uid()))
         )
         WITH CHECK (
           has_role(auth.uid(), ''super_admin''::app_role)
           OR (customer_id IS NOT NULL AND public.marketing_can_access_customer(customer_id))
           OR (has_role(auth.uid(), ''fleet_manager''::app_role) AND company_name = get_user_company(auth.uid()))
         )', t);
    ELSE
      EXECUTE format(
        'CREATE POLICY "crm_select" ON public.%I FOR SELECT TO authenticated
         USING (public.crm_can_access_row(customer_id, lead_id))', t);
      EXECUTE format(
        'CREATE POLICY "crm_all" ON public.%I FOR ALL TO authenticated
         USING (public.crm_can_access_row(customer_id, lead_id))
         WITH CHECK (public.crm_can_access_row(customer_id, lead_id))', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_leads_updated ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_updated
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_tasks_updated ON public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_updated
  BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_ai_updated ON public.crm_ai_insights;
CREATE TRIGGER trg_crm_ai_updated
  BEFORE UPDATE ON public.crm_ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

COMMENT ON TABLE public.crm_leads IS 'CRM leads — linked to customers.id when converted';
COMMENT ON TABLE public.crm_tasks IS 'CRM tasks — per customer or lead';
COMMENT ON TABLE public.crm_activity_log IS 'CRM audit trail / history';
COMMENT ON TABLE public.crm_ai_insights IS 'AI infrastructure stub — no API keys until phase B';
