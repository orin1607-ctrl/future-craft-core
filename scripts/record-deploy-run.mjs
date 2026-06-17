/**
 * Insert/update deploy_runs row (called from GitHub Actions with service role).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const commit = arg('--commit');
const message = arg('--message');
const bundle = arg('--bundle');
const previewUrl = arg('--preview-url');
const status = arg('--status', 'preview_ready');
const workflowRun = arg('--workflow-run');
const reportPath = arg('--report', 'reports/ci-smoke-preview.json');

let tests = {};
let changedFiles = [];
if (existsSync(reportPath)) {
  try {
    tests = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    /* ignore */
  }
}
if (existsSync('reports/changed-files.txt')) {
  changedFiles = readFileSync('reports/changed-files.txt', 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

const screens = changedFiles
  .filter((f) => f.startsWith('src/pages/') && (f.endsWith('.tsx') || f.endsWith('.ts')))
  .map((f) => f.replace('src/pages/', '').replace(/\.tsx?$/, ''));

const row = {
  commit_sha: commit,
  commit_message: message?.slice(0, 500) || null,
  branch: 'main',
  preview_url: previewUrl || null,
  preview_bundle: bundle || null,
  staging_bundle: null,
  status,
  tests,
  changed_files: changedFiles,
  changed_screens: screens,
  github_run_id: workflowRun || null,
  github_workflow: 'dalia-ci-preview',
  updated_at: new Date().toISOString(),
};

const { data, error } = await admin.from('deploy_runs').insert(row).select('id').single();
if (error) {
  const skip =
    error.message?.includes('deploy_runs') ||
    error.code === 'PGRST205' ||
    error.code === '42P01';
  if (skip) {
    console.warn(JSON.stringify({ ok: false, skipped: true, reason: error.message }));
    process.exit(0);
  }
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, id: data.id, status }, null, 2));
