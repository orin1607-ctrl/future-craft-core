/**
 * Create marketing_sites row + google_resource_bindings for brand site asset.
 * Staging only (usfeoerkpcafxxlyuldl). Links to Dalia seed customer_id.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const MARKER = 'coco-google-v2-staging-seed';
const ASSET_ID = 'dalia-brand-site';
const DOMAIN = 'dalia-car.online/site';
const SITE_URL = 'https://dalia-car.online/site/';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'docs/audit-reports/multi-asset-brand-site');
fs.mkdirSync(outDir, { recursive: true });

if (STAGING_REF === PROD_REF) {
  console.error('REFUSED: staging equals production');
  process.exit(1);
}

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    cwd: root,
  }),
);
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = () => new Date().toISOString();

const { data: customer, error: cErr } = await admin
  .from('customers')
  .select('id, name, activity_field')
  .eq('activity_field', MARKER)
  .maybeSingle();
if (cErr || !customer) {
  console.error('customer missing', cErr);
  process.exit(1);
}

const { data: oauth } = await admin
  .from('google_oauth_connections')
  .select('id')
  .eq('customer_id', customer.id)
  .order('updated_at', { ascending: false })
  .limit(1)
  .maybeSingle();

let { data: site } = await admin
  .from('marketing_sites')
  .select('*')
  .eq('customer_id', customer.id)
  .eq('domain', DOMAIN)
  .maybeSingle();

if (!site) {
  const { data: created, error } = await admin
    .from('marketing_sites')
    .insert({
      customer_id: customer.id,
      name: 'דליה — אתר התדמית החדש',
      domain: DOMAIN,
      site_url: SITE_URL,
      site_type: 'website',
      status: 'active',
      site_role: 'landing',
      is_promotion_target: true,
      external_slug: ASSET_ID,
      notes: JSON.stringify({
        asset_id: ASSET_ID,
        ga4: 'properties/545281140',
        measurementId: 'G-KYDLXY9C39',
        gtm: 'GTM-KH38DZ6J',
        gsc: SITE_URL,
      }),
    })
    .select('*')
    .single();
  if (error) {
    console.error('create site failed', error);
    process.exit(1);
  }
  site = created;
} else {
  const { data: updated, error } = await admin
    .from('marketing_sites')
    .update({
      name: 'דליה — אתר התדמית החדש',
      site_url: SITE_URL,
      site_role: 'landing',
      is_promotion_target: true,
      external_slug: ASSET_ID,
      status: 'active',
      updated_at: now(),
    })
    .eq('id', site.id)
    .select('*')
    .single();
  if (error) {
    console.error('update site failed', error);
    process.exit(1);
  }
  site = updated;
}

const t = now();
const rows = [
  {
    provider: 'google_analytics',
    property_id: 'properties/545281140',
    measurement_id: 'G-KYDLXY9C39',
    container_id: '',
    ads_customer_id: '',
    location_id: '',
    connection_status: 'connected',
    token_status: 'valid',
    data_freshness: 'LIVE',
    health_status: 'healthy',
    last_error: '',
    config: {
      asset_id: ASSET_ID,
      streamName: 'properties/545281140/dataStreams/15246513921',
      defaultUri: SITE_URL,
    },
  },
  {
    provider: 'google_tag_manager',
    property_id: '',
    measurement_id: '',
    container_id: 'GTM-KH38DZ6J',
    ads_customer_id: '',
    location_id: '',
    connection_status: 'connected',
    token_status: 'valid',
    data_freshness: 'STALE',
    health_status: 'degraded',
    last_error: 'Container created; publish needs tagmanager.publish / owner Publish in UI',
    config: {
      asset_id: ASSET_ID,
      accountId: '6239197284',
      containerNumericId: '258130829',
      path: 'accounts/6239197284/containers/258130829',
      publishStatus: 'pending_owner',
    },
  },
  {
    provider: 'google_search_console',
    property_id: SITE_URL,
    measurement_id: '',
    container_id: '',
    ads_customer_id: '',
    location_id: '',
    connection_status: 'connected',
    token_status: 'valid',
    data_freshness: 'LIVE',
    health_status: 'healthy',
    last_error: '',
    config: {
      asset_id: ASSET_ID,
      siteUrl: SITE_URL,
      sitemap: `${SITE_URL}sitemap.xml`,
    },
  },
  {
    provider: 'google_business',
    property_id: '',
    measurement_id: '',
    container_id: '',
    ads_customer_id: '',
    location_id: 'locations/18079880828372396175',
    connection_status: 'connected',
    token_status: 'valid',
    data_freshness: 'LIVE',
    health_status: 'healthy',
    last_error: '',
    config: {
      asset_id: ASSET_ID,
      note: 'Read-only in system; GBP public website URL intentionally NOT changed',
      title: 'דליה פתרונות מימון ותחזוקה לרכב',
      publicWebsiteUnchanged: 'https://dalia-c.com/',
    },
  },
  {
    provider: 'google_pagespeed',
    property_id: SITE_URL,
    measurement_id: '',
    container_id: '',
    ads_customer_id: '',
    location_id: '',
    connection_status: 'connected',
    token_status: 'valid',
    data_freshness: 'MISSING',
    health_status: 'unknown',
    last_error: 'PageSpeed API quota exceeded (429) — retry when quota resets',
    config: {
      asset_id: ASSET_ID,
      url: SITE_URL,
      strategies: ['mobile', 'desktop'],
      quotaStatus: 'exceeded',
    },
  },
  {
    provider: 'google_ads',
    property_id: '',
    measurement_id: '',
    container_id: '',
    ads_customer_id: '8957638890',
    location_id: '',
    connection_status: 'blocked_external',
    token_status: 'valid',
    data_freshness: 'BLOCKED',
    health_status: 'blocked_external',
    last_error: 'DEVELOPER_TOKEN_NOT_APPROVED — waiting on Google Basic Access (no new application)',
    config: {
      asset_id: ASSET_ID,
      mccOrClient: '8957638890',
      pending: true,
      pendingReason: 'BASIC_ACCESS',
    },
  },
];

const bindings = [];
for (const row of rows) {
  const payload = {
    customer_id: customer.id,
    website_id: site.id,
    oauth_connection_id: oauth?.id || null,
    ...row,
    last_sync: t,
    last_success: row.connection_status === 'connected' ? t : null,
    updated_at: t,
  };
  const { data, error } = await admin
    .from('google_resource_bindings')
    .upsert(payload, { onConflict: 'website_id,provider' })
    .select(
      'id, website_id, provider, measurement_id, container_id, property_id, location_id, ads_customer_id, connection_status, data_freshness, health_status',
    )
    .single();
  if (error) {
    console.error('binding failed', row.provider, error);
    process.exit(1);
  }
  bindings.push(data);
}

const { data: allSites } = await admin
  .from('marketing_sites')
  .select('id, domain, site_url, site_role, external_slug')
  .eq('customer_id', customer.id)
  .order('created_at');

const { data: readBack } = await admin
  .from('google_resource_bindings')
  .select('provider, measurement_id, container_id, property_id, connection_status, data_freshness')
  .eq('website_id', site.id);

const report = {
  at: t,
  stagingRef: STAGING_REF,
  customer_id: customer.id,
  asset_id: ASSET_ID,
  website_id: site.id,
  domain: DOMAIN,
  site_url: SITE_URL,
  oauth_connection_id: oauth?.id || null,
  websitesForCustomer: allSites,
  bindings,
  readByWebsiteId: readBack,
  proof: {
    websiteCreated: !!site.id,
    bindingCount: bindings.length,
    providers: bindings.map((b) => b.provider),
    noLocalConfigOnly: true,
  },
};

fs.writeFileSync(path.join(outDir, 'SUPABASE-BRAND-BINDINGS.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
