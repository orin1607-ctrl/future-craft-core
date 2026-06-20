/**
 * Verify Google APIs after OAuth — probes each service.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PATHS, resolveCredentialsPath, resolveTokenPath } from './_lib/paths.mjs';
import { getAuthenticatedClient, probeGoogleApis } from './_lib/auth.mjs';

if (!existsSync(resolveCredentialsPath()) || !existsSync(resolveTokenPath())) {
  console.error('Not connected. Run: npm run google:auth');
  process.exit(1);
}

const auth = await getAuthenticatedClient();
const probes = await probeGoogleApis(auth);

const report = {
  at: new Date().toISOString(),
  connected: true,
  probes,
  summary: {
    ok: Object.entries(probes).filter(([, v]) => v.ok).map(([k]) => k),
    failed: Object.entries(probes).filter(([, v]) => !v.ok).map(([k, v]) => ({ service: k, error: v.error })),
  },
};

mkdirSync(PATHS.auditOut, { recursive: true });
writeFileSync(join(PATHS.auditOut, 'connection-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
