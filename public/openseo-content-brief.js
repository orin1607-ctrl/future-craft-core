/* Free-language brief for יצירת תוכן.
   Local understanding, keyword choice and site overlap only.
   Does not invent article HTML, meta text, or image files. */
(function (root) {
  "use strict";

  const STOP = new Set("של על את עם או גם מה זה עבור כדי אחרי לפני אל אם כי לא יש הוא היא הם הן כל בין עד עוד רק מאוד יותר פחות אני לי תכין תבדוק תכתוב הכן הכינו עמוד חדש מאמר תוכן מלא תמונות seo דליה פתרונות ו ת ה ב ל מ כ ש".split(" "));

  function decodeEntities(s) {
    return String(s || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&#0*39;|&#x0*27;/gi, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#0*(\d+);/g, function (_, n) {
        const c = Number(n);
        return c > 0 && c < 0x110000 ? String.fromCharCode(c) : "";
      });
  }

  function clean(s) {
    return decodeEntities(s).replace(/\s+/g, " ").trim();
  }

  function normToken(raw) {
    let t = clean(raw).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (t.length >= 4) {
      const stripped = t.replace(/^[והבלמכש]/u, "");
      if (stripped.length >= 3) t = stripped;
    }
    return t;
  }

  function tokensOf(text) {
    const out = [];
    const seen = new Set();
    String(text || "").split(/[^\p{L}\p{N}]+/u).forEach(function (part) {
      const t = normToken(part);
      if (t.length < 2 || STOP.has(t) || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    });
    return out;
  }

  function tokensMatch(a, b) {
    if (a === b) return true;
    const s = a.length <= b.length ? a : b;
    const l = a.length <= b.length ? b : a;
    if (s.length < 2) return false;
    return l.startsWith(s) && (l.length - s.length) <= 2;
  }

  function overlapCount(left, right) {
    let n = 0;
    left.forEach(function (a) {
      if (right.some(function (b) { return tokensMatch(a, b); })) n++;
    });
    return n;
  }

  function contentTypeOf(text) {
    if (/עמוד חדש|דף חדש|עמוד נחיתה|דף נחיתה|landing page/i.test(text)) return "page";
    if (/מאמר|פוסט|כתבה|מדריך/.test(text)) return "article";
    if (/עמוד|דף/.test(text)) return "page";
    return "other";
  }

  function extractTopic(text) {
    const patterns = [
      /בנושא\s+(.+?)(?=\s*[.\n]|$)/,
      /(?:מאמר|פוסט|מדריך|כתבה|עמוד|דף)(?:\s+חדש)?\s+על\s+([^.\n]+)/,
      /על\s+([^.\n]+)/
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = text.match(patterns[i]);
      if (m && clean(m[1]).length >= 2) return clean(m[1]).replace(/[.,;:]+$/g, "");
    }
    return "";
  }

  function extractKeyword(text) {
    const quoted = text.match(/(?:מילת(?:\s+ה)?מפתח|keyword)\s*[:\-]?\s*["״']([^"״']+)["״']/i);
    if (quoted) return clean(quoted[1]);
    const labeled = text.match(/(?:מילת(?:\s+ה)?מפתח|keyword)\s*[:\-]\s*([^\n.]+)/i);
    if (labeled) return clean(labeled[1]);
    const loose = text.match(/מילת(?:\s+ה)?מפתח\s+([^.,\n]+)/);
    if (loose) return clean(loose[1]);
    return "";
  }

  function lengthOf(text) {
    const has = (word) => new RegExp("(^|[^\\p{L}])" + word + "([^\\p{L}]|$)", "u").test(text);
    if ((/אורך\s*קצר/.test(text) || has("קצר")) && !/לא\s+קצר/.test(text)) return "short";
    if (/אורך\s*בינוני/.test(text) || has("בינוני")) return "medium";
    if (/אורך\s*ארוך/.test(text) || has("ארוך")) return "long";
    const words = text.match(/(\d[\d,]*)\s*מיל/);
    if (words) {
      const n = Number(words[1].replace(/,/g, ""));
      if (n > 0 && n < 650) return "short";
      if (n < 1400) return "medium";
      return "long";
    }
    return "long";
  }

  function wordCountOf(text) {
    const words = text.match(/(\d[\d,]*)\s*מיל/);
    return words ? Number(words[1].replace(/,/g, "")) : null;
  }

  function parseBrief(text) {
    const raw = String(text || "").trim();
    const contentType = contentTypeOf(raw);
    const topic = extractTopic(raw);
    const keyword = extractKeyword(raw);
    const goals = [];
    if (/תבדוק|בדוק|מה צריך/.test(raw)) goals.push("לבדוק מה צריך להיות בעמוד");
    if (/תוכן מלא|תכין תוכן|הכן תוכן|כתוב|תכתוב/.test(raw)) goals.push("להכין תוכן מלא");
    if (/seo|קידום|מטא|meta/i.test(raw)) goals.push("להכין שדות SEO");
    if (/תמונ/.test(raw)) goals.push("להכין מקום לתמונות");
    if (/לפני העלאה|תראה|הראה|תצוגה|preview/i.test(raw)) goals.push("להציג תצוגה לפני העלאה");
    return {
      raw: raw,
      contentType: contentType,
      topic: topic,
      goal: goals.join(" · ") || "להכין את התוכן לפי ההוראה",
      keyword: keyword,
      keywordExplicit: !!keyword,
      length: lengthOf(raw),
      wordCount: wordCountOf(raw),
      wantsImages: /תמונ/.test(raw),
      wantsSeo: /seo|קידום|מטא|meta/i.test(raw) || /עמוד|מאמר|תוכן/.test(raw),
      wantsPreview: /לפני העלאה|תראה|הראה|תצוגה|preview/i.test(raw),
      wantsFullContent: !/רק מבנה|בלי תוכן|בלי לכתוב/.test(raw)
    };
  }

  function chooseKeyword(input) {
    const brief = input.brief || {};
    const keywords = Array.isArray(input.keywords) ? input.keywords : [];
    if (brief.keywordExplicit && brief.keyword) {
      return {
        keyword: brief.keyword,
        source: "instruction",
        candidates: [],
        note: "מילת המפתח נלקחה מההוראה. לא בוצע מחקר נוסף."
      };
    }
    const topicTokens = tokensOf(brief.topic);
    const ranked = keywords.filter(function (k) { return k && k.real && k.kw; }).map(function (k) {
      const qt = tokensOf(k.kw);
      const overlap = overlapCount(topicTokens, qt);
      const extra = qt.filter(function (t) {
        return !topicTokens.some(function (a) { return tokensMatch(a, t); });
      }).length;
      const impr = k.gsc && Number(k.gsc.impr || k.gsc.impressions || 0) || 0;
      const clicks = k.gsc && Number(k.gsc.clicks || 0) || 0;
      return { keyword: k.kw, overlap: overlap, extra: extra, impressions: impr, clicks: clicks };
    }).filter(function (row) { return row.overlap >= 2; }).sort(function (a, b) {
      const close = (row) => (brief.topic && brief.topic.includes(row.keyword) ? 2 : 0);
      const precision = (row) => row.overlap / (row.overlap + row.extra || 1);
      return (close(b) - close(a)) || (precision(b) - precision(a)) || (b.overlap - a.overlap) || (b.impressions - a.impressions);
    });
    if (ranked.length) {
      return {
        keyword: ranked[0].keyword,
        source: "search_console",
        candidates: ranked.slice(0, 6),
        note: "נבחרה שאילתה אמיתית מ-Search Console שחופפת לנושא. אין ספק SERP, ולא הומצא נפח חיפוש."
      };
    }
    return {
      keyword: brief.topic || "",
      source: brief.topic ? "topic" : "missing",
      candidates: [],
      note: brief.topic
        ? "לא נמצאה שאילתת Search Console עם חפיפה מספיקה, ואין ספק SERP. מילת המפתח היא הנושא מההוראה — לא תוצאת מחקר."
        : "לא זוהתה מילת מפתח ולא זוהה נושא."
    };
  }

  function pageText(page) {
    return [page.title, page.h1, page.url, page.path].map(clean).join(" ");
  }

  function absoluteUrl(page) {
    const raw = clean(page.url || page.path || "");
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return "https://dalia-c.com" + (raw.charAt(0) === "/" ? raw : "/" + raw);
  }

  function checkExisting(input) {
    const brief = input.brief || {};
    const scanState = input.scanState || "missing";
    const keyword = input.keyword || brief.keyword || brief.topic || "";
    const base = tokensOf(brief.topic || keyword);
    const added = tokensOf(keyword).filter(function (t) { return !base.some(function (b) { return tokensMatch(b, t); }); });
    const topicTokens = added.length <= 2 ? base.concat(added) : base;
    if (scanState !== "real") {
      return {
        risk: "unchecked",
        pages: [],
        drafts: [],
        note: scanState === "demo"
          ? "אתר הדגמה — לא נבדקה כפילות, כי אין סריקה אמיתית."
          : "סריקת האתר לא נטענה — בדיקת כפילות לא בוצעה."
      };
    }
    const pages = (input.pages || []).filter(function (p) { return p && p.real !== false; }).map(function (p) {
      const overlap = overlapCount(topicTokens, tokensOf(pageText(p)));
      return {
        url: absoluteUrl(p),
        path: p.path || p.url || "",
        title: clean(p.h1 || p.title || p.url || ""),
        overlap: overlap,
        kind: "site"
      };
    }).filter(function (p) { return p.overlap >= 2; }).sort(function (a, b) { return b.overlap - a.overlap; });
    const drafts = (input.drafts || []).filter(function (d) {
      return d && (d.wp_draft_id || d.aiDraft || d.realDraft);
    }).map(function (d) {
      const overlap = overlapCount(topicTokens, tokensOf((d.title || "") + " " + (d.keyword || "")));
      return { id: d.id, title: d.title || "", keyword: d.keyword || "", overlap: overlap, kind: "draft", wp_draft_id: d.wp_draft_id || null };
    }).filter(function (d) { return d.overlap >= 2; }).sort(function (a, b) { return b.overlap - a.overlap; });
    const strongest = pages[0] ? pages[0].overlap : 0;
    const risk = strongest >= Math.max(3, topicTokens.length - 1) ? "high" : pages.length ? "possible" : "none";
    let note = "נבדקו עמודי הסריקה האמיתית של dalia-c.com.";
    if (risk === "high") note = "נמצא עמוד קיים עם חפיפה גבוהה לנושא. לא כדאי לפרסם עמוד חדש בלי להבדיל אותו או לעדכן את הקיים.";
    else if (risk === "possible") note = "נמצאו עמודים קרובים. הם מוצעים כקישורים פנימיים, לא כהוכחה שאין כפילות.";
    else note = "לא נמצאה חפיפה חזקה מול העמודים שנסרקו. זו בדיקת סריקה, לא מחקר מתחרים.";
    if (drafts.length) note += " נמצאו גם טיוטות מקומיות עם חפיפה.";
    return { risk: risk, pages: pages.slice(0, 8), drafts: drafts.slice(0, 5), note: note };
  }

  function slugify(topic) {
    return clean(topic)
      .replace(/["'״׳]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function proposeStructure(input) {
    const brief = input.brief || {};
    const keyword = input.keyword || brief.topic || "";
    const siteCheck = input.siteCheck || { pages: [] };
    const topic = brief.topic || keyword;
    const secondary = (input.keywordChoice && input.keywordChoice.candidates || []).filter(function (row) {
      return row.keyword && row.keyword !== keyword;
    }).slice(0, 5).map(function (row) {
      return { keyword: row.keyword, impressions: row.impressions, clicks: row.clicks, source: "search_console" };
    });
    const links = (siteCheck.pages || []).slice(0, 4).map(function (p) {
      return { url: p.url, anchor: p.title || p.url, reason: "חפיפה של " + p.overlap + " מונחים עם הנושא, מתוך סריקת האתר" };
    });
    return {
      contentType: brief.contentType || "other",
      h1: topic,
      title: topic,
      titleSource: topic ? "topic" : "missing",
      meta_description: "",
      slug: slugify(topic),
      primaryKeyword: keyword,
      secondaryKeywords: secondary,
      internalLinks: links,
      headings: []
    };
  }

  function buildSteps(input) {
    const parsed = input.parsed;
    const keyword = input.keyword;
    const siteCheck = input.siteCheck;
    const structure = input.structure;
    const typeHe = parsed.contentType === "page" ? "עמוד חדש" : parsed.contentType === "article" ? "מאמר" : "תוכן אחר";
    return [
      { id: "understand", state: parsed.topic ? "done" : "blocked", detail: parsed.topic ? ("סוג: " + typeHe + ". נושא: " + parsed.topic + ". מטרה: " + parsed.goal) : "לא זוהו סוג המשימה והנושא." },
      { id: "keyword", state: keyword.keyword ? "done" : "blocked", detail: keyword.note },
      { id: "site", state: siteCheck.risk === "unchecked" ? "blocked" : "done", detail: siteCheck.note },
      { id: "structure", state: structure.slug ? "done" : "blocked", detail: structure.slug ? "הוכנו H1, סלאג, מילת מפתח, מילות משנה מ-Search Console וקישורים פנימיים מהסריקה. Meta וכותרות H2 לא נכתבו כאן — הן מגיעות מ-Gemini או מעריכה." : "לא הוכן מבנה." },
      { id: "write", state: "pending", detail: parsed.wantsFullContent ? "הכתיבה עדיין לא רצה." : "ההוראה לא ביקשה גוף מלא." },
      { id: "seo", state: "ready", detail: "מילת מפתח וסלאג מוכנים. Title הוא הצעה מהנושא, לא ניסוח AI. Meta Description ריק עד כתיבה או עריכה." },
      { id: "images", state: parsed.wantsImages ? "ready" : "skipped", detail: parsed.wantsImages ? "נפתחו משבצות Hero וגוף. לא נוצרה תמונה. העלאה ידנית זמינה, ויצירת AI נשארת אופציונלית." : "ההוראה לא ביקשה תמונות." },
      { id: "preview", state: "ready", detail: "תצוגה מקומית זמינה. היא עדיין לא נפתחה, והעמוד לא הועלה." },
      { id: "edit", state: "ready", detail: "אפשר לערוך כותרת, טקסט, Meta, סלאג, תמונות ו-ALT לפני אישור." },
      { id: "approval", state: "waiting", detail: "לא הוכן ולא הועלה. אין פרסום לאתר החי בלי אישור מפורש." }
    ];
  }

  function prepare(input) {
    const parsed = parseBrief(input.text || "");
    const keyword = chooseKeyword({ brief: parsed, keywords: input.keywords || [] });
    const siteCheck = checkExisting({
      brief: parsed,
      keyword: keyword.keyword,
      pages: input.pages || [],
      drafts: input.drafts || [],
      scanState: input.scanState || "missing"
    });
    const structure = proposeStructure({ brief: parsed, keyword: keyword.keyword, keywordChoice: keyword, siteCheck: siteCheck });
    const steps = buildSteps({ parsed: parsed, keyword: keyword, siteCheck: siteCheck, structure: structure });
    return { parsed: parsed, keyword: keyword, siteCheck: siteCheck, structure: structure, steps: steps };
  }

  const api = {
    parseBrief: parseBrief,
    chooseKeyword: chooseKeyword,
    checkExisting: checkExisting,
    proposeStructure: proposeStructure,
    buildSteps: buildSteps,
    prepare: prepare,
    tokensOf: tokensOf
  };
  root.ContentBrief = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
