/**
 * CO.CO דליה — Build Engines Runner (parallel execution c1–c13)
 */
(function () {
  'use strict';

  var VERSION = '5.2.0-runner';
  var OUTPUT_KEY = 'coco-dalia-engine-outputs-v1';

  var OWNER = {
    v0: {
      service: 'Vercel v0',
      url: 'https://v0.dev/chat/settings/keys',
      steps: ['היכנס ל-v0.dev עם חשבון Vercel', 'Settings → API Keys', 'Create Key', 'העתק את המפתח'],
      secret: 'V0_API_KEY',
      envFile: '.env.build',
    },
    wordpress: {
      service: 'WordPress (staging בלבד)',
      url: 'https://wordpress.com/support/application-passwords/',
      steps: [
        'פתח אתר WordPress staging (לא production דליה)',
        'Users → Profile → Application Passwords',
        'שם: CO.CO Staging → Add New',
        'העתק סיסמה + URL של האתר + שם משתמש',
      ],
      secrets: ['WORDPRESS_SITE_URL', 'WORDPRESS_USERNAME', 'WORDPRESS_APP_PASSWORD'],
      envFile: '.env.build',
    },
    figma: {
      service: 'Figma',
      url: 'https://www.figma.com/developers/api#access-tokens',
      steps: ['Figma → Settings → Security → Personal access tokens', 'Generate new token', 'העתק'],
      secret: 'FIGMA_ACCESS_TOKEN',
      envFile: '.env.build',
    },
    webflow: {
      service: 'Webflow',
      url: 'https://developers.webflow.com/data/reference/authentication',
      steps: ['Webflow Dashboard → Site settings → Integrations → API Access', 'Generate token', 'העתק Site ID'],
      secrets: ['WEBFLOW_API_TOKEN', 'WEBFLOW_SITE_ID'],
      envFile: '.env.build',
    },
    builder: {
      service: 'Builder.io',
      url: 'https://www.builder.io/account/space',
      steps: ['Builder.io → Account → Space Settings → API Keys', 'Public API Key → העתק'],
      secret: 'BUILDER_IO_API_KEY',
      envFile: '.env.build',
    },
    plasmic: {
      service: 'Plasmic',
      url: 'https://docs.plasmic.app/learn/auth/',
      steps: ['Plasmic → Project → Settings → API token + Project ID', 'העתק שניהם'],
      secrets: ['PLASMIC_API_TOKEN', 'PLASMIC_PROJECT_ID'],
      envFile: '.env.build',
    },
    stitch: {
      service: 'Google AI Studio (Gemini credits)',
      url: 'https://aistudio.google.com/apikey',
      steps: ['AI Studio → API Keys (קיים)', 'Billing → טען credits ל-Gemini', 'אופציונלי: Stitch Labs'],
      secret: 'GEMINI_API_KEY',
      envFile: '.env.openai',
    },
    runway: {
      service: 'Runway',
      url: 'https://app.runwayml.com/account',
      steps: ['Runway → Account → API', 'Create API Key', 'העתק'],
      secret: 'RUNWAY_API_KEY',
      envFile: '.env.build',
    },
  };

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function hasAuth() {
    return !!(window.CocoDaliaAiClient && CocoDaliaAiClient.hasAuth && CocoDaliaAiClient.hasAuth());
  }

  function edgeBuild(body) {
    var s = window.COCO_STAGING || {};
    if (!hasAuth() || !s.supabaseUrl) {
      return Promise.resolve({ ok: false, reason: 'no-auth' });
    }
    var url = s.supabaseUrl.replace(/\/$/, '') + '/functions/v1/marketing-site-build';
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + s.accessToken,
        'Content-Type': 'application/json',
        apikey: s.anonKey || '',
      },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function briefCompany(ctx) {
    var brief = parseLs('dalia_project_brief') || {};
    var bp = parseLs('coco-site-blueprint-v1');
    return (bp && bp.company) || (brief.biz && (brief.biz.companyName || brief.biz.bizName)) || 'CO.CO Client';
  }

  function blueprintPages() {
    var bp = parseLs('coco-site-blueprint-v1');
    if (bp && bp.pages && bp.pages.length) {
      return bp.pages.map(function (p) { return p.title; });
    }
    return ['בית', 'אודות', 'שירותים', 'צור קשר'];
  }

  function downloadTextFiles(files, zipPrefix) {
    if (!files || !files.length) return false;
    files.forEach(function (f, i) {
      setTimeout(function () {
        var blob = new Blob([f.html || f.content || ''], { type: 'text/html;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (zipPrefix || 'site') + '-' + (f.path || ('file-' + i + '.html'));
        a.click();
      }, i * 120);
    });
    return true;
  }

  function runC13(ctx, pkg) {
    if (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.runInternalEngine) {
      var internal = CocoDaliaBuildEnginesEngine.runInternalEngine(pkg);
      if (!internal.ok) return { ok: false, status: 'ממתין', note: 'חסר Brief / Pre-Build report' };
      var files = [];
      if (window.ClientSiteTemplate && internal.blueprint) {
        var built = ClientSiteTemplate.buildSite({
          company: internal.blueprint.company || briefCompany(ctx),
          service: '',
          pages: (internal.blueprint.pages || []).map(function (p) { return p.title; }),
          pagePurposeMap: {},
        });
        files = built.files || [];
        saveLs('coco-dalia-c13-site-files-v1', { files: files, at: new Date().toISOString() });
      }
      return {
        ok: true,
        status: 'הושלם',
        ready: true,
        note: 'Blueprint + ' + (files.length || 0) + ' עמודי HTML',
        previewPath: internal.previewPath,
        files: files,
        ownerAction: null,
      };
    }
    return { ok: false, status: 'שגיאה', note: 'מנוע פנימי לא נטען' };
  }

  function runC3(ctx) {
    if (!window.ClientSiteTemplate) {
      return { ok: false, status: 'ממתין', note: 'template-engine לא נטען', ownerAction: null };
    }
    var built = ClientSiteTemplate.buildSite({
      company: briefCompany(ctx),
      service: 'שירותי ניהול צי ושיווק דיגיטלי',
      pages: blueprintPages(),
      keywords: ['ניהול צי', 'שיווק דיגיטלי'],
    });
    saveLs('coco-dalia-c3-site-files-v1', { files: built.files, site: built.site, at: new Date().toISOString() });
    return {
      ok: true,
      status: 'הושלם',
      ready: true,
      note: built.files.length + ' קבצי HTML סטטיים',
      files: built.files,
      ownerAction: null,
    };
  }

  function runC10(ctx) {
    var content = { pages: [], source: 'rule-based', at: new Date().toISOString() };
    blueprintPages().forEach(function (title) {
      content.pages.push({
        title: title,
        hero: title + ' — ' + briefCompany(ctx),
        body: 'תוכן מומלץ לעמוד ' + title + '. מבוסס Brief ו-Blueprint.',
      });
    });
    if (hasAuth() && window.CocoDaliaAiClient) {
      return CocoDaliaAiClient.chat({
        provider: 'claude',
        prompt: 'כתוב פסקה קצרה בעברית לעמוד הבית של ' + briefCompany(ctx),
        module: 'build-engine-c10',
      }).then(function (res) {
        if (res && res.ok && (res.reply || res.text)) {
          content.pages[0].body = (res.reply || res.text).slice(0, 800);
          content.source = 'claude-edge';
        }
        saveLs('coco-dalia-c10-content-v1', content);
        return {
          ok: true,
          status: 'הושלם',
          ready: true,
          note: 'תוכן AI (' + content.source + ') · ' + content.pages.length + ' עמודים',
          ownerAction: null,
        };
      }).catch(function () {
        saveLs('coco-dalia-c10-content-v1', content);
        return { ok: true, status: 'מוכן', ready: true, note: 'תוכן rule-based (Edge לא זמין)', ownerAction: null };
      });
    }
    saveLs('coco-dalia-c10-content-v1', content);
    return Promise.resolve({
      ok: true,
      status: 'מוכן',
      ready: true,
      note: 'תוכן rule-based — התחבר ל-Orin ל-AI live',
      ownerAction: hasAuth() ? null : { type: 'auth', url: 'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html' },
    });
  }

  function runEdgeEngine(id, action, prompt, needsKey) {
    return edgeBuild({ action: action, prompt: prompt, title: briefCompany({}) }).then(function (res) {
      if (res.ok) {
        return {
          ok: true,
          status: 'הושלם',
          ready: true,
          note: action + ' מחובר · Edge OK',
          output: res,
          ownerAction: null,
        };
      }
      if (res.needsKey || res.reason === 'no-auth') {
        var owner = OWNER[needsKey] || null;
        return {
          ok: false,
          status: 'ממתין למפתח',
          ready: false,
          note: res.error || ('נדרש ' + needsKey),
          ownerAction: owner,
          needsKey: needsKey,
        };
      }
      return {
        ok: false,
        status: 'שגיאה',
        ready: false,
        note: res.error || 'Edge failed',
        ownerAction: OWNER[needsKey] || null,
        needsKey: needsKey,
      };
    });
  }

  var RUNNERS = {
    c13: function (ctx, pkg) { return Promise.resolve(runC13(ctx, pkg)); },
    c3: function (ctx) { return Promise.resolve(runC3(ctx)); },
    c10: function (ctx) { return runC10(ctx); },
    c6: function (ctx) {
      return runEdgeEngine('c6', 'images', 'עיצוב גרפי מקצועי לאתר B2B ' + briefCompany(ctx), 'openai');
    },
    c11: function (ctx) {
      return runEdgeEngine('c11', 'images', 'תמונת Hero לאתר ' + briefCompany(ctx), 'openai');
    },
    c8: function (ctx) {
      return runEdgeEngine('c8', 'wordpress', 'עמוד שירותים', 'wordpress');
    },
    c1: function (ctx) {
      return runEdgeEngine('c1', 'v0', 'בנה דף נחיתה React ל' + briefCompany(ctx), 'v0');
    },
    c5: function () { return runEdgeEngine('c5', 'figma', '', 'figma'); },
    c4: function (ctx) {
      return runEdgeEngine('c4', 'stitch', 'עיצוב UI לאתר ' + briefCompany(ctx), 'stitch');
    },
    c9: function () { return runEdgeEngine('c9', 'webflow', '', 'webflow'); },
    c7: function () { return runEdgeEngine('c7', 'builder', '', 'builder'); },
    c2: function () { return runEdgeEngine('c2', 'plasmic', '', 'plasmic'); },
    c12: function (ctx) {
      return runEdgeEngine('c12', 'runway', 'וידאו קצר לפרסום ' + briefCompany(ctx), 'runway');
    },
  };

  function runOne(id, ctx, pkg) {
    var fn = RUNNERS[id];
    if (!fn) return Promise.resolve({ ok: false, status: 'לא ידוע', note: id });
    return fn(ctx, pkg);
  }

  function runAllParallel(ctx, pkg) {
    var ids = Object.keys(RUNNERS);
    var outputs = parseLs(OUTPUT_KEY) || { engines: {}, at: null };
    return Promise.all(ids.map(function (id) {
      return runOne(id, ctx, pkg).then(function (result) {
        outputs.engines[id] = Object.assign({ ranAt: new Date().toISOString() }, result);
        return { id: id, result: result };
      });
    })).then(function (results) {
      outputs.at = new Date().toISOString();
      outputs.version = VERSION;
      saveLs(OUTPUT_KEY, outputs);
      try {
        window.dispatchEvent(new CustomEvent('coco:engines-outputs-updated', { detail: outputs }));
      } catch (e) { /* ignore */ }
      return { results: results, outputs: outputs };
    });
  }

  function getOwnerActions() {
    var outputs = parseLs(OUTPUT_KEY) || {};
    var pending = [];
    Object.keys(outputs.engines || {}).forEach(function (id) {
      var e = outputs.engines[id];
      if (e.ownerAction) pending.push({ id: id, action: e.ownerAction, note: e.note });
    });
    return pending;
  }

  function fetchEdgeStatus() {
    return edgeBuild({ action: 'status' });
  }

  window.CocoDaliaBuildEnginesRunner = {
    VERSION: VERSION,
    OWNER: OWNER,
    runOne: runOne,
    runAllParallel: runAllParallel,
    getOwnerActions: getOwnerActions,
    fetchEdgeStatus: fetchEdgeStatus,
    downloadTextFiles: downloadTextFiles,
  };
})();
