/**
 * Project 001 infrastructure via Drive API only (no Sheets/Docs API required).
 * - Upload multi-tab XLSX to populate bound spreadsheet
 * - Create Drive folder tree
 * - Create Doc templates via Drive mimeType
 */
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'setup-result.json');
const CLASP = JSON.parse(readFileSync(join(__dirname, '..', '.clasp.json'), 'utf8'));
const SCRIPT_ID = CLASP.scriptId;
const SPREADSHEET_ID = CLASP.parentId;
const SCRIPT_URL = `https://script.google.com/d/${SCRIPT_ID}/edit`;
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;

const TAB_DEFS = [
  { name: 'config', headers: ['key', 'value', 'notes', 'updated_at'] },
  { name: 'raw_gsc', headers: ['date', 'page', 'query', 'clicks', 'impressions', 'ctr', 'position', 'country', 'device', 'ingested_at'] },
  { name: 'raw_ga4', headers: ['date', 'page_path', 'sessions', 'users', 'pageviews', 'avg_engagement_sec', 'bounce_rate', 'conversions', 'source_medium', 'ingested_at'] },
  { name: 'site_pages', headers: ['url', 'title', 'h1', 'meta_description', 'word_count', 'internal_links_out', 'indexed', 'last_scanned_at'] },
  { name: 'keywords', headers: ['keyword', 'current_position', 'previous_position', 'delta', 'clicks', 'impressions', 'ctr', 'target_page', 'status', 'priority_score', 'updated_at'] },
  { name: 'pages', headers: ['url', 'page_type', 'sessions', 'conversions', 'avg_position', 'weakness_score', 'opportunity_score', 'recommended_action', 'updated_at'] },
  { name: 'competitors', headers: ['competitor_url', 'competitor_name', 'topics_found', 'content_gap', 'our_coverage', 'priority', 'last_analyzed_at'] },
  { name: 'opportunities', headers: ['id', 'type', 'title', 'description', 'keyword', 'target_url', 'priority_score', 'source', 'status', 'created_at'] },
  { name: 'content_queue', headers: ['id', 'status', 'content_type', 'seo_title', 'meta_description', 'article_doc_url', 'faq_doc_url', 'landing_doc_url', 'schema_json', 'internal_links_json', 'gbp_post_draft', 'gbp_audit_summary', 'priority_score', 'opportunity_id', 'created_at', 'ready_for_approval_at'] },
  { name: 'approvals', headers: ['id', 'content_queue_id', 'decision', 'decision_by', 'decision_at', 'rejection_reason', 'notes'] },
  { name: 'history', headers: ['id', 'content_queue_id', 'event_type', 'event_detail', 'actor', 'created_at'] },
  { name: 'learning_log', headers: ['id', 'content_queue_id', 'feedback_type', 'feedback_text', 'content_type', 'tags', 'applied_to_prompt', 'created_at'] },
  { name: 'gbp_audit', headers: ['audit_date', 'location_id', 'category_ok', 'services_ok', 'description_ok', 'photos_count', 'posts_count', 'reviews_unanswered', 'qa_unanswered', 'missing_fields_json', 'recommendations', 'status'] },
  { name: 'daily_reports', headers: ['report_date', 'report_doc_url', 'new_opportunities', 'keyword_changes', 'pending_approvals', 'approved_today', 'rejected_today', 'gbp_updates_suggested', 'email_sent', 'created_at'] },
];

const TEMPLATE_DEFS = [
  { key: 'article', title: 'TEMPLATE — Article' },
  { key: 'faq', title: 'TEMPLATE — FAQ' },
  { key: 'landing', title: 'TEMPLATE — Landing Page' },
  { key: 'gbp_post', title: 'TEMPLATE — GBP Post' },
  { key: 'video_script', title: 'TEMPLATE — Video Script' },
];

function token() {
  const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const t = rc.tokens?.default?.access_token;
  if (!t) throw new Error('Run: npx clasp login');
  return t;
}

async function driveApi(path, opts = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token()}`, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(`Drive ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function findFolder(name, parentId) {
  const q = parentId
    ? `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveApi(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5`);
  return res.files?.[0] || null;
}

