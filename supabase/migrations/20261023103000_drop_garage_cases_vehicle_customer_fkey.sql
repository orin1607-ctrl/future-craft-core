-- Migration: drop_garage_cases_vehicle_customer_fkey
-- Purpose: Remove anti-pattern composite foreign key (vehicle_id, customer_id)
--          that prevented vehicles from ever being transferred to a new owner or
--          serviced under a second customer when historical cases existed.
--          Table integrity is still fully preserved by:
--          1. garage_cases_customer_id_fkey: FOREIGN KEY (customer_id) REFERENCES garage_customers(id)
--          2. garage_cases_customer_shop_fkey: FOREIGN KEY (customer_id, shop_company_name) REFERENCES garage_customers(...)
--          3. garage_cases_vehicle_shop_fkey: FOREIGN KEY (vehicle_id, shop_company_name) REFERENCES garage_vehicles(...)
--          4. trigger garage_cases_apply_shop: verifies customer and vehicle exist and belong to the same shop.

ALTER TABLE public.garage_cases
  DROP CONSTRAINT IF EXISTS garage_cases_vehicle_customer_fkey;
