/**
 * Provision Google bindings for brand site asset (dalia-brand-site).
 * Creates: GA4 property + web stream, GTM container, GSC URL-prefix attempt.
 * Does NOT change GBP website URL.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAuthenticatedClient } from '../google/_lib/auth.mjs';
import { getP001Scopes } from './_lib/auth.mjs';

const forceAuth = process.argv.includes('--auth');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'docs/audit-reports/multi-asset-brand-site');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'GOOGLE-PROVISION.json');

const SITE_URL = 'https://dalia-car.online/site/';
const ASSET_ID = 'dalia-brand-site';
const GTM_ACCOUNT = '6052486269'; // same account used for Dalia containers

const EXTRA = [
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/analytics.manage.users',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.manage.accounts',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/siteverification',
  'https://www.googleapis.com/auth/cloud-platform',
];

const scopes = [...new Set([...getP001Scopes({ includeOptional: true }), ...EXTRA])];
const report = {
  at: new Date().toISOString(),
  assetId: ASSET_ID,
  siteUrl: SITE_URL,
  steps: [],
  blockers: [],
  ga4: null,
  gtm: null,
  gsc: null,
  needsOwnerAction: [],
};

const auth = await getAuthenticatedClient({ forceLogin: forceAuth, scopes });
const { token } = await auth.getAccessToken();
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function req(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = { raw: t.slice(0, 500) };
  }
  return { status: r.status, ok: r.ok, j };
}

function push(step, res, extra = {}) {
  report.steps.push({
    step,
    status: res.status,
    ok: res.ok,
    err: res.j?.error?.message?.slice(0, 240),
    ...extra,
  });
}

// --- GA4: find account, create property + stream ---
const accounts = await req('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');
push('list_ga4_accounts', accounts, {
  count: (accounts.j?.accountSummaries || []).length,
});

let accountName =
  (accounts.j?.accountSummaries || []).find((a) =>
    /coco|dalia|orin/i.test(a.displayName || ''),
  )?.account ||
  (accounts.j?.accountSummaries || [])[0]?.account;

if (!accountName && accounts.ok) {
  report.blockers.push('No GA4 account found');
} else if (!accounts.ok) {
  report.needsOwnerAction.push({
    what: 'GA4 Analytics Admin API / consent',
    err: accounts.j?.error?.message,
    url: 'https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com',
  });
}

let propertyName = null;
let measurementId = null;

if (accountName) {
  // Look for existing brand property
  const props = await req(
    `https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:${accountName}`,
  );
  push('list_properties', props, { count: (props.j?.properties || []).length });
  const existing = (props.j?.properties || []).find((p) =>
    /brand|תדמית|site\/?$/i.test(p.displayName || '') ||
    String(p.displayName || '').includes('dalia-car.online/site'),
  );
  if (existing) {
    propertyName = existing.name;
    report.steps.push({ step: 'reuse_ga4_property', propertyName, displayName: existing.displayName });
  } else {
    const created = await req('https://analyticsadmin.googleapis.com/v1beta/properties', {
      method: 'POST',
      body: JSON.stringify({
        parent: accountName,
        displayName: 'Dalia Brand Site (/site)',
        timeZone: 'Asia/Jerusalem',
        currencyCode: 'ILS',
        industryCategory: 'AUTOMOTIVE',
      }),
    });
    push('create_ga4_property', created, { name: created.j?.name });
    if (created.ok) propertyName = created.j.name;
    else {
      report.needsOwnerAction.push({
        what: 'Create GA4 Property for brand site',
        err: created.j?.error?.message,
        url: 'https://analytics.google.com/',
      });
    }
  }

  if (propertyName) {
    const streams = await req(
      `https://analyticsadmin.googleapis.com/v1beta/${propertyName}/dataStreams`,
    );
    push('list_streams', streams, { count: (streams.j?.dataStreams || []).length });
    let stream = (streams.j?.dataStreams || []).find((s) =>
      String(s.webStreamData?.defaultUri || '').includes('/site'),
    );
    if (!stream) {
      const createdStream = await req(
        `https://analyticsadmin.googleapis.com/v1beta/${propertyName}/dataStreams`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'WEB_DATA_STREAM',
            displayName: 'dalia-car.online/site',
            webStreamData: { defaultUri: SITE_URL },
          }),
        },
      );
      push('create_web_stream', createdStream, {
        measurementId: createdStream.j?.webStreamData?.measurementId,
      });
      if (createdStream.ok) stream = createdStream.j;
    }
    measurementId = stream?.webStreamData?.measurementId || null;
    report.ga4 = {
      account: accountName,
      property: propertyName,
      measurementId,
      streamName: stream?.name || null,
    };
  }
}

// --- GTM ---
const gtmList = await req(
  `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${GTM_ACCOUNT}/containers`,
);
push('list_gtm_containers', gtmList, {
  count: (gtmList.j?.container || []).length,
});
let gtmContainer = (gtmList.j?.container || []).find((c) =>
  /brand|site|תדמית/i.test(c.name || '') ||
  (c.publicId && String(c.domainName || '').includes('site')),
);
if (!gtmContainer && gtmList.ok) {
  const createdGtm = await req(
    `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${GTM_ACCOUNT}/containers`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Dalia Brand Site',
        usageContext: ['web'],
        domainName: ['dalia-car.online'],
      }),
    },
  );
  push('create_gtm_container', createdGtm, {
    publicId: createdGtm.j?.publicId,
    containerId: createdGtm.j?.containerId,
  });
  if (createdGtm.ok) gtmContainer = createdGtm.j;
  else {
    report.needsOwnerAction.push({
      what: 'Create GTM container Dalia Brand Site',
      err: createdGtm.j?.error?.message,
      url: `https://tagmanager.google.com/#/container/accounts/${GTM_ACCOUNT}/containers`,
    });
  }
} else if (!gtmList.ok) {
  report.needsOwnerAction.push({
    what: 'GTM API access',
    err: gtmList.j?.error?.message,
    url: `https://tagmanager.google.com/#/container/accounts/${GTM_ACCOUNT}/containers`,
  });
}

report.gtm = gtmContainer
  ? {
      accountId: GTM_ACCOUNT,
      containerId: gtmContainer.containerId,
      publicId: gtmContainer.publicId,
      name: gtmContainer.name,
      path: gtmContainer.path,
    }
  : null;

// If we have GTM + measurement, create GA4 config tag in workspace
if (report.gtm?.path && measurementId) {
  const ws = await req(
    `https://tagmanager.googleapis.com/tagmanager/v2/${report.gtm.path}/workspaces`,
  );
  push('list_workspaces', ws, { count: (ws.j?.workspace || []).length });
  const workspace = (ws.j?.workspace || [])[0];
  if (workspace?.path) {
    // Create variable for measurement ID
    const tags = await req(
      `https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}/tags`,
    );
    const hasGa4 = (tags.j?.tag || []).some((t) => /ga4|google analytics/i.test(t.name || ''));
    if (!hasGa4) {
      const tag = await req(
        `https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}/tags`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'GA4 Configuration — Brand Site',
            type: 'gaawc',
            parameter: [
              { type: 'template', key: 'measurementId', value: measurementId },
            ],
            firingTriggerId: ['2147479553'], // All Pages
          }),
        },
      );
      push('create_ga4_tag', tag, { tagId: tag.j?.tagId });
    } else {
      report.steps.push({ step: 'ga4_tag_exists', ok: true });
    }
  }
}

// --- GSC URL-prefix ---
const gscAdd = await req(
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}`,
  { method: 'PUT' },
);
push('gsc_add_site', gscAdd);
if (gscAdd.ok || gscAdd.status === 204) {
  report.gsc = { siteUrl: SITE_URL, status: 'added_or_exists' };
} else {
  // try site verification token approach note
  report.gsc = { siteUrl: SITE_URL, status: 'pending_verification', err: gscAdd.j?.error?.message };
  report.needsOwnerAction.push({
    what: 'Verify Search Console URL-prefix https://dalia-car.online/site/',
    err: gscAdd.j?.error?.message,
    url: 'https://search.google.com/search-console',
  });
}

// Submit sitemap if possible
if (report.gsc?.status === 'added_or_exists') {
  const sm = await req(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/sitemaps/${encodeURIComponent(SITE_URL + 'sitemap.xml')}`,
    { method: 'PUT' },
  );
  push('gsc_submit_sitemap', sm);
}

writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('WROTE', outPath);
