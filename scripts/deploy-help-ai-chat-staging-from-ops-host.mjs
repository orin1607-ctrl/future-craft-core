/**
 * Deploy help-ai-chat to Staging only, using an ops-host access token.
 * The token stays on the ops host. This script never prints it and never
 * targets the production project.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGING = 'usfeoerkpcafxxlyuldl';
const PROD = 'qasomfndnjuixgjmjwcm';
if (STAGING === PROD) throw new Error('ABORT_PROD');

const statusPath = 'claims-ai-deploy-status.json';
if (existsSync(statusPath)) {
  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  if (status.function_deployed) {
    console.log(JSON.stringify({ skipped: true, reason: 'already_deployed_with_github_token' }));
    process.exit(0);
  }
}

const key = process.env.VPS_SSH_KEY || '';
const host = (process.env.VPS_HOST || '').trim();
const user = (process.env.VPS_USER || '').trim();
if (!key || !host || !user) {
  console.log(JSON.stringify({ ok: false, reason: 'missing_ops_ssh' }));
  process.exit(1);
}
if (host.includes(PROD) || user.includes(PROD)) {
  console.log(JSON.stringify({ ok: false, reason: 'ops_target_mentions_prod_ref' }));
  process.exit(1);
}

function redact(value) {
  return String(value || '')
    .replace(/sbp_[A-Za-z0-9]+/g, 'sbp_[redacted]')
    .replace(/eyJ[A-Za-z0-9_\-.]+/g, 'jwt_[redacted]')
    .replace(/postgres(?:ql)?:\/\/\S+/g, 'pg_[redacted]')
    .replace(/sk-[A-Za-z0-9_\-]+/g, 'sk_[redacted]');
}

const dir = mkdtempSync(join(tmpdir(), 'staging-help-ai-ssh-'));
const keyPath = join(dir, 'key');
writeFileSync(keyPath, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
chmodSync(keyPath, 0o600);
const sshBase = ['-i', keyPath, '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];

function run(cmd, args, input) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', input, timeout: 240000 });
  const stdout = redact(result.stdout);
  const stderr = redact(result.stderr);
  if (stdout.includes(`--project-ref ${PROD}`) || stderr.includes(`--project-ref ${PROD}`)) {
    throw new Error('ABORT_DEPLOY_TARGETED_PROD');
  }
  return { code: result.status ?? 1, stdout, stderr };
}

const remoteRoot = '/tmp/dalia-staging-help-ai-chat';
const prep = run('ssh', [...sshBase, `${user}@${host}`, `rm -rf ${remoteRoot} && mkdir -p ${remoteRoot}/supabase/functions`]);
if (prep.code !== 0) {
  console.log(JSON.stringify({ ok: false, step: 'mkdir', code: prep.code, stderr: prep.stderr.slice(0, 400) }));
  process.exit(1);
}

const copies = [
  ['supabase/functions/help-ai-chat', `${remoteRoot}/supabase/functions/`],
  ['supabase/functions/_shared', `${remoteRoot}/supabase/functions/`],
  ['supabase/config.toml', `${remoteRoot}/supabase/config.toml`],
  ['scripts/staging-help-ai-chat-remote-deploy.sh', `${remoteRoot}/deploy.sh`],
];
for (const [local, remote] of copies) {
  const copied = run('scp', ['-i', keyPath, '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-r', local, `${user}@${host}:${remote}`]);
  if (copied.code !== 0) {
    console.log(JSON.stringify({ ok: false, step: 'scp', local, code: copied.code, stderr: copied.stderr.slice(0, 400) }));
    process.exit(1);
  }
}

const deployed = run('ssh', [...sshBase, `${user}@${host}`, 'bash /tmp/dalia-staging-help-ai-chat/deploy.sh']);
console.log(JSON.stringify({
  ok: deployed.code === 0 && deployed.stdout.includes('STAGING_HELP_AI_CHAT_DEPLOYED'),
  code: deployed.code,
  stdout: deployed.stdout.slice(-4000),
  stderr: deployed.stderr.slice(-1000),
}, null, 2));
rmSync(dir, { recursive: true, force: true });
if (deployed.code !== 0 || !deployed.stdout.includes('STAGING_HELP_AI_CHAT_DEPLOYED')) process.exit(1);
