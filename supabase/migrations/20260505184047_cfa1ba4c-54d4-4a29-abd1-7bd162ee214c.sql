ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS third_party_insurance_expiry date,
  ADD COLUMN IF NOT EXISTS third_party_insurance_doc_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_service_km integer,
  ADD COLUMN IF NOT EXISTS insurance_company text DEFAULT '',
  ADD COLUMN IF NOT EXISTS insurance_agent text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vehicle_images text DEFAULT '';