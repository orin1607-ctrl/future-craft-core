/**
 * Project 001 — one-time skeleton setup.
 * Creates: central Sheet tabs, Drive folders, Doc templates.
 * Does NOT: pull data, call OpenAI, publish, touch Production.
 *
 * Run once: npm run setup  (after clasp login + clasp push)
 */
function createProjectSkeleton() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('SPREADSHEET_ID');
  if (existingId) {
    Logger.log('Skeleton already exists. Spreadsheet: ' + existingId);
    return summarize_(existingId);
  }

  let ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }
  if (ss) {
    const config = ss.getSheetByName('config');
    if (config && config.getLastRow() > 1) {
      const spreadsheetId = ss.getId();
      props.setProperty('SPREADSHEET_ID', spreadsheetId);
      const driveRoot = config.getRange(2, 1, config.getLastRow(), 2).getValues().find(function (row) {
        return row[0] === 'drive_root_id';
      });
      if (driveRoot && driveRoot[1]) {
        props.setProperty('DRIVE_ROOT_ID', driveRoot[1]);
      }
      Logger.log('Skeleton detected from config tab.');
      return summarize_(spreadsheetId);
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('AI Marketing HQ — Project 001');
  }

  const spreadsheetId = ss.getId();
  props.setProperty('SPREADSHEET_ID', spreadsheetId);

  const tabs = getTabDefinitions_();
  const existingNames = ss.getSheets().map(function (s) {
    return s.getName();
  });

  tabs.forEach(function (tab) {
    var sheet = ss.getSheetByName(tab.name);
    if (!sheet) {
      if (tab.name === 'config' && existingNames.length === 1 && existingNames[0] === 'Sheet1') {
        sheet = ss.getSheets()[0];
        sheet.setName('config');
      } else {
        sheet = ss.insertSheet(tab.name);
      }
    }
    if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === '') {
      writeHeaders_(sheet, tab.headers);
    }
  });

  const rootFolder = DriveApp.createFolder('AI-Marketing');
  props.setProperty('DRIVE_ROOT_ID', rootFolder.getId());

  const subfolders = ['drafts', 'reports', 'assets', 'competitors', 'published'];
  const folderIds = {};
  subfolders.forEach(function (name) {
    const folder = rootFolder.createFolder(name);
    folderIds[name] = folder.getId();
    props.setProperty('DRIVE_' + name.toUpperCase() + '_ID', folder.getId());
  });

  const templates = createDocTemplates_(rootFolder);
  props.setProperty('DOC_TEMPLATES_JSON', JSON.stringify(templates));

  writeConfig_(ss, spreadsheetId, rootFolder.getId(), folderIds, templates);

  Logger.log('Skeleton created successfully.');
  return summarize_(spreadsheetId);
}

function summarize_(spreadsheetId) {
  const props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit',
    driveRootId: props.getProperty('DRIVE_ROOT_ID'),
    driveRootUrl: 'https://drive.google.com/drive/folders/' + props.getProperty('DRIVE_ROOT_ID'),
    templates: JSON.parse(props.getProperty('DOC_TEMPLATES_JSON') || '{}'),
  };
}

function getTabDefinitions_() {
  return [
    {
      name: 'config',
      freezeRows: 1,
      headers: ['key', 'value', 'notes', 'updated_at'],
    },
    {
      name: 'raw_gsc',
      freezeRows: 1,
      headers: [
        'date', 'page', 'query', 'clicks', 'impressions', 'ctr', 'position', 'country', 'device', 'ingested_at',
      ],
    },
    {
      name: 'raw_ga4',
      freezeRows: 1,
      headers: [
        'date', 'page_path', 'sessions', 'users', 'pageviews', 'avg_engagement_sec', 'bounce_rate',
        'conversions', 'source_medium', 'ingested_at',
      ],
    },
    {
      name: 'site_pages',
      freezeRows: 1,
      headers: [
        'url', 'title', 'h1', 'meta_description', 'word_count', 'internal_links_out', 'indexed', 'last_scanned_at',
      ],
    },
    {
      name: 'keywords',
      freezeRows: 1,
      headers: [
        'keyword', 'current_position', 'previous_position', 'delta', 'clicks', 'impressions', 'ctr',
        'target_page', 'status', 'priority_score', 'updated_at',
      ],
    },
    {
      name: 'pages',
      freezeRows: 1,
      headers: [
        'url', 'page_type', 'sessions', 'conversions', 'avg_position', 'weakness_score', 'opportunity_score',
        'recommended_action', 'updated_at',
      ],
    },
    {
      name: 'competitors',
      freezeRows: 1,
      headers: [
        'competitor_url', 'competitor_name', 'topics_found', 'content_gap', 'our_coverage', 'priority', 'last_analyzed_at',
      ],
    },
    {
      name: 'opportunities',
      freezeRows: 1,
      headers: [
        'id', 'type', 'title', 'description', 'keyword', 'target_url', 'priority_score', 'source', 'status', 'created_at',
      ],
    },
    {
      name: 'content_queue',
      freezeRows: 1,
      headers: [
        'id', 'status', 'content_type', 'seo_title', 'meta_description', 'article_doc_url', 'faq_doc_url',
        'landing_doc_url', 'schema_json', 'internal_links_json', 'gbp_post_draft', 'gbp_audit_summary',
        'priority_score', 'opportunity_id', 'created_at', 'ready_for_approval_at',
      ],
    },
    {
      name: 'approvals',
      freezeRows: 1,
      headers: [
        'id', 'content_queue_id', 'decision', 'decision_by', 'decision_at', 'rejection_reason', 'notes',
      ],
    },
    {
      name: 'history',
      freezeRows: 1,
      headers: [
        'id', 'content_queue_id', 'event_type', 'event_detail', 'actor', 'created_at',
      ],
    },
    {
      name: 'learning_log',
      freezeRows: 1,
      headers: [
        'id', 'content_queue_id', 'feedback_type', 'feedback_text', 'content_type', 'tags', 'applied_to_prompt', 'created_at',
      ],
    },
    {
      name: 'gbp_audit',
      freezeRows: 1,
      headers: [
        'audit_date', 'location_id', 'category_ok', 'services_ok', 'description_ok', 'photos_count', 'posts_count',
        'reviews_unanswered', 'qa_unanswered', 'missing_fields_json', 'recommendations', 'status',
      ],
    },
    {
      name: 'daily_reports',
      freezeRows: 1,
      headers: [
        'report_date', 'report_doc_url', 'new_opportunities', 'keyword_changes', 'pending_approvals',
        'approved_today', 'rejected_today', 'gbp_updates_suggested', 'email_sent', 'created_at',
      ],
    },
  ];
}

function writeHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function createDocTemplates_(rootFolder) {
  const templatesFolder = rootFolder.createFolder('templates');
  const defs = [
    {
      key: 'article',
      title: 'TEMPLATE — Article',
      sections: ['SEO Title', 'Meta Description', 'H1', 'Introduction', 'Body', 'Internal Links', 'Schema JSON-LD', 'CTA'],
    },
    {
      key: 'faq',
      title: 'TEMPLATE — FAQ',
      sections: ['Page Title', 'Meta Description', 'Q&A Pairs', 'Schema FAQPage JSON-LD'],
    },
    {
      key: 'landing',
      title: 'TEMPLATE — Landing Page',
      sections: ['SEO Title', 'Meta Description', 'Hero', 'Benefits', 'Social Proof', 'FAQ', 'CTA', 'Schema'],
    },
    {
      key: 'gbp_post',
      title: 'TEMPLATE — GBP Post',
      sections: ['Post Title', 'Post Body', 'CTA Button', 'Suggested Image Notes', 'Publish Notes'],
    },
    {
      key: 'video_script',
      title: 'TEMPLATE — Video Script',
      sections: ['Hook (0-3s)', 'Problem', 'Solution', 'Proof', 'CTA', 'B-Roll Notes', 'Duration Target'],
    },
  ];

  const out = {};
  defs.forEach(function (d) {
    const doc = DocumentApp.create(d.title);
    const body = doc.getBody();
    body.clear();
    body.appendParagraph(d.title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Project 001 — AI Marketing. Replace placeholders before approval.');
    d.sections.forEach(function (section) {
      body.appendParagraph(section).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('[CONTENT]');
    });
    const file = DriveApp.getFileById(doc.getId());
    templatesFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    out[d.key] = {
      name: d.title,
      docId: doc.getId(),
      url: doc.getUrl(),
    };
  });

  propsSet_('DRIVE_TEMPLATES_ID', templatesFolder.getId());
  return out;
}

function propsSet_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function writeConfig_(ss, spreadsheetId, driveRootId, folderIds, templates) {
  const sheet = ss.getSheetByName('config');
  const now = new Date().toISOString();
  const rows = [
    ['project_name', 'Project 001 — AI SEO & Digital Marketing Manager', 'skeleton v0.1', now],
    ['spreadsheet_id', spreadsheetId, 'central HQ sheet', now],
    ['drive_root_id', driveRootId, 'AI-Marketing folder', now],
    ['drive_drafts_id', folderIds.drafts, '', now],
    ['drive_reports_id', folderIds.reports, '', now],
    ['drive_assets_id', folderIds.assets, '', now],
    ['drive_competitors_id', folderIds.competitors, '', now],
    ['drive_published_id', folderIds.published, '', now],
    ['site_url', 'https://dalia-car.online', 'owner to confirm', now],
    ['gsc_property', '', 'fill after connect', now],
    ['ga4_property_id', '', 'fill after connect', now],
    ['gbp_location_id', '', 'fill after connect', now],
    ['owner_email', Session.getActiveUser().getEmail(), '', now],
    ['skeleton_version', '0.1.0', 'no logic / no publish', now],
  ];

  Object.keys(templates).forEach(function (k) {
    rows.push(['template_' + k + '_url', templates[k].url, templates[k].name, now]);
  });

  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
}

/** Menu for manual skeleton run from Sheet UI */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Project 001')
    .addItem('Run skeleton setup (one-time)', 'createProjectSkeleton')
    .addToUi();
}
