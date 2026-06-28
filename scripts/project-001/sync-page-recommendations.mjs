/**
 * Sync 28 pages × 20 recommendations + deduped granular actions (Staging SSOT).
 * Read-only on live site — updates public/project-001/site-work-plan.json only.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';

const PLAN_PATH = join(P001.root, 'public', 'project-001', 'site-work-plan.json');
const INDEX_PATH = join(P001.root, 'public', 'project-001', 'site-pages-index.json');
const DASH_PATH = join(P001.root, 'public', 'project-001', 'dashboard.json');
const TYPES_PATH = join(P001.root, 'public', 'project-001', 'marketing-recommendation-types.json');
const AUDIT_PATH = join(P001.root, 'docs', 'audit-reports', 'dalia-site-full-audit', 'report.json');

const typesDoc = JSON.parse(readFileSync(TYPES_PATH, 'utf8'));
const REC_TYPES = typesDoc.types;

function normPath(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/\/$/, '') || '/').toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function checklistToStatus(val) {
  if (val === 'pass') return 'ok';
  if (val === 'fail') return 'fail';
  if (val === 'pending') return 'pending';
  return 'pending';
}

function isConversionPage(path) {
  return /contact|צור-קשר|registration|שאלון|79-shekels|card-provider|catalog|our-app|home|\/$/.test(
    String(path).toLowerCase()
  );
}

function pagePriority(page) {
  if (page.rank <= 5) return 'גבוה';
  if (page.rank <= 15) return 'בינוני';
  return 'נמוך';
}

function buildAuditMap() {
  if (!existsSync(AUDIT_PATH)) return new Map();
  const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
  return new Map(audit.pages.map((p) => [normPath(p.url), p]));
}

function buildIndexMap() {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const map = new Map();
  for (const p of index.pages.business || []) {
    map.set(normPath(p.url), p);
  }
  return map;
}

function loadDashboard() {
  if (!existsSync(DASH_PATH)) return null;
  try {
    return JSON.parse(readFileSync(DASH_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function inferFromIssues(page, typeId) {
  const issues = page.issues || [];
  const missing = page.missing || [];
  const score = page.seoScore ?? 5;
  const path = page.path || '';

  switch (typeId) {
    case 'title':
      if (issues.some((i) => /title/i.test(i))) return { status: 'fail', source: 'crawl', detail: 'Title דורש שיפור' };
      return score >= 5 ? { status: 'needs_improvement', source: 'crawl', detail: 'לבדוק אורך ומיקוד Title' } : { status: 'fail', source: 'crawl', detail: 'Title חלש' };
    case 'meta':
      if (missing.some((m) => /meta/i.test(m)) || issues.some((i) => /meta/i.test(i))) {
        return { status: 'fail', source: 'crawl', detail: 'חסר או חלש Meta Description' };
      }
      return { status: 'needs_improvement', source: 'crawl', detail: 'למקד Meta עם CTA' };
    case 'h1':
      if (issues.includes('missing_h1') || missing.some((m) => /^h1/i.test(m))) {
        return { status: 'fail', source: 'crawl', detail: 'חסר H1' };
      }
      return { status: 'ok', source: 'crawl', detail: 'H1 קיים' };
    case 'h2':
      return score >= 6
        ? { status: 'ok', source: 'crawl', detail: 'מבנה כותרות בסיסי תקין' }
        : { status: 'needs_improvement', source: 'crawl', detail: 'להוסיף H2 עם מילות מפתח' };
    case 'keywords': {
      const gsc = page.gsc || {};
      if (gsc.impressions > 10) return { status: 'ok', source: 'GSC', detail: `${gsc.impressions} חשיפות · מיקום ${(gsc.position || 0).toFixed(1)}` };
      if (gsc.impressions > 0) return { status: 'needs_improvement', source: 'GSC', detail: 'נפח חיפוש נמוך — להרחיב כיסוי' };
      return { status: 'needs_improvement', source: 'GSC', detail: 'אין נתוני GSC לעמוד — לבדוק אינדוקס' };
    }
    case 'content':
      if (score >= 6) return { status: 'ok', source: 'crawl', detail: page.contentStatus || 'תוכן בסיסי תקין' };
      if (score >= 4) return { status: 'needs_improvement', source: 'crawl', detail: page.contentStatus || 'ניתן לשפר תוכן' };
      return { status: 'fail', source: 'crawl', detail: page.contentStatus || 'תוכן חלש' };
    case 'internalLinks':
      return { status: 'pending', source: 'checklist', detail: 'ממתין לבדיקת checklist מלאה' };
    case 'externalLinks':
      return { status: 'na', source: 'crawl', detail: 'לא נדרש לעמוד עסקי זה' };
    case 'alt': {
      const altIssue = issues.find((i) => i.startsWith('images_without_alt'));
      if (altIssue) {
        const n = altIssue.split(':')[1] || '?';
        return { status: 'fail', source: 'crawl', detail: `${n} תמונות ללא alt` };
      }
      if (missing.some((m) => /alt/i.test(m))) return { status: 'fail', source: 'crawl', detail: missing.find((m) => /alt/i.test(m)) };
      return { status: 'ok', source: 'crawl', detail: 'Alt תקין' };
    }
    case 'schema':
      return { status: 'pending', source: 'checklist', detail: 'ממתין לבדיקת Schema' };
    case 'cta':
      return isConversionPage(path)
        ? { status: 'needs_improvement', source: 'crawl', detail: 'לחזק CTA בדף המרה' }
        : { status: 'na', source: 'crawl', detail: 'עמוד מידעי' };
    case 'forms':
      return isConversionPage(path)
        ? { status: 'needs_improvement', source: 'crawl', detail: 'לוודא טופס/טלפון/וואטסאפ' }
        : { status: 'na', source: 'crawl', detail: 'לא נדרש' };
    case 'pageSpeed':
      if (page.pageSpeedScore != null) {
        return page.pageSpeedScore >= 80
          ? { status: 'ok', source: 'checklist', detail: `PageSpeed ${page.pageSpeedScore}` }
          : { status: 'fail', source: 'checklist', detail: `PageSpeed ${page.pageSpeedScore} — יעד 80+` };
      }
      return { status: 'pending', source: 'checklist', detail: page.pageSpeedNote || 'ממתין ל-PageSpeed Insights' };
    case 'mobile':
      return { status: 'pending', source: 'checklist', detail: 'ממתין לבדיקת Mobile' };
    case 'ux':
      return score >= 6
        ? { status: 'ok', source: 'crawl', detail: 'UX בסיסי תקין' }
        : { status: 'needs_improvement', source: 'crawl', detail: 'לשפר חוויית משתמש ומבנה' };
    case 'accessibility':
      return { status: 'pending', source: 'checklist', detail: 'ממתין לבדיקת נגישות' };
    case 'performance':
      if (page.pageSpeedScore != null) {
        return page.pageSpeedScore >= 80
          ? { status: 'ok', source: 'checklist', detail: 'ביצועים תקינים' }
          : { status: 'fail', source: 'checklist', detail: 'ביצועים דורשים שיפור' };
      }
      return { status: 'pending', source: 'checklist', detail: 'ממתין למדידת ביצועים' };
    case 'conversion': {
      const cs = page.conversionStatus || '';
      if (/גבוה|פוטנציאל גבוה/.test(cs)) return { status: 'needs_improvement', source: 'GA4', detail: cs };
      if (/בינוני/.test(cs)) return { status: 'needs_improvement', source: 'GA4', detail: cs };
      return { status: 'ok', source: 'GA4', detail: cs || 'עמוד תוכן' };
    }
    case 'businessFit':
      return page.tier <= 2
        ? { status: 'ok', source: 'crawl', detail: `עמוד ליבה (Tier ${page.tier})` }
        : { status: 'needs_improvement', source: 'crawl', detail: `עמוד משני (Tier ${page.tier})` };
    case 'aiAdditional':
      if (page.aiSummary) return { status: 'needs_improvement', source: 'AI', detail: page.aiSummary };
      if ((page.improvements || []).length) {
        return { status: 'needs_improvement', source: 'AI', detail: page.improvements[0] };
      }
      return { status: 'ok', source: 'AI', detail: 'אין המלצות AI נוספות' };
    default:
      return { status: 'pending', source: 'crawl', detail: 'ממתין' };
  }
}

function evaluateRecommendation(page, typeDef, auditPage) {
  const checklist = page.checklist || {};
  const fixes = page.fixes || {};
  const key = typeDef.checklistKey;

  if (key && checklist[key]) {
    const status = checklistToStatus(checklist[key]);
    let source = 'checklist';
    if (key === 'pageSpeed' || key === 'mobile') source = 'checklist';
    const detail = fixes[key] || (status === 'ok' ? 'עבר בדיקה' : `דורש טיפול: ${typeDef.labelHe}`);
    return {
      typeId: typeDef.id,
      order: typeDef.order,
      labelHe: typeDef.labelHe,
      status,
      source,
      priority: pagePriority(page),
      detail,
    };
  }

  if (typeDef.id === 'keywords' && page.gsc) {
    const inf = inferFromIssues(page, 'keywords');
    return { typeId: typeDef.id, order: typeDef.order, labelHe: typeDef.labelHe, ...inf, priority: pagePriority(page) };
  }

  if (typeDef.id === 'aiAdditional' && auditPage?.ai?.summary) {
    return {
      typeId: typeDef.id,
      order: typeDef.order,
      labelHe: typeDef.labelHe,
      status: 'needs_improvement',
      source: 'AI',
      priority: pagePriority(page),
      detail: auditPage.ai.summary,
    };
  }

  const inf = inferFromIssues(page, typeDef.id);
  return {
    typeId: typeDef.id,
    order: typeDef.order,
    labelHe: typeDef.labelHe,
    status: inf.status,
    source: inf.source,
    priority: pagePriority(page),
    detail: inf.detail,
  };
}

function actionKey(campaignId, pageId, typeId) {
  return `${campaignId}:${pageId}:${typeId}`;
}

function actionId(pageId, typeId) {
  return `act-${pageId}-${typeId}`;
}

function statusNeedsAction(status) {
  return status === 'fail' || status === 'needs_improvement' || status === 'pending';
}

function mergeActions(plan, pages, campaignId) {
  const existing = new Map();
  for (const a of plan.actions || []) {
    const dedupe = a.dedupeKey || (a.pageId && a.recommendationType ? actionKey(campaignId, a.pageId, a.recommendationType) : a.id);
    existing.set(dedupe, a);
  }

  const next = [];
  const seen = new Set();
  const now = new Date().toISOString();

  for (const page of pages) {
    for (const rec of page.recommendations || []) {
      const dedupe = actionKey(campaignId, page.id, rec.typeId);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const prev = existing.get(dedupe);
      const needs = statusNeedsAction(rec.status);

      if (!needs) {
        if (prev && prev.status !== 'done' && prev.status !== 'completed') {
          next.push({
            ...prev,
            status: 'done',
            completedAt: prev.completedAt || now,
            updatedAt: now,
            detail: rec.detail,
          });
        } else if (prev) {
          next.push(prev);
        }
        continue;
      }

      const urgency = rec.status === 'fail' ? 'גבוה' : rec.priority || 'בינוני';
      const title = `${rec.labelHe}: ${page.title || page.path}`.slice(0, 80);

      next.push({
        id: prev?.id || actionId(page.id, rec.typeId),
        dedupeKey: dedupe,
        title,
        status: prev?.status === 'done' ? 'pending' : (prev?.status || 'pending'),
        urgency,
        priority: rec.priority,
        source: rec.source,
        category: rec.labelHe,
        recommendationType: rec.typeId,
        pageId: page.id,
        pagePath: page.path,
        pageUrl: page.url,
        campaignId,
        detail: rec.detail,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      });
    }
  }

  next.sort((a, b) => {
    const urg = { 'גבוה': 0, 'בינוני': 1, 'נמוך': 2 };
    return (urg[a.urgency] ?? 9) - (urg[b.urgency] ?? 9);
  });

  return next;
}

function buildPageGoals(pages, campaignId) {
  return pages.map((page) => ({
    id: `goal-${page.id}`,
    title: page.title || page.path,
    status: page.executionStatus === 'done' ? 'done' : page.rank <= 3 ? 'active' : 'pending',
    category: 'SEO',
    priority: pagePriority(page),
    pageId: page.id,
    pagePath: page.path,
    pageUrl: page.url,
    campaignId,
    seoScore: page.seoScore,
    recommendationCount: (page.recommendations || []).length,
  }));
}

export function syncPageRecommendations(options = {}) {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  const auditMap = buildAuditMap();
  const indexMap = buildIndexMap();
  const campaignId = plan.campaign?.id || 'campaign-dalia-seo-primary';
  const now = new Date().toISOString();

  const pages = (plan.pages || []).map((page) => {
    const auditPage = auditMap.get(normPath(page.url));
    const indexPage = indexMap.get(normPath(page.url));
    const merged = { ...indexPage, ...page, ...(auditPage ? { h1: auditPage.h1, metaDescription: auditPage.metaDescription } : {}) };

    const recommendations = REC_TYPES.map((typeDef) => evaluateRecommendation(merged, typeDef, auditPage));
    recommendations.sort((a, b) => a.order - b.order);

    const openRecs = recommendations.filter((r) => statusNeedsAction(r.status)).length;
    const okRecs = recommendations.filter((r) => r.status === 'ok').length;

    return {
      ...page,
      recommendations,
      recommendationSummary: {
        total: recommendations.length,
        ok: okRecs,
        open: openRecs,
        syncedAt: now,
      },
    };
  });

  plan.pages = pages;
  plan.goals = buildPageGoals(pages, campaignId);
  plan.actions = mergeActions(plan, pages, campaignId);
  plan.recommendationEngine = {
    version: 1,
    typesCount: REC_TYPES.length,
    syncedAt: now,
    typesFile: 'marketing-recommendation-types.json',
  };
  plan.summary = {
    ...plan.summary,
    pageCount: pages.length,
    goalsCount: plan.goals.length,
    actionsOpen: plan.actions.filter((a) => a.status !== 'done' && a.status !== 'completed').length,
    actionsDone: plan.actions.filter((a) => a.status === 'done' || a.status === 'completed').length,
    actionsTotal: plan.actions.length,
    recommendationsPerPage: REC_TYPES.length,
  };
  plan.lastUpdated = now;

  if (!options.dryRun) {
    writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
  }

  return {
    pages: pages.length,
    recommendationsPerPage: REC_TYPES.length,
    totalRecommendations: pages.length * REC_TYPES.length,
    goals: plan.goals.length,
    actions: plan.actions.length,
    actionsOpen: plan.summary.actionsOpen,
    uniqueDedupeKeys: new Set(plan.actions.map((a) => a.dedupeKey)).size,
  };
}

const isMain = process.argv[1]?.includes('sync-page-recommendations');
if (isMain) {
  const stats = syncPageRecommendations();
  console.log('sync-page-recommendations:', JSON.stringify(stats, null, 2));
}
