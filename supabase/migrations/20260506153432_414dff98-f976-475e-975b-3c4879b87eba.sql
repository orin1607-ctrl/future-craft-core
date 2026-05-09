
-- Status tracking table for missing info gaps on vehicles and drivers
CREATE TABLE public.info_gap_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('vehicle','driver')),
  entity_id UUID NOT NULL,
  gap_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_treatment','resolved')),
  notes TEXT,
  company_name TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, gap_key)
);

CREATE TABLE public.info_gap_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_id UUID NOT NULL REFERENCES public.info_gap_tracking(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.info_gap_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_gap_history ENABLE ROW LEVEL SECURITY;

-- RLS: super_admin all, fleet_manager same company, others read own related
CREATE POLICY "tracking_select" ON public.info_gap_tracking FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (public.has_role(auth.uid(), 'fleet_manager') AND company_name = public.get_user_company(auth.uid()))
  OR company_name = public.get_user_company(auth.uid())
);
CREATE POLICY "tracking_insert" ON public.info_gap_tracking FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'fleet_manager')
);
CREATE POLICY "tracking_update" ON public.info_gap_tracking FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (public.has_role(auth.uid(), 'fleet_manager') AND company_name = public.get_user_company(auth.uid()))
);
CREATE POLICY "tracking_delete" ON public.info_gap_tracking FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "history_select" ON public.info_gap_history FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.info_gap_tracking t WHERE t.id = tracking_id AND (
    public.has_role(auth.uid(), 'super_admin')
    OR t.company_name = public.get_user_company(auth.uid())
  ))
);
CREATE POLICY "history_insert" ON public.info_gap_history FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'fleet_manager')
);

-- Auto-log status changes
CREATE OR REPLACE FUNCTION public.log_info_gap_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changer_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT full_name INTO changer_name FROM public.profiles WHERE id = NEW.updated_by;
    INSERT INTO public.info_gap_history (tracking_id, old_status, new_status, notes, changed_by, changed_by_name)
    VALUES (NEW.id, CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END, NEW.status, NEW.notes, NEW.updated_by, COALESCE(changer_name,'מערכת'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_info_gap_status_log
AFTER INSERT OR UPDATE ON public.info_gap_tracking
FOR EACH ROW EXECUTE FUNCTION public.log_info_gap_status_change();

CREATE TRIGGER trg_info_gap_updated_at
BEFORE UPDATE ON public.info_gap_tracking
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_info_gap_entity ON public.info_gap_tracking(entity_type, entity_id);
CREATE INDEX idx_info_gap_company ON public.info_gap_tracking(company_name);
CREATE INDEX idx_info_gap_history_tracking ON public.info_gap_history(tracking_id);
