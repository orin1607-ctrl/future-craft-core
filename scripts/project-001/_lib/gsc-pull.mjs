/** Enhanced GSC data pull — tries URL-prefix + domain property, extended ranges */

function dateRange(days, endOffsetDays = 2) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - endOffsetDays);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function queryGsc(sc, siteUrl, startDate, endDate, dimensions, rowLimit = 1000) {
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions, rowLimit, dataState: 'all' },
  });
  return res.data.rows || [];
}

export async function pullGscEnhanced(auth, google, cfg) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const candidates = [
    cfg.gsc_site_url,
    cfg.gsc_domain_property,
    'sc-domain:dalia-c.com',
  ].filter(Boolean);

  const sitesRes = await sc.sites.list();
  const registered = new Set((sitesRes.data.siteEntry || []).map((s) => s.siteUrl));
  const siteList = candidates.filter((u) => registered.has(u));
  if (!siteList.length) siteList.push(...candidates);

  const dayRanges = [cfg.date_range_days || 28, 90, 180].filter((d, i, a) => a.indexOf(d) === i);

  let best = { queries: [], pages: [], siteUrl: null, startDate: '', endDate: '', attempts: [] };

  for (const siteUrl of siteList) {
    for (const days of dayRanges) {
      const { startDate, endDate } = dateRange(days);
      try {
        const queryRows = await queryGsc(sc, siteUrl, startDate, endDate, ['query']);
        const pageRows = await queryGsc(sc, siteUrl, startDate, endDate, ['page']);
        const attempt = {
          siteUrl,
          days,
          startDate,
          endDate,
          queryCount: queryRows.length,
          pageCount: pageRows.length,
        };
        best.attempts.push(attempt);

        if (queryRows.length + pageRows.length > best.queries.length + best.pages.length) {
          best = {
            siteUrl,
            startDate,
            endDate,
            queries: queryRows.map((r) => [r.keys[0], r.clicks, r.impressions, r.ctr, r.position]),
            pages: pageRows.map((r) => [r.keys[0], r.clicks, r.impressions, r.ctr, r.position]),
            attempts: best.attempts,
          };
        }
        if (queryRows.length > 0 || pageRows.length > 0) break;
      } catch (e) {
        best.attempts.push({ siteUrl, days, error: e.message?.slice(0, 150) });
      }
    }
    if (best.queries.length || best.pages.length) break;
  }

  return best;
}

export async function inspectUrls(auth, google, siteUrl, urls) {
  const sc = google.searchconsole({ version: 'v1', auth });
  const out = [];
  for (const url of urls.slice(0, 20)) {
    try {
      const res = await sc.urlInspection.index.inspect({
        requestBody: { inspectionUrl: url, siteUrl },
      });
      const r = res.data.inspectionResult || {};
      out.push({
        url,
        verdict: r.indexStatusResult?.verdict,
        coverageState: r.indexStatusResult?.coverageState,
        indexingState: r.indexStatusResult?.indexingState,
        lastCrawlTime: r.indexStatusResult?.lastCrawlTime,
      });
    } catch (e) {
      out.push({ url, error: e.message?.slice(0, 150) });
    }
  }
  return out;
}
