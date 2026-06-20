import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const P001 = {
  root: ROOT,
  dir: join(ROOT, 'integrations', 'project-001'),
  config: join(ROOT, 'integrations', 'project-001', 'config.json'),
  configExample: join(ROOT, 'integrations', 'project-001', 'config.example.json'),
  scopes: join(ROOT, 'integrations', 'project-001', 'scopes.json'),
  auditOut: join(ROOT, 'docs', 'audit-reports', 'project-001'),
  googleConfig: join(ROOT, 'integrations', 'google', 'config.json'),
};

export function loadP001Config() {
  const path = existsSync(P001.config) ? P001.config : P001.configExample;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadGoogleFolders() {
  if (!existsSync(P001.googleConfig)) return {};
  return JSON.parse(readFileSync(P001.googleConfig, 'utf8')).folders || {};
}
