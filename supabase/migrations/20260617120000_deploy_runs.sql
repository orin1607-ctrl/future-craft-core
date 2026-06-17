-- Deploy pipeline tracking (staging → preview → production)
CREATE TABLE IF NOT EXISTS public.deploy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  commit_sha text NOT NULL,
  commit_message text,
  branch text NOT NULL DEFAULT 'main',
  staging_url text NOT NULL DEFAULT 'https://orin1607-ctrl.github.io/future-craft-core/',
  preview_url text,
  production_url text NOT NULL DEFAULT 'https://dalia-car.online',
  staging_bundle text,
  preview_bundle text,
  production_bundle text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'building', 'tests_running', 'tests_passed', 'tests_failed',
      'preview_ready', 'awaiting_approval', 'deploying', 'production_live',
      'deploy_failed', 'rolled_back'
    )),
  tests jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_screens jsonb NOT NULL DEFAULT '[]'::jsonb,
  deployed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deployed_by_email text,
  backup_path text,
  previous_production_bundle text,
  github_run_id text,
  github_workflow text,
  error_message text,
  report jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS deploy_runs_created_at_idx ON public.deploy_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS deploy_runs_commit_sha_idx ON public.deploy_runs (commit_sha);
CREATE INDEX IF NOT EXISTS deploy_runs_status_idx ON public.deploy_runs (status);

ALTER TABLE public.deploy_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY deploy_runs_super_admin_select ON public.deploy_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

CREATE POLICY deploy_runs_service_all ON public.deploy_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.deploy_runs IS 'CI/CD deploy history — staging, preview, production';
