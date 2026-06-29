/**
 * Daily Marketing Engine v2 — headless POC (Staging data only).
 * Output: docs/audit-reports/daily-engine/report.json + meta + REPORT-HE-v2
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { P001 } from './project-001/_lib/config.mjs';
import {
  runDailyEngine,
  mergeRunHistory,
  mergeHistoryLite,
  buildProgressEntry,
  buildAutoModePatch,
  estimateStorageSizes,
  exportHistoryToSheets,
  RUNS_KEY,
  DRAFT_ACTIONS_KEY,
  KEYWORDS_KEY,
  AUTO_MODE_KEY,
  HISTORY_LITE_KEY,
  PROGRESS_LOG_KEY,
  DEFAULT_KEYWORDS_DALIA,
  getDefaultTenants,
  MAX_RUNS,
  MAX_DRAFTS,
  MAX_HISTORY,
} from './lib/daily-engine-core.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'daily-engine');
const PUBLIC = join(P001.root, 'public', 'project-001');
const LOCAL_STATE = join(OUT, 'local-state-snapshot.json');

mkdirSync(OUT, { recursive: true });

function git(cmd) {
  try { return execSync(cmd, { cwd: P001.root, encoding: 'utf8' }).trim(); } catch { return ''; }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const dashboard = readJson(join(PUBLIC, 'dashboard.json'));
const workPlan = readJson(join(PUBLIC, 'site-work-plan.json'));
const crawl = readJson(join(PUBLIC, 'site-crawl-lite.json'));

let prevState = { runs: [], drafts: [], autoMode: {}, progress: [], historyLite: [], keywords: {} };
if (existsSync(LOCAL_STATE)) {
  try { prevState = JSON.parse(readFileSync(LOCAL_STATE, 'utf8')); } catch { /* ignore */ }
}

const lastRun = prevState.lastRun || (prevState.runs && prevState.runs[0]) || null;
const tenants = getDefaultTenants();

console.log('[daily-engine v2] Starting headless run…');
const started = Date.now();

const { run, report, historyLite } = runDailyEngine({
  dashboard,
  workPlan,
  crawl,
  lastRun,
  tenants,
  clientId: 'dalia-c-official',
  site: 'dalia-c.com',
  keywords: DEFAULT_KEYWORDS_DALIA,
  mode: 'headless',
  demo: false,
});

const runs = mergeRunHistory(prevState.runs || [], run, MAX_RUNS);
const drafts = prevState.drafts || [];
run.draftActions.forEach((a) => {
  if (!drafts.some((d) => d.id === a.id)) drafts.unshift(a);
});

const histResult = mergeHistoryLite(prevState.historyLite || [], historyLite, MAX_HISTORY);
const autoMode = buildAutoModePatch(run, prevState.autoMode || {});
const progress = [buildProgressEntry(run)].concat(prevState.progress || []).slice(0, 100);

const keywords = { 'dalia-c-official': DEFAULT_KEYWORDS_DALIA };

const stateSnapshot = {
  [RUNS_KEY]: { runs, lastRun: run },
  [DRAFT_ACTIONS_KEY]: drafts.slice(0, MAX_DRAFTS),
  [KEYWORDS_KEY]: keywords,
  [AUTO_MODE_KEY]: autoMode,
  [HISTORY_LITE_KEY]: histResult.items,
  [PROGRESS_LOG_KEY]: progress,
  lastRun: run,
  runs,
  drafts: drafts.slice(0, MAX_DRAFTS),
  autoMode,
  progress,
  historyLite: histResult.items,
  keywords,
};

const storageEst = estimateStorageSizes({
  runs: { runs },
  drafts: drafts.slice(0, MAX_DRAFTS),
  keywords,
  autoMode,
  historyLite: histResult.items,
});

writeFileSync(LOCAL_STATE, JSON.stringify(stateSnapshot, null, 2));
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(
  join(OUT, 'run-' + run.id + '.json'),
  JSON.stringify({
    run: {
      id: run.id, status: run.status, summary: run.summary,
      goals: run.goals, draftActions: run.draftActions,
      scheduleRuns: run.scheduleRuns, phasesSkipped: run.phasesSkipped,
    },
    report,
    storageEst,
    stateKeys: { RUNS_KEY, DRAFT_ACTIONS_KEY, KEYWORDS_KEY, AUTO_MODE_KEY, HISTORY_LITE_KEY },
  }, null, 2),
);

const commitHash = git('git rev-parse --short HEAD');
const meta = {
  engineVersion: report.version,
  runId: run.id,
  status: run.status,
  durationMs: Date.now() - started,
  commit: commitHash,
  branch: git('git rev-parse --abbrev-ref HEAD'),
  generatedAt: report.generatedAt,
  stagingUrl: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-2',
  summary: run.summary,
  conclusions: run.conclusions,
  draftActionIds: run.actionsCreated,
  goalsCreated: (run.goals || []).map((g) => ({ id: g.id, keyword: g.keyword, topic: g.topic })),
  slaSample: run.draftActions && run.draftActions[0] && run.draftActions[0].sla,
  keywordsUsed: run.keywordsUsed,
  dataChecked: run.dataChecked,
  missing: run.dataSources && run.dataSources.missing,
  phasesSkipped: run.phasesSkipped,
  scheduleRuns: run.scheduleRuns,
  storageEstimates: storageEst,
  historyExportHint: histResult.exportHint,
  mode: 'REAL — headless Node POC v2 on local JSON snapshots',
};
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

console.log('[daily-engine v2] Done:', run.id, run.status);
console.log('[daily-engine v2] Report:', join(OUT, 'report.json'));
console.log('[daily-engine v2] Summary:', JSON.stringify(run.summary));
console.log('[daily-engine v2] Storage estimates (bytes):', JSON.stringify(storageEst));
console.log('[daily-engine v2] Draft actions:', run.actionsCreated.length, 'with SLA:', !!run.draftActions[0]?.sla);
