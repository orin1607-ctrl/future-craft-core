-- PROPOSED ONLY. Do not run without explicit Owner approval.
-- Scope: FleetOS telematics (מצב צי). Staging only. No Production.
-- Rollback: see DROP block at the bottom.

-- 1. gps_devices
CREATE TABLE IF NOT EXISTS public.gps_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id text NOT NULL,
  imei text,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  company_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  p177 text NOT NULL DEFAULT '#EDT#,#EID#,#PDT#,#LAT#,#LONG#,#SPD#,#HEAD#,#ODO#,#LAC#,#CID#,#VIN#,#VBAT#',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gps_devices_unit_active_idx
  ON public.gps_devices (unit_id) WHERE enabled;
CREATE UNIQUE INDEX IF NOT EXISTS gps_devices_imei_active_idx
  ON public.gps_devices (imei) WHERE enabled AND imei IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gps_devices_vehicle_active_idx
  ON public.gps_devices (vehicle_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS gps_devices_company_idx ON public.gps_devices (company_name);

-- 2. gps_device_assignments (history)
CREATE TABLE IF NOT EXISTS public.gps_device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.gps_devices(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  company_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('assign', 'unassign', 'replace')),
  previous_vehicle_id uuid REFERENCES public.vehicles(id),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gps_device_assignments_company_idx
  ON public.gps_device_assignments (company_name, at DESC);

-- 3. gps_live (one row per device)
CREATE TABLE IF NOT EXISTS public.gps_live (
  device_id uuid PRIMARY KEY REFERENCES public.gps_devices(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  company_name text NOT NULL,
  unit_id text NOT NULL,
  imei text,
  last_seen timestamptz NOT NULL,
  last_seq text,
  last_cmd text,
  gps_at timestamptz,
  gps_age_sec integer,
  freshness text NOT NULL CHECK (freshness IN ('live', 'stale', 'none')),
  lat double precision,
  lng double precision,
  speed_knots double precision,
  speed_kmh double precision,
  heading double precision,
  ignition boolean,
  engine boolean,
  motion text CHECK (motion IS NULL OR motion IN ('driving', 'stopped')),
  odometer numeric,
  odometer_decision text,
  vehicle_voltage double precision,
  backup_voltage double precision,
  rpm double precision,
  engine_hours double precision,
  fuel double precision,
  driver_id_erm text,
  can_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gps_live_company_idx ON public.gps_live (company_name);
CREATE INDEX IF NOT EXISTS gps_live_vehicle_idx ON public.gps_live (vehicle_id);

-- 4. gps_positions (sampled history)
CREATE TABLE IF NOT EXISTS public.gps_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.gps_devices(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  company_name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed_kmh double precision,
  heading double precision,
  at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS gps_positions_vehicle_at_idx
  ON public.gps_positions (vehicle_id, at DESC);
CREATE INDEX IF NOT EXISTS gps_positions_company_idx ON public.gps_positions (company_name);

-- 5. gps_events
CREATE TABLE IF NOT EXISTS public.gps_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.gps_devices(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  company_name text NOT NULL,
  eid text NOT NULL,
  event_key text NOT NULL,
  label_he text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  at timestamptz NOT NULL,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS gps_events_company_at_idx
  ON public.gps_events (company_name, at DESC);
CREATE INDEX IF NOT EXISTS gps_events_vehicle_idx ON public.gps_events (vehicle_id, at DESC);

-- 6. gps_raw (short retention, debug)
CREATE TABLE IF NOT EXISTS public.gps_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.gps_devices(id),
  company_name text,
  at timestamptz NOT NULL DEFAULT now(),
  raw text NOT NULL,
  reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS gps_raw_at_idx ON public.gps_raw (at DESC);

-- 7. gps_can_maps
CREATE TABLE IF NOT EXISTS public.gps_can_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id),
  company_name text NOT NULL,
  make text,
  model text,
  cv_tag text NOT NULL,
  label_he text NOT NULL,
  UNIQUE (vehicle_id, cv_tag)
);
CREATE INDEX IF NOT EXISTS gps_can_maps_company_idx ON public.gps_can_maps (company_name);

ALTER TABLE public.gps_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_can_maps ENABLE ROW LEVEL SECURITY;

-- RLS uses existing Dalia helpers: public.get_user_company() / public.has_role().
-- Listener writes with service role (bypasses RLS). No policies on faults / accidents / expenses.
-- Authenticated users: SELECT live/history/events. Device bind writes: fleet_manager + company, or super_admin.

CREATE POLICY gps_devices_select ON public.gps_devices FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY gps_devices_write ON public.gps_devices FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY gps_assignments_select ON public.gps_device_assignments FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY gps_assignments_write ON public.gps_device_assignments FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY gps_live_select ON public.gps_live FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY gps_positions_select ON public.gps_positions FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY gps_events_select ON public.gps_events FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY gps_raw_select ON public.gps_raw FOR SELECT TO authenticated
  USING (
    company_name IS NULL
    OR company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY gps_can_maps_select ON public.gps_can_maps FOR SELECT TO authenticated
  USING (
    company_name = public.get_user_company(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY gps_can_maps_write ON public.gps_can_maps FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'fleet_manager'::app_role)
      AND company_name = public.get_user_company(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Existing tables NOT altered: vehicles, faults, accidents, expenses, service_orders.
-- vehicles.odometer is not written by this migration.

-- ROLLBACK (only after Owner approval to undo):
-- DROP TABLE IF EXISTS public.gps_raw CASCADE;
-- DROP TABLE IF EXISTS public.gps_events CASCADE;
-- DROP TABLE IF EXISTS public.gps_positions CASCADE;
-- DROP TABLE IF EXISTS public.gps_live CASCADE;
-- DROP TABLE IF EXISTS public.gps_can_maps CASCADE;
-- DROP TABLE IF EXISTS public.gps_device_assignments CASCADE;
-- DROP TABLE IF EXISTS public.gps_devices CASCADE;
