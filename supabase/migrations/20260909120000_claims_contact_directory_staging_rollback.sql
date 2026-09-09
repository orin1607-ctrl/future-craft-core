-- Staging ONLY rollback for claims contact directory.
-- Drops only the three new tables. Does not touch existing claims_records row_data,
-- Gmail, SEND, Auth, Storage, or Production.

DROP TABLE IF EXISTS public.claims_claim_contacts CASCADE;
DROP TABLE IF EXISTS public.claims_contact_channels CASCADE;
DROP TABLE IF EXISTS public.claims_contacts CASCADE;
