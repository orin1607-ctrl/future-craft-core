// scripts/backup-garage-staging-state.mjs
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'garage-ai-workflow-upgrade-20261021');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const admin = createClient(STAGING_URL, serviceKey);

const tables = [
  'garage_cases',
  'garage_customers',
  'garage_vehicles',
  'garage_quote_links',
  'garage_shop_settings'
];

async function run() {
  console.log(`Starting staging backup to ${BACKUP_DIR}...`);
  const manifest = {
    timestamp: new Date().toISOString(),
    gitCommit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
    gitTag: 'garage-ai-before-workflow-upgrade',
    tables: {}
  };

  for (const table of tables) {
    try {
      const { data, error, count } = await admin.from(table).select('*', { count: 'exact' });
      if (error) {
        console.warn(`Table ${table} read error:`, error.message);
        manifest.tables[table] = { status: 'error', error: error.message };
      } else {
        const filePath = path.join(BACKUP_DIR, `${table}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ Backed up ${table}: ${data.length} rows`);
        manifest.tables[table] = { status: 'ok', rowCount: data.length, file: `${table}.json` };
      }
    } catch (err) {
      console.error(`Failed to backup ${table}:`, err);
    }
  }

  fs.writeFileSync(path.join(BACKUP_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log('✅ Manifest saved. Staging backup complete.');
}

run().catch((e) => {
  console.error('Fatal backup error:', e);
  process.exit(1);
});
