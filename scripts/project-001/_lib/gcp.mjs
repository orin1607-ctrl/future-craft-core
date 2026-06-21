import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const GCP_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'integrations', 'project-001', 'gcp.json');

export function loadGcpConfig() {
  if (!existsSync(GCP_PATH)) return { project_name: 'My First Project', project_id: 'burnished-craft-466809-v1' };
  return JSON.parse(readFileSync(GCP_PATH, 'utf8'));
}

export function resolveProjectId() {
  const cfg = loadGcpConfig();
  const fromEnv = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  const id = String(fromEnv || cfg.project_id || '').trim();
  if (!id) return { id: null, cfg, source: 'missing' };
  return { id, cfg, source: fromEnv ? 'env' : 'gcp.json' };
}

export function requireProjectId() {
  const resolved = resolveProjectId();
  if (!resolved.id) {
    console.error('\n❌ Missing GCP project_id for Project001AIMarketing');
    console.error('Set integrations/project-001/gcp.json → project_id: "burnished-craft-466809-v1"');
    console.error('Or run: npm run project-001:migrate\n');
    process.exit(1);
  }
  return resolved;
}

export function consoleUrl(template, projectId) {
  return String(template).replace(/PROJECT_ID/g, projectId || 'PROJECT_ID');
}

export const REQUIRED_APIS = [
  { id: 'searchconsole.googleapis.com', name: 'Google Search Console API' },
  { id: 'analyticsdata.googleapis.com', name: 'Google Analytics Data API' },
  { id: 'analyticsadmin.googleapis.com', name: 'Google Analytics Admin API' },
  { id: 'sheets.googleapis.com', name: 'Google Sheets API' },
  { id: 'drive.googleapis.com', name: 'Google Drive API' },
  { id: 'docs.googleapis.com', name: 'Google Docs API' },
  { id: 'gmail.googleapis.com', name: 'Gmail API' },
  { id: 'script.googleapis.com', name: 'Google Apps Script API' },
  { id: 'siteverification.googleapis.com', name: 'Google Site Verification API' },
  { id: 'mybusinessaccountmanagement.googleapis.com', name: 'My Business Account Management API' },
  { id: 'mybusinessbusinessinformation.googleapis.com', name: 'My Business Business Information API' },
  { id: 'businessprofileperformance.googleapis.com', name: 'Business Profile Performance API' },
  { id: 'mybusinessbusinesscalls.googleapis.com', name: 'My Business Business Calls API' },
  { id: 'mybusinessqanda.googleapis.com', name: 'My Business Q&A API' },
  { id: 'googleads.googleapis.com', name: 'Google Ads API' },
];
