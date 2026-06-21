import { getAdsCredentials, normalizeCustomerId } from './ads-env.mjs';

const ADS_API = 'https://googleads.googleapis.com/v18';

function adsError(res, text, data) {
  const msg = data?.error?.message || data?.[0]?.error?.message || text?.slice(0, 400) || res.statusText;
  const err = new Error(`HTTP ${res.status}: ${msg}`);
  err.status = res.status;
  err.data = data;
  return err;
}

export async function adsRequest({
  accessToken,
  developerToken,
  customerId,
  loginCustomerId,
  path,
  method = 'GET',
  body,
}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  const login = normalizeCustomerId(loginCustomerId);
  if (login) headers['login-customer-id'] = login;

  const cid = normalizeCustomerId(customerId);
  const url = path.startsWith('http') ? path : `${ADS_API}/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw adsError(res, text, data);
  return data;
}

export async function listAccessibleCustomers(accessToken, developerToken) {
  const res = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
    },
  });
  const text = await res.text();
  const data = JSON.parse(text);
  if (!res.ok) throw adsError(res, text, data);
  return (data.resourceNames || []).map((r) => r.replace(/^customers\//, ''));
}

export async function adsSearch({ accessToken, developerToken, customerId, loginCustomerId, query }) {
  const cid = normalizeCustomerId(customerId);
  const allRows = [];
  let pageToken = null;
  do {
    const body = { query };
    if (pageToken) body.pageToken = pageToken;
    const data = await adsRequest({
      accessToken,
      developerToken,
      customerId: cid,
      loginCustomerId,
      path: `customers/${cid}/googleAds:search`,
      method: 'POST',
      body,
    });
    const rows = data.results || [];
    allRows.push(...rows);
    pageToken = data.nextPageToken || null;
    if (allRows.length >= 500) break;
  } while (pageToken);
  return allRows;
}

const QUERIES = {
  customer: `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.auto_tagging_enabled
    FROM customer
    LIMIT 1`,
  campaigns: `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50`,
  adGroups: `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE segments.date DURING LAST_30_DAYS
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 30`,
  keywords: `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.name,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 30`,
  daily: `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY segments.date DESC`,
};

function microsToCurrency(micros) {
  return Math.round((Number(micros || 0) / 1_000_000) * 100) / 100;
}

function mapCampaign(row) {
  const c = row.campaign || {};
  const m = row.metrics || {};
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    channel: c.advertisingChannelType || c.advertising_channel_type,
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    cost: microsToCurrency(m.costMicros ?? m.cost_micros),
    conversions: Number(m.conversions || 0),
    conversionValue: microsToCurrency(m.conversionsValue ?? m.conversions_value),
  };
}

function mapAdGroup(row) {
  const g = row.adGroup || row.ad_group || {};
  const m = row.metrics || {};
  return {
    id: g.id,
    name: g.name,
    status: g.status,
    campaign: row.campaign?.name,
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    cost: microsToCurrency(m.costMicros ?? m.cost_micros),
    conversions: Number(m.conversions || 0),
  };
}

function mapKeyword(row) {
  const kw = row.adGroupCriterion?.keyword || row.ad_group_criterion?.keyword || {};
  const m = row.metrics || {};
  return {
    text: kw.text,
    matchType: kw.matchType || kw.match_type,
    adGroup: row.adGroup?.name || row.ad_group?.name,
    campaign: row.campaign?.name,
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    cost: microsToCurrency(m.costMicros ?? m.cost_micros),
    conversions: Number(m.conversions || 0),
  };
}

function mapDaily(row) {
  const m = row.metrics || {};
  return {
    date: row.segments?.date,
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    cost: microsToCurrency(m.costMicros ?? m.cost_micros),
    conversions: Number(m.conversions || 0),
    conversionValue: microsToCurrency(m.conversionsValue ?? m.conversions_value),
  };
}

export function summarizeAdsSync(report) {
  const campaigns = report.campaigns || [];
  const daily = report.daily || [];
  const totals = campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      cost: acc.cost + c.cost,
      conversions: acc.conversions + c.conversions,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
  );
  totals.ctr = totals.impressions ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0;
  totals.cpc = totals.clicks ? Math.round((totals.cost / totals.clicks) * 100) / 100 : 0;
  return {
    ok: report.ok,
    customerId: report.customerId,
    customerName: report.customer?.descriptiveName || report.customer?.descriptive_name || null,
    campaignCount: campaigns.length,
    keywordCount: (report.keywords || []).length,
    ...totals,
    daysSynced: daily.length,
    currency: report.customer?.currencyCode || report.customer?.currency_code || 'ILS',
  };
}

export async function runFullAdsSync(auth, options = {}) {
  const { developerToken, customerId: envCustomerId, loginCustomerId } = getAdsCredentials();
  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    developerTokenSet: Boolean(developerToken),
    customerId: null,
    customer: null,
    accessibleCustomers: [],
    campaigns: [],
    adGroups: [],
    keywords: [],
    daily: [],
    errors: [],
    owner_gate: null,
  };

  if (!developerToken) {
    report.owner_gate = { id: 'google_ads_developer_token', url: 'https://ads.google.com/aw/apicenter' };
    report.errors.push({ step: 'env', message: 'GOOGLE_ADS_DEVELOPER_TOKEN missing in .env.ads' });
    return report;
  }

  const accessToken = auth.credentials?.access_token;
  if (!accessToken) {
    report.errors.push({ step: 'oauth', message: 'No access token — run npm run project-001:auth' });
    return report;
  }

  const scope = String(auth.credentials?.scope || '');
  if (!scope.includes('adwords')) {
    report.errors.push({
      step: 'oauth',
      message: 'Missing adwords scope — run npm run project-001:auth -- --force',
    });
    return report;
  }

  try {
    report.accessibleCustomers = await listAccessibleCustomers(accessToken, developerToken);
  } catch (e) {
    report.errors.push({ step: 'listAccessibleCustomers', message: e.message?.slice(0, 400) });
    if (String(e.message).includes('DEVELOPER_TOKEN')) {
      report.owner_gate = {
        id: 'ads_token_not_approved',
        url: 'https://ads.google.com/aw/apicenter',
        note: 'Token may be pending production approval',
      };
    }
    return report;
  }

  const customerId = normalizeCustomerId(envCustomerId || options.customerId) || report.accessibleCustomers[0];
  if (!customerId) {
    report.errors.push({ step: 'customer', message: 'No accessible Google Ads customer accounts' });
    return report;
  }
  report.customerId = customerId;

  const ctx = { accessToken, developerToken, customerId, loginCustomerId: loginCustomerId || options.loginCustomerId };

  for (const [key, query] of Object.entries(QUERIES)) {
    try {
      const rows = await adsSearch({ ...ctx, query });
      if (key === 'customer') {
        const c = rows[0]?.customer || {};
        report.customer = c;
      } else if (key === 'campaigns') report.campaigns = rows.map(mapCampaign);
      else if (key === 'adGroups') report.adGroups = rows.map(mapAdGroup);
      else if (key === 'keywords') report.keywords = rows.map(mapKeyword);
      else if (key === 'daily') report.daily = rows.map(mapDaily);
    } catch (e) {
      report.errors.push({ step: key, message: e.message?.slice(0, 400) });
    }
  }

  report.summary = summarizeAdsSync(report);
  report.ok =
    report.accessibleCustomers.length > 0 &&
    report.errors.filter((e) => e.step === 'listAccessibleCustomers' || e.step === 'oauth' || e.step === 'env')
      .length === 0 &&
    (report.campaigns.length > 0 || report.daily.length > 0 || report.customer != null);

  return report;
}
