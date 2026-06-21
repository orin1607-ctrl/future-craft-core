import { loadP001Config } from './config.mjs';

const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const V4_BASE = 'https://mybusiness.googleapis.com/v4';

const PERFORMANCE_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_DIRECTION_REQUESTS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_CONVERSATIONS',
];

function apiError(e) {
  return {
    message: e.message?.slice(0, 300) || String(e),
    code: e.response?.status ?? e.code ?? null,
    data: e.response?.data ? JSON.stringify(e.response.data).slice(0, 400) : null,
  };
}

export function checkGbpOAuth(auth) {
  const scope = String(auth.credentials?.scope || '');
  return {
    hasBusinessManage: scope.includes('business.manage'),
    scopeCount: scope.split(/\s+/).filter(Boolean).length,
  };
}

export async function gbpRequest(auth, url, options = {}) {
  const token = auth.credentials?.access_token;
  if (!token) throw new Error('Missing access token — run npm run project-001:auth');
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.message || res.statusText);
    err.response = { status: res.status, data };
    err.code = res.status;
    throw err;
  }
  return data;
}

export async function fetchGbpAccountsAndLocations(auth, google, businessHint) {
  const hint = businessHint || loadP001Config().gbp_business_hint || 'דליה';
  const report = { accounts: [], locations: [], matched: null, errors: [] };

  try {
    const acct = google.mybusinessaccountmanagement({ version: 'v1', auth });
    const res = await acct.accounts.list();
    report.accounts = (res.data.accounts || []).map((a) => ({
      name: a.name,
      accountName: a.accountName,
      type: a.type,
      verificationState: a.verificationState,
    }));
  } catch (e) {
    report.errors.push({ api: 'mybusinessaccountmanagement', ...apiError(e) });
    return report;
  }

  try {
    const biz = google.mybusinessbusinessinformation({ version: 'v1', auth });
    for (const acc of report.accounts) {
      const locs = await biz.accounts.locations.list({
        parent: acc.name,
        readMask: 'name,title,storefrontAddress,websiteUri,phoneNumbers,categories,profile,metadata,regularHours',
        pageSize: 100,
      });
      for (const loc of locs.data.locations || []) {
        const entry = {
          account: acc.accountName,
          accountResource: acc.name,
          name: loc.name,
          title: loc.title,
          website: loc.websiteUri,
          phone: loc.phoneNumbers?.primaryPhone || loc.phoneNumbers?.[0]?.phoneNumber || null,
          address: loc.storefrontAddress?.addressLines?.join(', ') || null,
          primaryCategory: loc.categories?.primaryCategory?.displayName || null,
          description: loc.profile?.description || null,
          matchHint: String(loc.title || '').includes(hint),
        };
        report.locations.push(entry);
      }
    }
  } catch (e) {
    report.errors.push({ api: 'mybusinessbusinessinformation', ...apiError(e) });
  }

  report.matched =
    report.locations.find((l) => l.matchHint) ||
    report.locations.find((l) => loadP001Config().gbp_location_id && l.name === loadP001Config().gbp_location_id) ||
    report.locations[0] ||
    null;
  return report;
}

