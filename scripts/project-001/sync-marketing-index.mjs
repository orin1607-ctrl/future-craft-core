/**
 * Build marketing entity indexes from SSOT (site-work-plan, client registry).
 * Output: public/marketing-index/*.json — scalable lookup for Global Filter Context.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { P001 } from './_lib/config.mjs';

const OUT_DIR = join(P001.root, 'public', 'marketing-index');
const PLAN_PATH = join(P001.root, 'public', 'project-001', 'site-work-plan.json');

const OFFICIAL_CLIENT = {
  id: 'dalia-c-official',
  name: 'דליה פתרונות מימון ותחזוקה לרכב',
  slug: 'dalia-c-official',
  status: 'active',
  serviceTypes: ['fleet_and_marketing', 'marketing_only'],
};

const PRIMARY_CAMPAIGN = {
  id: 'campaign-dalia-seo-primary',
  name: 'דליה — קידום dalia-c.com',
  activityType: 'seo',
  status: 'active',
  clientId: 'dalia-c-official',
  channel: 'seo',
  type: 'organic_seo',
};

const PRIMARY_ASSET = {
  id: 'asset-dalia-c-com',
  type: 'website',
  label: 'dalia-c.com',
  domain: 'dalia-c.com',
  url: 'https://dalia-c.com/',
  status: 'active',
  clientId: 'dalia-c-official',
  campaignId: 'campaign-dalia-seo-primary',
};

function inferPageKind(page) {
  const path = String(page.path || '').toLowerCase();
  if (path === '/' || path === '') return 'home';
  if (/blog|מאמר|article/.test(path)) return 'article';
  if (/product|מוצר/.test(path)) return 'product';
  if (/categor|קטגור|archive|ארכיון/.test(path)) return 'category';
  if (/service|שירות|about|אודות|contact|צור/.test(path)) return 'service';
  return 'other';
}

export function syncMarketingIndex(options = {}) {
  mkdirSync(OUT_DIR, { recursive: true });
  const now = new Date().toISOString();

  let plan = { pages: [], campaign: {}, summary: {} };
  if (existsSync(PLAN_PATH)) {
    plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  }

  const campaignId = plan.campaign?.id || PRIMARY_CAMPAIGN.id;
  const clientId = OFFICIAL_CLIENT.id;

  const clientsIndex = {
    version: 1,
    generatedAt: now,
    clients: [OFFICIAL_CLIENT],
  };

  const campaignsByClient = {
    [clientId]: [
      {
        id: campaignId,
        name: plan.campaign?.name || PRIMARY_CAMPAIGN.name,
        activityType: plan.campaign?.channel || plan.campaign?.type || 'seo',
        status: plan.campaign?.status || 'active',
        clientId,
      },
    ],
  };

  const assetsByCampaign = {
    [campaignId]: [PRIMARY_ASSET],
  };

  const pages = (plan.pages || []).map((p) => ({
    id: p.id,
    path: p.path,
    title: p.title,
    url: p.url,
    rank: p.rank,
    tier: p.tier,
    seoScore: p.seoScore,
    kind: inferPageKind(p),
    openActions: (p.recommendations || []).filter((r) => r.status !== 'ok' && r.status !== 'na').length,
  }));

  const pagesByAsset = {
    [PRIMARY_ASSET.id]: {
      total: pages.length,
      assetId: PRIMARY_ASSET.id,
      domain: PRIMARY_ASSET.domain,
      pages,
    },
  };

  const meta = {
    version: 1,
    generatedAt: now,
    stats: {
      clients: clientsIndex.clients.length,
      campaigns: Object.values(campaignsByClient).flat().length,
      assets: Object.values(assetsByCampaign).flat().length,
      pages: pages.length,
      actionsOpen: plan.summary?.actionsOpen ?? null,
    },
  };

  if (!options.dryRun) {
    writeFileSync(join(OUT_DIR, 'clients-index.json'), JSON.stringify(clientsIndex, null, 2));
    writeFileSync(join(OUT_DIR, 'campaigns-by-client.json'), JSON.stringify(campaignsByClient, null, 2));
    writeFileSync(join(OUT_DIR, 'assets-by-campaign.json'), JSON.stringify(assetsByCampaign, null, 2));
    writeFileSync(join(OUT_DIR, 'pages-by-asset.json'), JSON.stringify(pagesByAsset, null, 2));
    writeFileSync(join(OUT_DIR, 'index-meta.json'), JSON.stringify(meta, null, 2));
  }

  return meta.stats;
}

const isMain = process.argv[1]?.includes('sync-marketing-index');
if (isMain) {
  const stats = syncMarketingIndex();
  console.log('sync-marketing-index:', JSON.stringify(stats, null, 2));
}
