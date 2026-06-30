#!/usr/bin/env node
/**
 * Scaffolds a TEMP standalone preview repo for a client site.
 * Usage:
 *   node scripts/scaffold-client-preview-repo.mjs --out ../temp-client-preview --client dalia-c-official
 */
import { mkdirSync, writeFileSync, existsSync, cpSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function getArg(name, fallback = '') {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] || fallback;
}

const outArg = getArg('--out', '../temp-client-preview');
const clientSlug = getArg('--client', 'dalia-c-official');
const outDir = resolve(ROOT, outArg);
const srcDir = join(ROOT, 'public', 'client-previews', clientSlug);

if (!existsSync(srcDir)) {
  console.error(JSON.stringify({ ok: false, error: 'missing_source_preview', srcDir }, null, 2));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
cpSync(srcDir, outDir, { recursive: true });

const readme = `# TEMP Client Preview Repo

Client: ${clientSlug}
Created at: ${new Date().toISOString()}

## Important
- This is a TEMP preview repo only.
- Do not host client production site inside Dalia platform.
- After client approval, move to client-owned repo + domain + hosting.

## Suggested Next Steps
1. Push this repo to a temporary GitHub repo.
2. Enable GitHub Pages for client review.
3. Collect notes and approvals.
4. Create production repo under client ownership and migrate.
`;
writeFileSync(join(outDir, 'README.md'), readme, 'utf8');

const metadata = {
  temp: true,
  clientSlug,
  source: srcDir,
  createdAt: new Date().toISOString(),
  architecture: {
    platformStoresOnly: ['clientName', 'previewUrl', 'productionUrl', 'repo', 'commit', 'status'],
    hostOnDaliaLongTerm: false,
  },
};
writeFileSync(join(outDir, 'preview-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

console.log(JSON.stringify({ ok: true, outDir, clientSlug, filesCopiedFrom: srcDir }, null, 2));
