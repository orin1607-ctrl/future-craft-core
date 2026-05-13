ALTER TABLE public.fault_referrals ADD COLUMN IF NOT EXISTS service_order_id uuid;
ALTER TABLE public.fault_referrals ALTER COLUMN fault_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fault_referrals_service_order ON public.fault_referrals(service_order_id);