function v4LocationPath(location) {
  const name = location.name;
  if (name.startsWith('accounts/')) return name;
  const accountResource = location.accountResource;
  if (!accountResource) throw new Error('Missing account resource for v4 API');
  const accountId = accountResource.replace(/^accounts\//, '');
  const locationId = name.replace(/^locations\//, '');
  return `accounts/${accountId}/locations/${locationId}`;
}

export async function fetchGbpReviews(auth, location) {
  const parent = v4LocationPath(location);
  const data = await gbpRequest(auth, `${V4_BASE}/${parent}/reviews?pageSize=50&orderBy=updateTime%20desc`);
  const reviews = (data.reviews || []).map((r) => ({
    name: r.name,
    reviewer: r.reviewer?.displayName || 'אנונימי',
    starRating: r.starRating,
    comment: r.comment || '',
    createTime: r.createTime,
    updateTime: r.updateTime,
    hasReply: Boolean(r.reviewReply?.comment),
    reply: r.reviewReply?.comment || null,
  }));
  return {
    averageRating: data.averageRating ?? null,
    totalReviewCount: data.totalReviewCount ?? reviews.length,
    unanswered: reviews.filter((r) => !r.hasReply).length,
    reviews,
  };
}

export async function fetchGbpPosts(auth, location) {
  const parent = v4LocationPath(location);
  const data = await gbpRequest(auth, `${V4_BASE}/${parent}/localPosts?pageSize=50`);
  const posts = (data.localPosts || []).map((p) => ({
    name: p.name,
    summary: p.summary || '',
    topicType: p.topicType,
    state: p.state,
    createTime: p.createTime,
    updateTime: p.updateTime,
    searchUrl: p.searchUrl || null,
    callToAction: p.callToAction?.actionType || null,
  }));
  return { posts, count: posts.length };
}

export async function fetchGbpPerformance(auth, google, location, days = 28) {
  const perf = google.businessprofileperformance({ version: 'v1', auth });
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const fmt = (d) => ({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });

  const metrics = {};
  const errors = [];

  try {
    const res = await perf.locations.fetchMultiDailyMetricsTimeSeries({
      location: location.name,
      dailyMetrics: PERFORMANCE_METRICS,
      dailyRange: { startDate: fmt(start), endDate: fmt(end) },
    });
    for (const series of res.data.multiDailyMetricTimeSeries || []) {
      for (const m of series.dailyMetricTimeSeries || []) {
        const key = m.dailyMetric;
        const total = (m.timeSeries?.datedValues || []).reduce((s, dv) => s + Number(dv.value || 0), 0);
        metrics[key] = total;
      }
    }
  } catch (e) {
    errors.push({ api: 'businessprofileperformance.multi', ...apiError(e) });
  }

  let searchKeywords = [];
  try {
    const kw = await perf.locations.searchkeywords.impressions.monthly.list({
      parent: location.name,
      pageSize: 10,
    });
    searchKeywords = (kw.data.searchKeywordsCounts || []).map((k) => ({
      keyword: k.searchKeyword,
      impressions: Number(k.insightsValue?.value || k.insightsValue?.threshold || 0),
    }));
  } catch (e) {
    errors.push({ api: 'businessprofileperformance.searchkeywords', ...apiError(e) });
  }

  const profileViews =
    (metrics.BUSINESS_IMPRESSIONS_DESKTOP_MAPS || 0) +
    (metrics.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0) +
    (metrics.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0) +
    (metrics.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0);

  return {
    dateRange: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days },
    metrics,
    profileViews,
    navigations: metrics.BUSINESS_DIRECTION_REQUESTS || 0,
    calls: metrics.CALL_CLICKS || 0,
    websiteClicks: metrics.WEBSITE_CLICKS || 0,
    messages: metrics.BUSINESS_CONVERSATIONS || 0,
    searchKeywords,
    errors,
  };
}

export async function fetchGbpCalls(auth, google, location) {
  try {
    const calls = google.mybusinessbusinesscalls({ version: 'v1', auth });
    const res = await calls.locations.list({
      parent: location.name,
      pageSize: 20,
    });
    return {
      ok: true,
      items: (res.data.businessCallsInsights || res.data.calls || []).slice(0, 20),
    };
  } catch (e) {
    return { ok: false, ...apiError(e) };
  }
}

export async function fetchGbpQa(auth, google, location) {
  try {
    const qa = google.mybusinessqanda({ version: 'v1', auth });
    const res = await qa.locations.questions.list({
      parent: location.name,
      pageSize: 20,
    });
    const questions = (res.data.questions || []).map((q) => ({
      name: q.name,
      text: q.text,
      createTime: q.createTime,
      totalAnswerCount: q.totalAnswerCount || 0,
    }));
    return { ok: true, questions, unanswered: questions.filter((q) => !q.totalAnswerCount).length };
  } catch (e) {
    return { ok: false, ...apiError(e) };
  }
}

export async function fetchGbpMessages() {
  return {
    ok: false,
    note: 'Business Messages API דורש הרשאה נפרדת — לא זמין ב-business.manage בלבד',
    available: false,
  };
}

export function summarizeGbpSync(payload) {
  const perf = payload.performance || {};
  const reviews = payload.reviews || {};
  return {
    ok: payload.ok,
    locationTitle: payload.location?.title || null,
    profileViews: perf.profileViews ?? null,
    navigations: perf.navigations ?? null,
    calls: perf.calls ?? null,
    messages: perf.messages ?? null,
    searchKeywordsCount: perf.searchKeywords?.length ?? 0,
    averageRating: reviews.averageRating ?? null,
    totalReviews: reviews.totalReviewCount ?? null,
    unansweredReviews: reviews.unanswered ?? null,
    postsCount: payload.posts?.count ?? 0,
    qaUnanswered: payload.qa?.unanswered ?? null,
    apisUsed: payload.apisUsed || [],
    gaps: payload.gaps || [],
  };
}

export async function runFullGbpSync(auth, google, { businessHint, days = 28 } = {}) {
  const oauth = checkGbpOAuth(auth);
  const report = {
    timestamp: new Date().toISOString(),
    ok: false,
    oauth,
    apisUsed: [],
    gaps: [],
    errors: [],
    location: null,
    profile: null,
    performance: null,
    reviews: null,
    posts: null,
    calls: null,
    qa: null,
    messages: null,
  };

  if (!oauth.hasBusinessManage) {
    report.errors.push({
      api: 'oauth',
      message: `Missing scope ${GBP_SCOPE} — run npm run project-001:auth`,
    });
    return report;
  }

  const base = await fetchGbpAccountsAndLocations(auth, google, businessHint);
  report.errors.push(...base.errors);
  if (!base.matched) {
    report.gaps.push('no_location_match');
    return report;
  }

  report.location = base.matched;
  report.profile = {
    title: base.matched.title,
    website: base.matched.website,
    phone: base.matched.phone,
    address: base.matched.address,
    primaryCategory: base.matched.primaryCategory,
    description: base.matched.description,
  };
  report.apisUsed.push('mybusinessaccountmanagement', 'mybusinessbusinessinformation');

  try {
    report.performance = await fetchGbpPerformance(auth, google, base.matched, days);
    report.apisUsed.push('businessprofileperformance');
    if (report.performance.errors?.length) report.errors.push(...report.performance.errors);
  } catch (e) {
    report.errors.push({ api: 'businessprofileperformance', ...apiError(e) });
    report.gaps.push('performance_metrics');
  }

  try {
    report.reviews = await fetchGbpReviews(auth, base.matched);
    report.apisUsed.push('mybusiness_v4_reviews');
  } catch (e) {
    report.errors.push({ api: 'mybusiness_v4_reviews', ...apiError(e) });
    report.gaps.push('reviews');
  }

  try {
    report.posts = await fetchGbpPosts(auth, base.matched);
    report.apisUsed.push('mybusiness_v4_localPosts');
  } catch (e) {
    report.errors.push({ api: 'mybusiness_v4_localPosts', ...apiError(e) });
    report.gaps.push('posts');
  }

  try {
    report.calls = await fetchGbpCalls(auth, google, base.matched);
    if (report.calls.ok) report.apisUsed.push('mybusinessbusinesscalls');
    else report.gaps.push('calls_detail');
  } catch (e) {
    report.gaps.push('calls_detail');
  }

  try {
    report.qa = await fetchGbpQa(auth, google, base.matched);
    if (report.qa.ok) report.apisUsed.push('mybusinessqanda');
    else report.gaps.push('qa');
  } catch (e) {
    report.gaps.push('qa');
  }

  report.messages = await fetchGbpMessages();
  report.gaps.push('messages_api');

  report.summary = summarizeGbpSync(report);
  report.ok =
    Boolean(report.location) &&
    report.errors.filter((e) => e.api === 'mybusinessaccountmanagement').length === 0;
  return report;
}
