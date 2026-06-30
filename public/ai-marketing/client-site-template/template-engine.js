/**
 * Client site template engine (staging preview only).
 * Produces fixed multi-page templates from business context.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slugify(value) {
    var txt = String(value || '').trim().toLowerCase();
    txt = txt.replace(/[\u0590-\u05FF]/g, '');
    txt = txt.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return txt || 'page';
  }

  function normalizePages(rawPages) {
    var defaults = ['בית', 'אודות', 'שירותים', 'צור קשר'];
    var list = (rawPages || []).map(function (p) { return String(p || '').trim(); }).filter(Boolean);
    defaults.forEach(function (name) {
      if (list.indexOf(name) < 0) list.push(name);
    });
    var used = {};
    return list.map(function (title, index) {
      var base = slugify(title);
      if (base === 'page') base = 'page-' + (index + 1);
      var slug = base;
      var n = 2;
      while (used[slug]) {
        slug = base + '-' + n;
        n += 1;
      }
      used[slug] = true;
      return { title: title, slug: slug, fileName: index === 0 ? 'index.html' : (slug + '.html') };
    });
  }

  function pageTemplate(site, page, pages) {
    var nav = pages.map(function (p) {
      return '<a href="' + esc(p.fileName) + '" style="color:#fff;text-decoration:none;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.14);">' + esc(p.title) + '</a>';
    }).join(' ');
    var keywords = (page.keywords || []).map(function (k) {
      return '<span style="display:inline-block;padding:4px 8px;border:1px solid #dbeafe;border-radius:999px;margin:0 6px 6px 0;">' + esc(k) + '</span>';
    }).join('');
    return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(site.company) + ' | ' + esc(page.title) + '</title>' +
      '<meta name="description" content="' + esc(page.purpose || '') + '">' +
      '<meta name="keywords" content="' + esc((page.keywords || []).join(', ')) + '">' +
      '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;background:#f7f9fc;color:#111827}header{background:#0b1735;color:#fff;padding:18px}main{max-width:980px;margin:0 auto;padding:20px}section{background:#fff;border:1px solid #dbe3f0;border-radius:12px;padding:16px;margin-bottom:14px}footer{background:#0f172a;color:#fff;padding:16px;text-align:center}</style>' +
      '</head><body><header><div style="font-size:24px;font-weight:800;">' + esc(site.company) + '</div><div style="margin-top:6px;">' + esc(site.service) + '</div><nav style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">' + nav + '</nav></header>' +
      '<main><section><h1 style="margin-top:0;">' + esc(page.title) + '</h1><p>' + esc(page.purpose || '') + '</p></section><section><h2 style="margin-top:0;">מילות מפתח</h2><div>' + keywords + '</div></section></main>' +
      '<footer>Preview Temporary · move to client repo/domain after approval</footer></body></html>';
  }

  function buildSite(input) {
    var pages = normalizePages(input.pages || []);
    var site = {
      company: input.company || 'Client',
      service: input.service || '',
      slug: input.slug || 'client-preview',
      pages: pages.map(function (p) {
        return {
          title: p.title,
          slug: p.slug,
          fileName: p.fileName,
          purpose: (input.pagePurposeMap && input.pagePurposeMap[p.title]) || '',
          keywords: (input.pageKeywordsMap && input.pageKeywordsMap[p.title]) || (input.keywords || []).slice(0, 4),
        };
      }),
    };
    return {
      site: site,
      files: site.pages.map(function (p) {
        return { path: p.fileName, html: pageTemplate(site, p, site.pages) };
      }),
    };
  }

  root.ClientSiteTemplate = {
    buildSite: buildSite,
  };
})(typeof window !== 'undefined' ? window : globalThis);
