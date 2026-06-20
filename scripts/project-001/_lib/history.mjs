import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { P001 } from './config.mjs';

const PUBLIC = join(P001.root, 'public', 'project-001');

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function appendSyncHistory(entry) {
  const path = join(P001.auditOut, 'sync-history.json');
  mkdirSync(P001.auditOut, { recursive: true });
  const list = loadJson(path) || [];
  list.unshift({
    id: `sync-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  saveJson(path, list.slice(0, 100));
  saveJson(join(PUBLIC, 'sync-history.json'), list.slice(0, 50));
  return list[0];
}

export function loadSyncHistory() {
  return loadJson(join(P001.auditOut, 'sync-history.json')) || [];
}

export function appendAiHistory(suggestions) {
  const path = join(P001.auditOut, 'ai-history.json');
  mkdirSync(P001.auditOut, { recursive: true });
  const list = loadJson(path) || [];
  const batch = {
    id: `ai-${Date.now()}`,
    timestamp: new Date().toISOString(),
    count: suggestions.length,
    items: suggestions.map((s) => ({ ...s, status: 'recommendation_only' })),
  };
  list.unshift(batch);
  saveJson(path, list.slice(0, 100));
  saveJson(join(PUBLIC, 'ai-history.json'), list.slice(0, 30));
  return batch;
}

export function loadAiHistory() {
  return loadJson(join(P001.auditOut, 'ai-history.json')) || [];
}

export function loadDrafts() {
  const audit = loadJson(join(P001.auditOut, 'drafts.json'));
  const pub = loadJson(join(PUBLIC, 'drafts.json'));
  return pub || audit || [];
}

export function mergeDraftsFromSuggestions(suggestions) {
  const path = join(P001.auditOut, 'drafts.json');
  mkdirSync(P001.auditOut, { recursive: true });
  const existing = loadDrafts();
  const ids = new Set(existing.map((d) => d.sourceId));
  const typeMap = { high: 'improve', medium: 'meta', low: 'article' };

  for (const s of suggestions) {
    const sourceId = `sug-${s.title}`;
    if (ids.has(sourceId)) continue;
    existing.unshift({
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sourceId,
      type: typeMap[s.priority] || 'recommendation',
      title: s.title,
      detail: s.detail,
      status: 'pending_approval',
      createdAt: new Date().toISOString(),
      published: false,
      note: 'המלצת AI בלבד — לא פורסם',
    });
    ids.add(sourceId);
  }

  saveJson(path, existing.slice(0, 200));
  saveJson(join(PUBLIC, 'drafts.json'), existing.slice(0, 50));
  return existing;
}

export function updateDraftStatus(draftId, status, note) {
  const path = join(P001.auditOut, 'drafts.json');
  const drafts = loadDrafts();
  const idx = drafts.findIndex((d) => d.id === draftId);
  if (idx === -1) return null;
  drafts[idx] = {
    ...drafts[idx],
    status,
    reviewedAt: new Date().toISOString(),
    note: note || drafts[idx].note,
    published: false,
  };
  saveJson(path, drafts);
  saveJson(join(PUBLIC, 'drafts.json'), drafts.slice(0, 50));

  const histPath = join(P001.auditOut, 'drafts-history.json');
  const hist = loadJson(histPath) || [];
  hist.unshift({
    id: `dh-${Date.now()}`,
    timestamp: new Date().toISOString(),
    draftId,
    action: status,
    title: drafts[idx].title,
    published: false,
  });
  saveJson(histPath, hist.slice(0, 200));
  saveJson(join(PUBLIC, 'drafts-history.json'), hist.slice(0, 50));
  return drafts[idx];
}

export function loadDraftsHistory() {
  return loadJson(join(P001.auditOut, 'drafts-history.json')) || [];
}

export function buildDailyReportFromSync(lastSync, ga4Daily, keywords, suggestions, drafts) {
  const sessions = ga4Daily.reduce((s, r) => s + (r.sessions || 0), 0);
  const clicks = keywords.reduce((s, k) => s + (k.clicks || 0), 0);
  const pending = drafts.filter((d) => d.status === 'pending_approval').length;
  return {
    date: new Date().toISOString().slice(0, 10),
    label: 'דוח יומי',
    whatUp: keywords.length
      ? `GA4: ${sessions} sessions · GSC: ${clicks} קליקים · ${keywords.length} מילות מפתח`
      : `GA4: ${sessions} sessions · GSC: ממתין לנתונים`,
    whatDown: keywords.filter((k) => k.position > 15).length
      ? `${keywords.filter((k) => k.position > 15).length} מילות מפתח במיקום >15`
      : '—',
    created: `${suggestions.length} המלצות AI · ${drafts.filter((d) => d.createdAt?.startsWith(new Date().toISOString().slice(0, 10))).length} טיוטות חדשות`,
    pending: `${pending} טיוטות ממתינות לאישור`,
    tomorrow: '1. אשר טיוטות ממתינות. 2. הרץ Sync. 3. בדוק עמודים חלשים.',
    sessions,
    gscQueries: keywords.length,
    range: lastSync?.date_range,
  };
}