async function createFolder(name, parentId) {
  const found = await findFolder(name, parentId);
  if (found) return found;
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  return driveApi('/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function createDoc(title, parentId) {
  const body = { name: title, mimeType: 'application/vnd.google-apps.document' };
  if (parentId) body.parents = [parentId];
  return driveApi('/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function buildWorkbookBuffer(configRows) {
  const wb = new ExcelJS.Workbook();
  for (const tab of TAB_DEFS) {
    const ws = wb.addWorksheet(tab.name);
    ws.addRow(tab.headers);
    ws.getRow(1).font = { bold: true };
    if (tab.name === 'config' && configRows?.length) {
      for (const row of configRows) ws.addRow(row);
    }
  }
  return wb.xlsx.writeBuffer();
}

async function uploadSpreadsheet(xlsxBuffer) {
  const boundary = '-------p001boundary';
  const meta = JSON.stringify({ name: 'AI Marketing HQ — Project 001', mimeType: 'application/vnd.google-apps.spreadsheet' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    Buffer.from(xlsxBuffer),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const text = await created.text();
  if (!created.ok) throw new Error(`Upload spreadsheet failed: ${text}`);
  return JSON.parse(text);
}

async function replaceSpreadsheetContent(spreadsheetId, xlsxBuffer) {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${spreadsheetId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    body: xlsxBuffer,
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn('PATCH spreadsheet media failed, creating new spreadsheet instead:', text.slice(0, 200));
    return null;
  }
  return { id: spreadsheetId };
}

async function main() {
  console.log('Creating Drive folders...');
  const root = await createFolder('AI-Marketing', null);
  const folderIds = {};
  for (const name of ['drafts', 'reports', 'assets', 'competitors', 'published']) {
    folderIds[name] = (await createFolder(name, root.id)).id;
  }
  const templatesFolder = (await createFolder('templates', root.id)).id;

  console.log('Creating Doc templates...');
  const templates = {};
  for (const d of TEMPLATE_DEFS) {
    const doc = await createDoc(d.title, templatesFolder);
    templates[d.key] = {
      name: d.title,
      docId: doc.id,
      url: `https://docs.google.com/document/d/${doc.id}/edit`,
    };
  }

  const now = new Date().toISOString();
  const configRows = [
    ['project_name', 'Project 001 — AI SEO & Digital Marketing Manager', 'skeleton v0.1', now],
    ['spreadsheet_id', SPREADSHEET_ID, 'central HQ sheet', now],
    ['drive_root_id', root.id, 'AI-Marketing folder', now],
    ['apps_script_id', SCRIPT_ID, 'Apps Script project', now],
    ['apps_script_url', SCRIPT_URL, '', now],
    ['site_url', 'https://dalia-car.online', 'owner to confirm', now],
    ['gsc_property', '', 'fill after connect', now],
    ['ga4_property_id', '', 'fill after connect', now],
    ['gbp_location_id', '', 'fill after connect', now],
    ['skeleton_version', '0.1.0', 'infrastructure ready', now],
  ];
  for (const [k, v] of Object.entries(folderIds)) configRows.push([`drive_${k}_id`, v, '', now]);
  for (const [k, v] of Object.entries(templates)) configRows.push([`template_${k}_url`, v.url, v.name, now]);

  console.log('Building spreadsheet workbook...');
  const xlsx = await buildWorkbookBuffer(configRows);

  console.log('Uploading spreadsheet structure...');
  let spreadsheetId = SPREADSHEET_ID;
  const replaced = await replaceSpreadsheetContent(SPREADSHEET_ID, xlsx);
  if (!replaced) {
    const created = await uploadSpreadsheet(xlsx);
    spreadsheetId = created.id;
    console.warn('Created new spreadsheet:', spreadsheetId, '(update .clasp.json parentId manually if needed)');
  }

  const result = {
    ok: true,
    appsScript: { id: SCRIPT_ID, url: SCRIPT_URL },
    spreadsheet: { id: spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` },
    driveRoot: { id: root.id, url: `https://drive.google.com/drive/folders/${root.id}` },
    folders: folderIds,
    templates,
    verifiedAt: now,
    method: 'drive-api-only',
  };

  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
