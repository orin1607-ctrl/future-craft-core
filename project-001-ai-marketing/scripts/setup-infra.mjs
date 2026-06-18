/**
 * Create Project 001 infrastructure via Google REST APIs (Sheets, Drive, Docs).
 * Uses clasp OAuth token from ~/.clasprc.json
 * Targets the sheets-bound Apps Script project (.clasp.json parentId).
 */
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
  {
    name: 'raw_gsc',
    headers: ['date', 'page', 'query', 'clicks', 'impressions', 'ctr', 'position', 'country', 'device', 'ingested_at'],
  },
  {
    name: 'raw_ga4',
    headers: ['date', 'page_path', 'sessions', 'users', 'pageviews', 'avg_engagement_sec', 'bounce_rate', 'conversions', 'source_medium', 'ingested_at'],
  },
  {
    name: 'site_pages',
    headers: ['url', 'title', 'h1', 'meta_description', 'word_count', 'internal_links_out', 'indexed', 'last_scanned_at'],
  },
  {
    name: 'keywords',
    headers: ['keyword', 'current_position', 'previous_position', 'delta', 'clicks', 'impressions', 'ctr', 'target_page', 'status', 'priority_score', 'updated_at'],
  },
  {
    name: 'pages',
    headers: ['url', 'page_type', 'sessions', 'conversions', 'avg_position', 'weakness_score', 'opportunity_score', 'recommended_action', 'updated_at'],
  },
  {
    name: 'competitors',
    headers: ['competitor_url', 'competitor_name', 'topics_found', 'content_gap', 'our_coverage', 'priority', 'last_analyzed_at'],
  },
  {
    name: 'opportunities',
    headers: ['id', 'type', 'title', 'description', 'keyword', 'target_url', 'priority_score', 'source', 'status', 'created_at'],
  },
  {
    name: 'content_queue',
    headers: ['id', 'status', 'content_type', 'seo_title', 'meta_description', 'article_doc_url', 'faq_doc_url', 'landing_doc_url', 'schema_json', 'internal_links_json', 'gbp_post_draft', 'gbp_audit_summary', 'priority_score', 'opportunity_id', 'created_at', 'ready_for_approval_at'],
  },
  {
    name: 'approvals',
    headers: ['id', 'content_queue_id', 'decision', 'decision_by', 'decision_at', 'rejection_reason', 'notes'],
  },
  {
    name: 'history',
    headers: ['id', 'content_queue_id', 'event_type', 'event_detail', 'actor', 'created_at'],
  },
  {
    name: 'learning_log',
    headers: ['id', 'content_queue_id', 'feedback_type', 'feedback_text', 'content_type', 'tags', 'applied_to_prompt', 'created_at'],
  },
  {
    name: 'gbp_audit',
    headers: ['audit_date', 'location_id', 'category_ok', 'services_ok', 'description_ok', 'photos_count', 'posts_count', 'reviews_unanswered', 'qa_unanswered', 'missing_fields_json', 'recommendations', 'status'],
  },
  {
    name: 'daily_reports',
    headers: ['report_date', 'report_doc_url', 'new_opportunities', 'keyword_changes', 'pending_approvals', 'approved_today', 'rejected_today', 'gbp_updates_suggested', 'email_sent', 'created_at'],
  },
];

const TEMPLATE_DEFS = [
  { key: 'article', title: 'TEMPLATE — Article', sections: ['SEO Title', 'Meta Description', 'H1', 'Introduction', 'Body', 'Internal Links', 'Schema JSON-LD', 'CTA'] },
  { key: 'faq', title: 'TEMPLATE — FAQ', sections: ['Page Title', 'Meta Description', 'Q&A Pairs', 'Schema FAQPage JSON-LD'] },
  { key: 'landing', title: 'TEMPLATE — Landing Page', sections: ['SEO Title', 'Meta Description', 'Hero', 'Benefits', 'Social Proof', 'FAQ', 'CTA', 'Schema'] },
  { key: 'gbp_post', title: 'TEMPLATE — GBP Post', sections: ['Post Title', 'Post Body', 'CTA Button', 'Suggested Image Notes', 'Publish Notes'] },
  { key: 'video_script', title: 'TEMPLATE — Video Script', sections: ['Hook (0-3s)', 'Problem', 'Solution', 'Proof', 'CTA', 'B-Roll Notes', 'Duration Target'] },
];

