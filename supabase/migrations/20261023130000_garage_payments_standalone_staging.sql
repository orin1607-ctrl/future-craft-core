-- Migration: 20261023130000_garage_payments_standalone_staging.sql
-- Description: Standalone garage_payments table for atomic, duplicate-free customer payment tracking
-- NOTE: THIS MIGRATION IS PREPARED FOR REVIEW ONLY AND HAS NOT BEEN EXECUTED ON STAGING.

CREATE TABLE IF NOT EXISTS public.garage_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.garage_cases(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.garage_customers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.garage_vehicles(id) ON DELETE SET NULL,
  receipt_number text,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  payment_method_label text DEFAULT '',
  reference text DEFAULT '',
  payer_name text DEFAULT '',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  idempotency_key text UNIQUE, -- Prevents duplicate payment submissions
  status text NOT NULL DEFAULT 'completed',
  notes text DEFAULT '',
  shop_company_name text DEFAULT '',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_garage_payments_case_id ON public.garage_payments(case_id);
CREATE INDEX IF NOT EXISTS idx_garage_payments_customer_id ON public.garage_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_garage_payments_vehicle_id ON public.garage_payments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_garage_payments_payment_date ON public.garage_payments(payment_date);

-- Enable RLS
ALTER TABLE public.garage_payments ENABLE ROW LEVEL SECURITY;

-- Tenant isolation RLS Policies
DROP POLICY IF EXISTS "garage_payments_select_shop" ON public.garage_payments;
DROP POLICY IF EXISTS "garage_payments_insert_shop" ON public.garage_payments;
DROP POLICY IF EXISTS "garage_payments_update_shop" ON public.garage_payments;
DROP POLICY IF EXISTS "garage_payments_delete_super_admin" ON public.garage_payments;

CREATE POLICY "garage_payments_select_shop" ON public.garage_payments
  FOR SELECT TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
    OR (case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_payments.case_id AND public.garage_shop_visible(gc.shop_company_name)
    ))
  );

CREATE POLICY "garage_payments_insert_shop" ON public.garage_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
    OR (case_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.garage_cases gc
      WHERE gc.id = garage_payments.case_id AND public.garage_shop_visible(gc.shop_company_name)
    ))
  );

CREATE POLICY "garage_payments_update_shop" ON public.garage_payments
  FOR UPDATE TO authenticated
  USING (
    public.garage_shop_visible(shop_company_name)
  )
  WITH CHECK (
    public.garage_shop_visible(shop_company_name)
  );

CREATE POLICY "garage_payments_delete_super_admin" ON public.garage_payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Backfill procedure (Deduplicated migration from garage_cases.case_data.payments)
-- (Run this procedure only after migration approval)
/*
DO $$
DECLARE
  r RECORD;
  p RECORD;
BEGIN
  FOR r IN SELECT id, customer_id, vehicle_id, shop_company_name, case_data FROM public.garage_cases WHERE case_data ? 'payments' AND jsonb_array_length(case_data->'payments') > 0 LOOP
    FOR p IN SELECT * FROM jsonb_to_recordset(r.case_data->'payments') AS (
      id text,
      amount numeric,
      payment_method text,
      payment_method_label text,
      reference text,
      payer_name text,
      payment_date text,
      notes text,
      created_at text
    ) LOOP
      IF p.amount IS NOT NULL AND p.amount > 0 THEN
        INSERT INTO public.garage_payments (
          case_id,
          customer_id,
          vehicle_id,
          amount,
          payment_method,
          payment_method_label,
          reference,
          payer_name,
          payment_date,
          idempotency_key,
          notes,
          shop_company_name,
          created_at
        ) VALUES (
          r.id,
          r.customer_id,
          r.vehicle_id,
          p.amount,
          COALESCE(p.payment_method, 'transfer'),
          COALESCE(p.payment_method_label, 'העברה בנקאית'),
          COALESCE(p.reference, ''),
          COALESCE(p.payer_name, ''),
          COALESCE(NULLIF(p.payment_date, '')::date, CURRENT_DATE),
          COALESCE(NULLIF(p.id, ''), gen_random_uuid()::text),
          COALESCE(p.notes, ''),
          COALESCE(r.shop_company_name, ''),
          COALESCE(NULLIF(p.created_at, '')::timestamptz, now())
        ) ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;
*/
