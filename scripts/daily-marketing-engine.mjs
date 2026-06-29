/**
 * Daily Marketing Engine — headless POC (Staging data only).
 * Output: docs/audit-reports/daily-engine/report.json + REPORT snippet
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { P001 } from './project-001/_lib/config.mjs';
import {
  runDailyEngine,
  mergeRunHistory,
  buildProgressEntry,
  buildAutoModePatch,
  RUNS_KEY,
  DRAFT_ACTIONS_KEY,
  AUTO_MODE_KEY,
  PROGRESS_LOG_KEY,
} from './lib/daily-engine-core.mjs';

const OUT = join(P001.root, 'docs', 'audit-reports', 'daily-engine');
const PUBLIC = join(P001.root, 'public', 'project-001');
const LOCAL_STATE = join(OUT, 'local-state-snapshot.json');

mkdirSync(OUT, { recursive: true });

function git(cmd) {
  try {
    return execSync(cmd, { cwd: P001.root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const dashboard = readJson(join(PUBLIC, 'dashboard.json'));
const workPlan = readJson(join(PUBLIC, 'site-work-plan.json'));
const crawl = readJson(join(PUBLIC, 'site-crawl-lite.json'));

let prevState = { runs: [], drafts: [], autoMode: {}, progress: [] };
if (existsSync(LOCAL_STATE)) {
  try {
    prevState = JSON.parse(readFileSync(LOCAL_STATE, 'utf8'));
  } catch { /* ignore */ }
}

const lastRun = prevState.lastRun || (prevState.runs && prevState.runs[0]) || null;

console.log('[daily-engine] Starting headless run…');
const started = Date.now();

const { run, report } = runDailyEngine({
  dashboard,
  workPlan,
  crawl,
  lastRun,
  clientId: 'dalia-c-official',
  site: 'dalia-c.com',
  mode: 'headless',
  demo: false,
});

const runs = mergeRunHistory(prevState.runs || [], run);
const drafts = prevState.drafts || [];
if (run.draftAction && !drafts.some((a) => a.id === run.draftAction.id)) {
  drafts.unshift(run.draftAction);
}

const autoMode = buildAutoModePatch(run, prevState.autoMode || {});
const progress = [buildProgressEntry(run)].concat(prevState.progress || []).slice(0, 100);

const stateSnapshot = {
  [RUNS_KEY]: { runs, lastRun: run },
  [DRAFT_ACTIONS_KEY]: drafts.slice(0, 50),
  [AUTO_MODE_KEY]: autoMode,
  [PROGRESS_LOG_KEY]: progress,
  lastRun: run,
  runs,
  drafts: drafts.slice(0, 50),
  autoMode,
  progress,
};

writeFileSync(LOCAL_STATE, JSON.stringify(stateSnapshot, null, 2));
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(
  join(OUT, 'run-' + run.id + '.json'),
  JSON.stringify({ run, report, stateKeys: { RUNS_KEY, DRAFT_ACTIONS_KEY, AUTO_MODE_KEY, PROGRESS_LOG_KEY } }, null, 2),
);

const meta = {
  engineVersion: report.version,
  runId: run.id,
  status: run.status,
  durationMs: Date.now() - started,
  commit: git('git rev-parse --short HEAD'),
  branch: git('git rev-parse --abbrev-ref HEAD'),
  generatedAt: report.generatedAt,
  stagingUrl:
    'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-daily-engine-1',
  summary: run.summary,
  conclusions: run.conclusions,
  draftActionId: run.draftAction && run.draftAction.id,
  dataChecked: run.dataChecked,
  missing: run.dataSources.missing,
  mode: 'REAL — headless Node POC on local JSON snapshots',
};
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

console.log('[daily-engine] Done:', run.id, run.status);
console.log('[daily-engine] Report:', join(OUT, 'report.json'));
console.log('[daily-engine] Summary:', JSON.stringify(run.summary));
