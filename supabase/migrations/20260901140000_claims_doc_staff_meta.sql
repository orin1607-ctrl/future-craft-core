-- Staging only. Internal staff note on imported mail. Does not change Gmail mailbox.
ALTER TABLE public.claims_gmail_imports
  ADD COLUMN IF NOT EXISTS staff_note text;
