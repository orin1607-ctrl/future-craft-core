-- Migration: 20261025120000_garage_quote_drafts_staging.sql
-- Status: APPLIED TO STAGING ONLY (usfeoerkpcafxxlyuldl) on 2026-10-25 with the user's approval, after 17 isolation tests (rolled back). NOT for Production.
--
-- Price quotes that are not tied to a work case: a quote for a customer who is not in the system yet
-- (or a separate quote for an existing customer), waiting for the customer's approval.
-- * Additive only: a new table; no existing table, column, policy or row is changed.
-- * Shop-scoped exactly like garage_orders (garage_shop_visible), delete only for super_admin.
-- * customer / vehicle / case are optional links (SET NULL on delete) — no active customer is required.
-- Rollback: 20261025120000_garage_quote_drafts_staging_rollback.sql

CREATE TABLE IF NOT EXISTS public.garage_quote_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_company_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'converted', 'cancelled')),
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  customer_id uuid REFERENCES public.garage_customers(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.garage_vehicles(id) ON DELETE SET NULL,
  vehicle_plate text NOT NULL DEFAULT '',
  case_id uuid REFERENCES public.garage_cases(id) ON DELETE SET NULL,
  -- vehicle make/model/year, works, parts (name, qty, price before VAT), extras note, total before VAT
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_by_name text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garage_quote_drafts_shop_status ON public.garage_quote_drafts(shop_company_name, status);
CREATE INDEX IF NOT EXISTS idx_garage_quote_drafts_plate ON public.garage_quote_drafts(vehicle_plate);
CREATE INDEX IF NOT EXISTS idx_garage_quote_drafts_customer ON public.garage_quote_drafts(customer_id);

ALTER TABLE public.garage_quote_drafts ENABLE ROW LEVEL SECURITY;

-- Least privilege (STAGING's default privileges give anon/authenticated ALL incl. TRUNCATE, which RLS does
-- not cover): the public key gets nothing; signed-in users only the four row operations RLS governs.
REVOKE ALL ON TABLE public.garage_quote_drafts FROM anon;
REVOKE ALL ON TABLE public.garage_quote_drafts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.garage_quote_drafts TO authenticated;

DROP POLICY IF EXISTS "garage_quote_drafts_select_shop" ON public.garage_quote_drafts;
DROP POLICY IF EXISTS "garage_quote_drafts_insert_shop" ON public.garage_quote_drafts;
DROP POLICY IF EXISTS "garage_quote_drafts_update_shop" ON public.garage_quote_drafts;
DROP POLICY IF EXISTS "garage_quote_drafts_delete_super_admin" ON public.garage_quote_drafts;

CREATE POLICY "garage_quote_drafts_select_shop" ON public.garage_quote_drafts
  FOR SELECT TO authenticated
  USING (public.garage_shop_visible(shop_company_name));

CREATE POLICY "garage_quote_drafts_insert_shop" ON public.garage_quote_drafts
  FOR INSERT TO authenticated
  WITH CHECK (public.garage_shop_visible(shop_company_name));

CREATE POLICY "garage_quote_drafts_update_shop" ON public.garage_quote_drafts
  FOR UPDATE TO authenticated
  USING (public.garage_shop_visible(shop_company_name))
  WITH CHECK (public.garage_shop_visible(shop_company_name));

CREATE POLICY "garage_quote_drafts_delete_super_admin" ON public.garage_quote_drafts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
