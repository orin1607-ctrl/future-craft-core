-- supabase/migrations/20261021235000_garage_suppliers_and_invoices_staging.sql
-- STAGING migration: Suppliers, Parts Invoices, General Expenses, Credit Notes & Case Closure Audit

CREATE TABLE IF NOT EXISTS public.garage_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_number TEXT,
  name TEXT NOT NULL,
  business_id TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  category TEXT DEFAULT 'general',
  notes TEXT,
  shop_company_name TEXT DEFAULT 'מוסך יוני – פחחות וצבע לרכב',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.garage_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_type TEXT NOT NULL DEFAULT 'parts_invoice',
  invoice_number TEXT NOT NULL,
  supplier_id UUID REFERENCES public.garage_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  case_id UUID REFERENCES public.garage_cases(id) ON DELETE SET NULL,
  case_number TEXT,
  vehicle_plate TEXT,
  expense_category TEXT DEFAULT 'parts',
  invoice_date DATE DEFAULT CURRENT_DATE,
  subtotal NUMERIC DEFAULT 0,
  vat_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  parts_received_confirmed BOOLEAN DEFAULT false,
  returned_parts_exist BOOLEAN DEFAULT false,
  returned_parts_notes TEXT,
  credit_status TEXT DEFAULT 'none',
  related_invoice_id UUID REFERENCES public.garage_invoices(id) ON DELETE SET NULL,
  payment_status TEXT DEFAULT 'pending_accounting',
  accounting_notes TEXT,
  media_url TEXT,
  line_items JSONB DEFAULT '[]'::jsonb,
  shop_company_name TEXT DEFAULT 'מוסך יוני – פחחות וצבע לרכב',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE public.garage_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'garage_suppliers' AND policyname = 'garage_suppliers_all'
  ) THEN
    CREATE POLICY garage_suppliers_all ON public.garage_suppliers
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'garage_invoices' AND policyname = 'garage_invoices_all'
  ) THEN
    CREATE POLICY garage_invoices_all ON public.garage_invoices
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
