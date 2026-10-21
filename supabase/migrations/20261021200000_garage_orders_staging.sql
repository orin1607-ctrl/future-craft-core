-- Migration: 20261021200000_garage_orders_staging.sql
-- Description: Adds garage_orders table for full lifecycle tracking of customer work orders in Garage Management

CREATE TABLE IF NOT EXISTS public.garage_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.garage_cases(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.garage_customers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.garage_vehicles(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  case_ref text DEFAULT '',
  order_date text DEFAULT '',
  approved_amount numeric(12, 2) DEFAULT 0,
  contact_name text DEFAULT '',
  driver_name text DEFAULT '',
  description text DEFAULT '',
  special_instructions text DEFAULT '',
  approval_reference text DEFAULT '',
  status text NOT NULL DEFAULT 'received',
  -- status values: 'received' (התקבלה), 'waiting_quote' (ממתין להצעת מחיר), 'quote_in_progress' (הצעה בהכנה),
  -- 'quote_sent' (הצעה נשלחה), 'waiting_approval' (ממתין לאישור לקוח), 'approved' (אושר לביצוע),
  -- 'in_progress' (עבודה בביצוע), 'done' (העבודה הסתיימה), 'closed' (סגור),
  -- 'missing_info' (ממתין להשלמת פרטים), 'rejected' (נדחתה), 'cancelled' (בוטלה)
  media_id uuid REFERENCES public.garage_media(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  shop_company_name text DEFAULT '',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries by order number, case, customer, and vehicle
CREATE INDEX IF NOT EXISTS idx_garage_orders_order_number ON public.garage_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_garage_orders_case_id ON public.garage_orders(case_id);
CREATE INDEX IF NOT EXISTS idx_garage_orders_customer_id ON public.garage_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_garage_orders_vehicle_id ON public.garage_orders(vehicle_id);

-- Enable RLS
ALTER TABLE public.garage_orders ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped RLS policies for authenticated garage users
DROP POLICY IF EXISTS "garage_orders_all_access" ON public.garage_orders;
DROP POLICY IF EXISTS "garage_orders_select_shop" ON public.garage_orders;
DROP POLICY IF EXISTS "garage_orders_insert_shop" ON public.garage_orders;
DROP POLICY IF EXISTS "garage_orders_update_shop" ON public.garage_orders;
DROP POLICY IF EXISTS "garage_orders_delete_super_admin" ON public.garage_orders;

CREATE POLICY "garage_orders_delete_super_admin" ON public.garage_orders
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "garage_cases_delete_super_admin" ON public.garage_cases;
CREATE POLICY "garage_cases_delete_super_admin" ON public.garage_cases
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "garage_vehicles_delete_super_admin" ON public.garage_vehicles;
CREATE POLICY "garage_vehicles_delete_super_admin" ON public.garage_vehicles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "garage_customers_delete_super_admin" ON public.garage_customers;
CREATE POLICY "garage_customers_delete_super_admin" ON public.garage_customers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "garage_media_delete_super_admin" ON public.garage_media;
CREATE POLICY "garage_media_delete_super_admin" ON public.garage_media
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "garage_orders_select_shop" ON public.garage_orders
  FOR SELECT TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
    OR (case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_orders.case_id AND public.garage_shop_visible(gc.shop_company_name)
    ))
  );

CREATE POLICY "garage_orders_insert_shop" ON public.garage_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
    OR (case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_orders.case_id AND public.garage_shop_visible(gc.shop_company_name)
    ))
  );

CREATE POLICY "garage_orders_update_shop" ON public.garage_orders
  FOR UPDATE TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
    OR (case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_orders.case_id AND public.garage_shop_visible(gc.shop_company_name)
    ))
  )
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
    OR (case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_orders.case_id AND public.garage_shop_visible(gc.shop_company_name)
    ))
  );

-- Expand garage_cases_status_check to support full AI + UI workflow statuses
ALTER TABLE public.garage_cases DROP CONSTRAINT IF EXISTS garage_cases_status_check;
ALTER TABLE public.garage_cases ADD CONSTRAINT garage_cases_status_check CHECK (
  status = ANY (ARRAY[
    'בדיקת רכב'::text,
    'הצעה בהכנה'::text,
    'הצעה נשלחה'::text,
    'ממתין לאישור'::text,
    'אושר'::text,
    'אושר לביצוע'::text,
    'ממתין לעבודה'::text,
    'הרכב התקבל'::text,
    'עבודה התחילה'::text,
    'בעבודה'::text,
    'עבודה הסתיימה'::text,
    'מוכן למסירה'::text,
    'סגור'::text,
    'תיק סגור'::text
  ])
);
