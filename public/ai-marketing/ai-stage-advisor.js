/**
 * AI Stage Advisor — explains what was done and recommends next steps.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var ADVICE_KEY = 'coco-ai-stage-advice-v1';

  var STAGE_ADVICE = {
    research: {
      done: 'נאספו נתוני עסק, אתר קיים, GSC ו-work-plan.',
      why: 'בסיס נתונים לפני החלטות אסטרטגיות.',
      now: 'השלם אסטרטגיית שיווק AI.',
      risk: 'נתונים חלקיים יובילו לאתר חלש.',
      gain: 'אסטרטגיה מבוססת נתונים.',
      priority: ['אסטרטגיה', 'מתחרים', 'מילות מפתח'],
    },
    strategy: {
      done: 'הוגדרה אסטרטגיה, מטרות ופעולות ראשוניות.',
      why: 'יישור קו בין עסק, שיווק ובניית אתר.',
      now: 'הורד ואשר דוח Pre-Build.',
      risk: 'בנייה לפני אישור דוח = החלטות שגויות.',
      gain: 'בהירות מלאה לפני build.',
      priority: ['דוח', 'Blueprint', 'אישור'],
    },
    report: {
      done: 'דוח מקצועי מלא הופק עם 20+ סעיפים.',
      why: 'מסמך החלטה לפני בניית אתר.',
      now: 'אשר דוח והפק Blueprint.',
      risk: 'דילוג על אישור.',
      gain: 'שליטה מלאה בתוכנית.',
      priority: ['Blueprint', 'אישור', 'Build'],
    },
    blueprint: {
      done: 'Blueprint מלא: עמודים, תפריט, טפסים, CTA, SEO.',
      why: 'תוכנית בנייה מפורטת.',
      now: 'פתח Website Builder.',
      risk: 'בנייה ללא Blueprint.',
      gain: 'אתר עקבי ומקצועי.',
      priority: ['Build', 'Preview', 'אישור לקוח'],
    },
    build: {
      done: 'אתר Preview רב-עמודי נבנה.',
      why: 'בסיס אמיתי להמשך פרסום.',
      now: 'בדוק כל עמוד, הוסף הערות, אשר.',
      risk: 'פרסום לפני אישור.',
      gain: 'אתר מוכן ללקוח.',
      priority: ['Preview', 'הערות', 'אישור'],
    },
    preview: {
      done: 'Preview זמין לשיתוף עם לקוח.',
      why: 'אישור לפני Deploy.',
      now: 'שלח קישור Preview ללקוח.',
      risk: 'Deploy ללא אישור.',
      gain: 'אמון לקוח.',
      priority: ['אישור לקוח', 'תיקונים', 'Deploy'],
    },
    publish: {
      done: 'מוכן לפרסום לריפו/דומיין נפרד.',
      why: 'אתר לקוח נפרד מדליה.',
      now: 'הפעל scaffold ריפו זמני.',
      risk: 'פרסום על תשתית דליה.',
      gain: 'עצמאות לקוח.',
      priority: ['Git זמני', 'דומיין', 'ניטור'],
    },
    manage: {
      done: 'Site Hub פעיל — ניהול שוטף.',
      why: 'האתר החדש = מרכז העבודה.',
      now: 'טפל במשימות בעדיפות גבוהה.',
      risk: 'הזנחת SEO/ביצועים.',
      gain: 'שיפור מתמשך.',
      priority: ['משימות', 'SEO', 'ביצועים'],
    },
  };

  function advise(stageId) {
    var tpl = STAGE_ADVICE[stageId] || STAGE_ADVICE.manage;
    var advice = {
      stage: stageId,
      at: new Date().toISOString(),
      whatDone: tpl.done,
      why: tpl.why,
      recommendedNow: tpl.now,
      risk: tpl.risk,
      gain: tpl.gain,
      priorities: tpl.priority,
    };
    var list = [];
    try { list = JSON.parse(localStorage.getItem(ADVICE_KEY) || '[]'); } catch (e) {}
    list.unshift(advice);
    if (list.length > 30) list.length = 30;
    try { localStorage.setItem(ADVICE_KEY, JSON.stringify(list)); } catch (e) {}
    if (window.COCO) COCO.lastAiAdvice = advice;
    return advice;
  }

  function getLatest() {
    try {
      var list = JSON.parse(localStorage.getItem(ADVICE_KEY) || '[]');
      return list[0] || null;
    } catch (e) { return null; }
  }

  window.AiStageAdvisor = {
    VERSION: VERSION,
    advise: advise,
    getLatest: getLatest,
    getAll: function () { try { return JSON.parse(localStorage.getItem(ADVICE_KEY) || '[]'); } catch (e) { return []; } },
  };
})();
