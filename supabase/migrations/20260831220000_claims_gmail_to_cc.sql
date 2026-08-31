-- Staging ONLY. Claims Gmail To/CC on existing import rows. No Production.
ALTER TABLE public.claims_gmail_imports
  ADD COLUMN IF NOT EXISTS to_addr text,
  ADD COLUMN IF NOT EXISTS cc_addr text;