async function getAccessToken() {
  const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
  const t = rc.tokens?.default;
  if (!t?.access_token) throw new Error('Run: npx clasp login');
  return t.access_token;
}

async function api(token, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function ensureSpreadsheetTabs(token, spreadsheetId) {
  const ss = await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`);
  const existing = new Map(ss.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const requests = [];

  for (const tab of TAB_DEFS) {
    if (!existing.has(tab.name)) {
      if (tab.name === 'config' && existing.has('Sheet1')) {
        requests.push({
          updateSheetProperties: {
            properties: { sheetId: existing.get('Sheet1'), title: 'config' },
            fields: 'title',
          },
        });
        existing.set('config', existing.get('Sheet1'));
        existing.delete('Sheet1');
      } else {
        requests.push({ addSheet: { properties: { title: tab.name } } });
      }
    }
  }

  if (requests.length) {
    await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }

  const ss2 = await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`);
  const sheetMap = new Map(ss2.sheets.map((s) => [s.properties.title, s.properties.sheetId]));

  const formatRequests = TAB_DEFS.map((tab) => ({
    repeatCell: {
      range: {
        sheetId: sheetMap.get(tab.name),
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: tab.headers.length,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold',
    },
  }));

  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: formatRequests }),
  });

  for (const tab of TAB_DEFS) {
    const range = `${tab.name}!A1`;
    await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [tab.headers] }),
    });
  }
}

async function findFolder(token, name, parentId) {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await api(token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
  return res.files?.[0] || null;
}

async function createFolder(token, name, parentId) {
  const found = await findFolder(token, name, parentId);
  if (found) return found;
  const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  return api(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify(meta),
  });
}

async function createDoc(token, title, parentId) {
  const doc = await api(token, 'https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
  if (parentId) {
    await api(token, `https://www.googleapis.com/drive/v3/files/${doc.documentId}?addParents=${parentId}&removeParents=root`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }
  return doc;
}

async function addDocSections(token, docId, title, sections) {
  const requests = [
    { insertText: { location: { index: 1 }, text: `${title}\n\n` } },
    { updateParagraphStyle: { range: { startIndex: 1, endIndex: title.length + 1 }, paragraphStyle: { namedStyleType: 'HEADING_1' }, fields: 'namedStyleType' } },
    { insertText: { location: { index: title.length + 3 }, text: 'Project 001 — AI Marketing. Replace placeholders before approval.\n\n' } },
  ];
  let idx = title.length + 3 + 55;
  for (const s of sections) {
    requests.push({ insertText: { location: { index: idx }, text: `${s}\n[CONTENT]\n\n` } });
    idx += s.length + 12;
  }
  await api(token, `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

async function main() {
  const token = await getAccessToken();

  console.log('Ensuring spreadsheet tabs...');
  await ensureSpreadsheetTabs(token, SPREADSHEET_ID);

  console.log('Creating Drive folders...');
  const root = await createFolder(token, 'AI-Marketing', null);
  const folderIds = {};
  for (const name of ['drafts', 'reports', 'assets', 'competitors', 'published']) {
    folderIds[name] = (await createFolder(token, name, root.id)).id;
  }
  const templatesFolder = (await createFolder(token, 'templates', root.id)).id;

  console.log('Creating Doc templates...');
  const templates = {};
  for (const d of TEMPLATE_DEFS) {
    const doc = await createDoc(token, d.title, templatesFolder);
    await addDocSections(token, doc.documentId, d.title, d.sections);
    templates[d.key] = {
      name: d.title,
      docId: doc.documentId,
      url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
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
  for (const [k, v] of Object.entries(folderIds)) {
    configRows.push([`drive_${k}_id`, v, '', now]);
  }
  for (const [k, v] of Object.entries(templates)) {
    configRows.push([`template_${k}_url`, v.url, v.name, now]);
  }

  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/config!A2?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: configRows }),
  });

  const result = {
    ok: true,
    appsScript: { id: SCRIPT_ID, url: SCRIPT_URL },
    spreadsheet: { id: SPREADSHEET_ID, url: SPREADSHEET_URL },
    driveRoot: { id: root.id, url: `https://drive.google.com/drive/folders/${root.id}` },
    folders: folderIds,
    templates,
    verifiedAt: now,
  };

  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
