
-- ============ Expand vehicles table for 14-category card ============

-- Category 1: Vehicle details
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vin TEXT,
  ADD COLUMN IF NOT EXISTS engine_number TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS usage_type TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS ownership_type TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_manager TEXT,
  ADD COLUMN IF NOT EXISTS current_location TEXT,
  ADD COLUMN IF NOT EXISTS work_site TEXT,
  ADD COLUMN IF NOT EXISTS road_entry_date DATE,
  ADD COLUMN IF NOT EXISTS sale_date DATE;

-- Category 2: Ownership / leasing / finance
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS finance_track TEXT,
  ADD COLUMN IF NOT EXISTS finance_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS loan_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_loan BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pledged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pledge_details JSONB DEFAULT '{}'::jsonb;

-- Category 3: Insurance & licensing (JSONB to keep flexible)
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS insurances JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inspections_certificates JSONB DEFAULT '{}'::jsonb;

-- Category 4: Special equipment
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS equipment_type TEXT,
  ADD COLUMN IF NOT EXISTS equipment_details TEXT,
  ADD COLUMN IF NOT EXISTS horsepower NUMERIC,
  ADD COLUMN IF NOT EXISTS engine_volume NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_tons NUMERIC,
  ADD COLUMN IF NOT EXISTS kva NUMERIC,
  ADD COLUMN IF NOT EXISTS engine_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS equipment_serial TEXT;

-- Category 5: Maintenance & treatments
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS meter_type TEXT,
  ADD COLUMN IF NOT EXISTS meter_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_service_date DATE,
  ADD COLUMN IF NOT EXISTS next_service_date DATE,
  ADD COLUMN IF NOT EXISTS next_service_km INTEGER,
  ADD COLUMN IF NOT EXISTS next_service_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS service_status TEXT,
  ADD COLUMN IF NOT EXISTS service_notes TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_method TEXT,
  ADD COLUMN IF NOT EXISTS maintenance_details JSONB DEFAULT '{}'::jsonb;

-- Category 14: Import / system info
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS import_source TEXT,
  ADD COLUMN IF NOT EXISTS import_category TEXT,
  ADD COLUMN IF NOT EXISTS import_buffer TEXT,
  ADD COLUMN IF NOT EXISTS import_file_name TEXT,
  ADD COLUMN IF NOT EXISTS import_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID,
  ADD COLUMN IF NOT EXISTS import_status TEXT;

-- ============ Departments table (per company) ============
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_name, name)
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select" ON public.departments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR company_name = public.get_user_company(auth.uid())
  );

DROP POLICY IF EXISTS "departments_insert" ON public.departments;
CREATE POLICY "departments_insert" ON public.departments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  );

DROP POLICY IF EXISTS "departments_update" ON public.departments;
CREATE POLICY "departments_update" ON public.departments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  );

DROP POLICY IF EXISTS "departments_delete" ON public.departments;
CREATE POLICY "departments_delete" ON public.departments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid())
    )
  );

DROP TRIGGER IF EXISTS update_departments_updated_at ON public.departments;
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
