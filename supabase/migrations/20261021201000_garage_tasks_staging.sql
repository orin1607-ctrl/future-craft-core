-- Migration: 20261021201000_garage_tasks_staging.sql
-- Description: Adds garage_tasks table for task management in Garage Management

CREATE TABLE IF NOT EXISTS public.garage_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.garage_cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date text,
  priority text DEFAULT 'normal',
  assigned_to text,
  status text DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garage_tasks_case_id ON public.garage_tasks(case_id);

ALTER TABLE public.garage_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garage_tasks_all_access" ON public.garage_tasks;
DROP POLICY IF EXISTS "garage_tasks_select_shop" ON public.garage_tasks;
DROP POLICY IF EXISTS "garage_tasks_insert_shop" ON public.garage_tasks;
DROP POLICY IF EXISTS "garage_tasks_update_shop" ON public.garage_tasks;
DROP POLICY IF EXISTS "garage_tasks_delete_super_admin" ON public.garage_tasks;

CREATE POLICY "garage_tasks_delete_super_admin" ON public.garage_tasks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "garage_tasks_select_shop" ON public.garage_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_tasks.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

CREATE POLICY "garage_tasks_insert_shop" ON public.garage_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_tasks.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  );

CREATE POLICY "garage_tasks_update_shop" ON public.garage_tasks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_tasks.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_tasks.case_id AND public.garage_shop_visible(gc.shop_company_name)
    )
  );
