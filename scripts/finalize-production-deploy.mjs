/**
 * Finalize production deploy or rollback in deploy_runs.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const action = arg('--action', 'deploy');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

if (action === 'rollback') {
  const { error } = await admin.from('deploy_runs').insert({
    status: 'rolled_back',
    commit_sha: 'rollback',
    commit_message: `Rollback via workflow ${arg('--workflow-run')}`,
    branch: 'main',
    backup_path: arg('--backup') || null,
    github_run_id: arg('--workflow-run'),
    github_workflow: 'rollback-production-vps',
    tests: {},
    report: { action: 'rollback' },
  });
  if (error) console.error(error.message);
  else console.log(JSON.stringify({ ok: true, action: 'rollback' }));
  process.exit(error ? 1 : 0);
}

const deployRunId = arg('--deploy-run-id');
const reportPath = arg('--report');
let tests = {};
if (reportPath && existsSync(reportPath)) {
  tests = JSON.parse(readFileSync(reportPath, 'utf8'));
}

const payload = {
  status: tests.passed === false ? 'deploy_failed' : 'production_live',
  production_bundle: arg('--bundle'),
  backup_path: arg('--backup'),
  github_run_id: arg('--workflow-run'),
  github_workflow: 'deploy-production-vps',
  tests,
  error_message: tests.passed === false ? (tests.failures || []).join('; ') : null,
  updated_at: new Date().toISOString(),
};

if (deployRunId) {
  const { error } = await admin.from('deploy_runs').update(payload).eq('id', deployRunId);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  const { error } = await admin.from('deploy_runs').insert({
    ...payload,
    commit_sha: arg('--commit'),
    branch: 'main',
    changed_files: [],
    changed_screens: [],
    report: {},
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

console.log(JSON.stringify({ ok: true, status: payload.status }));
