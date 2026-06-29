/**
 * AI Business Strategy Wizard — compiled from approved design (1:1)
 */
(function () {
  'use strict';
  var rootEl = null;
  var shellHtml = "<!-- TOPBAR -->\n<div class=\"tb\">\n  <div class=\"logo\"><div class=\"dot\"></div>CO.CO <em>דליה</em> — אסטרטגיית שיווק AI</div>\n  <div style=\"display:flex;gap:6px;align-items:center;\">\n    <span id=\"tb-client\" style=\"font-size:11px;color:var(--w50);\"></span>\n    <span style=\"font-size:10px;padding:2px 9px;border-radius:99px;background:rgba(245,158,11,.15);color:var(--yel);border:1px solid rgba(245,158,11,.25);\">Staging</span>\n  </div>\n</div>\n \n<!-- WIZARD -->\n<div class=\"wiz\">\n  <div class=\"steps\" id=\"steps\"></div>\n  <div class=\"pb\"><div class=\"pf\" id=\"pf\" style=\"width:14%\"></div></div>\n</div>\n \n<div class=\"main\">\n \n<!-- ══ TAB 1: KNOW THE BUSINESS ══ -->\n<div class=\"pane on\" id=\"p1\">\n  <div class=\"ph\"><div class=\"ph-t\">🏢 הכרת העסק</div><div class=\"ph-s\">ה-AI לומד את העסק לפני כל המלצה. ככל שתיתן יותר מידע — האסטרטגיה תהיה מדויקת יותר.</div><hr class=\"ph-r\"></div>\n \n  <div class=\"sec\" style=\"padding-bottom:6px;\">\n    <div class=\"st\">פרטי העסק</div>\n    <div class=\"card\">\n      <div class=\"g2\">\n        <div class=\"fl\"><label>שם העסק *</label><input class=\"inp\" id=\"b-name\" placeholder=\"גרין-טק פתרונות בע&quot;מ\"></div>\n        <div class=\"fl\"><label>תחום פעילות *</label><input class=\"inp\" id=\"b-sector\" placeholder=\"ניהול צי רכב\"></div>\n        <div class=\"fl\"><label>כתובת אתר</label><input class=\"inp\" id=\"b-site\" placeholder=\"https://\"></div>\n        <div class=\"fl\"><label>מיקום</label><input class=\"inp\" id=\"b-loc\" placeholder=\"תל-אביב | כל הארץ\"></div>\n        <div class=\"fl\"><label>ותק</label><input class=\"inp\" id=\"b-age\" placeholder=\"8 שנים\"></div>\n        <div class=\"fl\"><label>גודל עסק</label>\n          <select class=\"inp\" id=\"b-size\">\n            <option value=\"\">בחר...</option><option>עצמאי / פרילנסר</option>\n            <option>מיקרו (1-5)</option><option>קטן (6-20)</option>\n            <option>בינוני (21-100)</option><option>גדול (100+)</option>\n          </select>\n        </div>\n      </div>\n    </div>\n \n    <div class=\"st\" style=\"margin-top:16px;\">שירותים ויתרונות</div>\n    <div class=\"card\">\n      <div class=\"fl\"><label>שירות / מוצר מרכזי (הכי רווחי)</label><input class=\"inp\" id=\"b-main\" placeholder=\"ניהול צי GPS לעסקים\"></div>\n      <div class=\"fl\"><label>כל השירותים (הפרד בפסיקים)</label><textarea class=\"inp ta\" id=\"b-services\" placeholder=\"ניהול צי GPS, ביטוח צי, תחזוקה מונעת, מימון רכב...\"></textarea></div>\n      <div class=\"fl\"><label>מה הבידול שלך? למה לבחור בך?</label><textarea class=\"inp ta\" id=\"b-diff\" style=\"min-height:70px;\" placeholder=\"25 שנות ניסיון, שירות טכנאי בשטח, אפליקציה ייחודית...\"></textarea></div>\n      <div class=\"fl\"><label>מה הכאב שאתה פותר?</label><input class=\"inp\" id=\"b-pain\" placeholder=\"עלויות צי גבוהות, תקלות בלתי צפויות...\"></div>\n      <div class=\"fl\"><label>מה ה-USP שלך (Unique Selling Proposition)?</label><input class=\"inp\" id=\"b-usp\" placeholder=\"החיסכון הממוצע ללקוח שלנו הוא 23%...\"></div>\n    </div>\n \n    <div class=\"st\" style=\"margin-top:16px;\">קהל יעד</div>\n    <div class=\"card\">\n      <div class=\"fl\"><label>לקוח אידיאלי</label><input class=\"inp\" id=\"b-ideal\" placeholder=\"מנהל לוגיסטיקה / בעל עסק עם 5+ רכבים\"></div>\n      <div class=\"fl\"><label>לקוח שלא מתאים</label><input class=\"inp\" id=\"b-bad\" placeholder=\"עצמאים עם רכב אחד, לקוחות פרטיים...\"></div>\n      <div class=\"fl\"><label>תחומי לקוחות נפוצים</label></div>\n      <div class=\"chips\" id=\"sec-chips\">\n        <div class=\"chip\" onclick=\"tc(this)\">לוגיסטיקה</div><div class=\"chip\" onclick=\"tc(this)\">בנייה</div>\n        <div class=\"chip\" onclick=\"tc(this)\">פיזור ואספקה</div><div class=\"chip\" onclick=\"tc(this)\">בריאות</div>\n        <div class=\"chip\" onclick=\"tc(this)\">ביטחון ושמירה</div><div class=\"chip\" onclick=\"tc(this)\">ממשל</div>\n        <div class=\"chip\" onclick=\"tc(this)\">מסחר</div><div class=\"chip\" onclick=\"tc(this)\">תיירות</div>\n        <div class=\"chip\" onclick=\"tc(this)\">מוסכים</div><div class=\"chip\" onclick=\"tc(this)\">אחר</div>\n      </div>\n    </div>\n \n    <div class=\"st\" style=\"margin-top:16px;\">העלאת חומרים</div>\n    <div class=\"card\">\n      <div class=\"upz\" id=\"upz\" onclick=\"document.getElementById('fi').click()\" ondragover=\"dov(event)\" ondragleave=\"dlv()\" ondrop=\"ddr(event)\">\n        <div style=\"font-size:28px;margin-bottom:6px;\">📁</div>\n        <div style=\"font-size:13px;font-weight:700;margin-bottom:3px;\">גרור קבצים או לחץ</div>\n        <div style=\"font-size:11px;color:var(--w50)\">PDF, Word, Excel, PPT, תמונות</div>\n      </div>\n      <input type=\"file\" id=\"fi\" multiple accept=\".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.png\" style=\"display:none\" onchange=\"hf(this.files)\">\n      <div id=\"fl2\"></div>\n      <div style=\"display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;\">\n        <input class=\"inp\" id=\"site-url\" placeholder=\"🌐 קישור לאתר לסריקה\" style=\"flex:1;\">\n        <button class=\"btn btn-g btn-sm\" onclick=\"addUrl()\">+ הוסף</button>\n      </div>\n      <div id=\"url-list\"></div>\n      <div class=\"fl\" style=\"margin-top:10px;\"><label>תיאור חופשי / מידע נוסף</label><textarea class=\"inp ta\" id=\"b-free\" placeholder=\"כל מידע נוסף על העסק, שירותים, לקוחות, הצלחות...\"></textarea></div>\n    </div>\n \n    <div class=\"st\" style=\"margin-top:16px;\">מטרות ואתגרים</div>\n    <div class=\"card\">\n      <div class=\"fl\"><label>מטרה עסקית ל-12 חודשים</label><textarea class=\"inp ta\" id=\"b-goal\" style=\"min-height:65px;\" placeholder=\"להגדיל לקוחות מ-30 ל-80, להרחיב לצפון...\"></textarea></div>\n      <div class=\"fl\"><label>אתגרים עיקריים</label></div>\n      <div class=\"chips\" id=\"chal-chips\">\n        <div class=\"chip\" onclick=\"tc(this)\">מעט לידים</div><div class=\"chip\" onclick=\"tc(this)\">מתחרים זולים</div>\n        <div class=\"chip\" onclick=\"tc(this)\">חוסר מודעות</div><div class=\"chip\" onclick=\"tc(this)\">אחוז סגירה נמוך</div>\n        <div class=\"chip\" onclick=\"tc(this)\">מוניטין / ביקורות</div><div class=\"chip\" onclick=\"tc(this)\">אתר ישן</div>\n        <div class=\"chip\" onclick=\"tc(this)\">אין תוכן שיווקי</div><div class=\"chip\" onclick=\"tc(this)\">תקציב מוגבל</div>\n      </div>\n      <div class=\"fl\" style=\"margin-top:10px;\"><label>מתחרים עיקריים</label><textarea class=\"inp ta\" id=\"b-comp\" style=\"min-height:60px;\" placeholder=\"מתחרה א׳ – www.comp1.co.il&#10;מתחרה ב׳ – www.comp2.co.il\"></textarea></div>\n      <div class=\"fl\"><label>היתרון שלך עליהם</label><input class=\"inp\" id=\"b-vs\" placeholder=\"ניסיון, מחיר, שירות, טכנולוגיה...\"></div>\n      <div class=\"fl\"><label>תקציב שיווק חודשי משוער</label>\n        <select class=\"inp\" id=\"b-budget\">\n          <option value=\"\">בחר...</option><option>עד ₪3,000</option><option>₪3,000-6,000</option>\n          <option>₪6,000-10,000</option><option>₪10,000-20,000</option><option>₪20,000+</option>\n          <option>גמיש / תלוי תוצאות</option>\n        </select>\n      </div>\n    </div>\n  </div>\n</div>\n \n<!-- ══ TAB 2: CONNECT ASSETS ══ -->\n<div class=\"pane\" id=\"p2\">\n  <div class=\"ph\"><div class=\"ph-t\">🔗 חיבור נכסים דיגיטליים</div><div class=\"ph-s\">סמן אילו נכסים קיימים ופתח כל פריט לפרטי החיבור. לא חייב לחבר הכל עכשיו.</div><hr class=\"ph-r\"></div>\n  <div class=\"sec\">\n    <div class=\"alt alt-i\" style=\"margin-bottom:14px;\">ℹ️ לחץ על כל פלטפורמה לראות מה צריך לחבר ולהזין את הפרטים. Cursor ישתמש במידע זה להתחברות טכנית.</div>\n    <div id=\"plat-list\" class=\"plat-list\"></div>\n  </div>\n</div>\n \n<!-- ══ TAB 3: AI ANALYSIS ══ -->\n<div class=\"pane\" id=\"p3\">\n  <div class=\"ph\"><div class=\"ph-t\">🧠 ניתוח AI</div><div class=\"ph-s\">הצוות לומד את העסק, מנתח שוק ומתחרים, ובונה אסטרטגיה מקצועית.</div><hr class=\"ph-r\"></div>\n  <div class=\"sec\">\n    <div class=\"st\">צוות AI קבוע — עובד אוטומטית</div>\n    <div style=\"display:flex;flex-direction:column;gap:7px;margin-bottom:16px;\" id=\"agents-list\"></div>\n    <div class=\"ai-box\" id=\"ai-box\">\n      <div class=\"ai-hd\"><div class=\"dot\"></div>AI בניתוח מעמיק...</div>\n      <div id=\"ai-log\"></div>\n    </div>\n    <div id=\"ana-ready\" style=\"text-align:center;padding:20px 0;\">\n      <div style=\"font-size:32px;margin-bottom:10px;\">🚀</div>\n      <div style=\"font-size:15px;font-weight:700;margin-bottom:6px;\">מוכן לניתוח</div>\n      <div style=\"font-size:12px;color:var(--w50);margin-bottom:18px;\">הצוות ינתח את כל המידע שסיפקת ויבנה אסטרטגיה מקצועית.</div>\n      <button class=\"btn btn-p\" style=\"font-size:13px;padding:11px 26px;\" onclick=\"startAnalysis()\">▶ הפעל ניתוח AI</button>\n    </div>\n    <div id=\"ana-done\" style=\"display:none;\">\n      <div class=\"alt alt-ok\">✅ ניתוח הושלם. ה-AI בנה דוח אסטרטגיה מלא. עבור לטאב \"דוח ללקוח\" לסקירה ואישור.</div>\n    </div>\n  </div>\n</div>\n \n<!-- ══ TAB 4: CLIENT REPORT ══ -->\n<div class=\"pane\" id=\"p4\">\n  <div class=\"ph\"><div class=\"ph-t\">📄 דוח אסטרטגיה — ללקוח</div><div class=\"ph-s\">דוח מקצועי ברמת משרד שיווק. קרא, ערוך במידת הצורך, ושלח לאישור הלקוח.</div><hr class=\"ph-r\"></div>\n  <div class=\"sec\">\n    <div class=\"alt alt-w\" style=\"margin-bottom:14px;\">⚠️ בדוק שכל המידע נכון לפני שליחה ללקוח. ניתן לערוך כל שדה.</div>\n \n    <!-- Score + header -->\n    <div class=\"rep\">\n      <div class=\"score-wrap\">\n        <div class=\"score-circle\"><div class=\"score-num\" id=\"rep-score\" style=\"color:var(--green)\">87</div><div class=\"score-lbl\">ציון הבנה</div></div>\n        <div>\n          <div style=\"font-size:16px;font-weight:900;\" id=\"rep-name\">—</div>\n          <div style=\"font-size:11px;color:var(--w50);margin-top:3px;\" id=\"rep-head\">—</div>\n          <div style=\"display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;\" id=\"rep-badges\"></div>\n        </div>\n      </div>\n    </div>\n \n    <!-- א. Executive Summary -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">א. תקציר מנהלים</div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">מי העסק</div><div class=\"rep-val\" id=\"r-who\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">הבעיה המרכזית</div><div class=\"rep-val\" id=\"r-problem\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">ההזדמנות</div><div class=\"rep-val\" id=\"r-opp\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">ההמלצה שלנו</div><div class=\"rep-val\" id=\"r-rec\">—</div></div>\n    </div>\n \n    <!-- ב. Target Audience -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ב. קהל יעד</div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">קהל ראשי</div><div class=\"rep-val\" id=\"r-ta-main\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">בעלי תפקידים</div><div class=\"rep-val\" id=\"r-ta-roles\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">תחומי עניין</div><div class=\"rep-val\" id=\"r-ta-int\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">כדאי לפנות</div><div class=\"rep-val\" id=\"r-ta-yes\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">לא כדאי לפנות</div><div class=\"rep-val\" id=\"r-ta-no\">—</div></div>\n    </div>\n \n    <!-- ג. Geography -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ג. אזורי פרסום מומלצים</div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">אזור ראשי</div><div class=\"rep-val\" id=\"r-geo-main\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">ערים להתחיל</div><div class=\"rep-val\" id=\"r-geo-cities\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">אסטרטגיה</div><div class=\"rep-val\" id=\"r-geo-str\">—</div></div>\n    </div>\n \n    <!-- ד. Keywords -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ד. מילות מפתח</div>\n      <div style=\"margin-bottom:8px;\">\n        <div style=\"font-size:10px;color:var(--w50);margin-bottom:5px;font-weight:700;\">ראשיות — SEO + PPC</div>\n        <div class=\"kw-grid\" id=\"r-kw-main\"></div>\n      </div>\n      <div style=\"margin-bottom:8px;\">\n        <div style=\"font-size:10px;color:var(--w50);margin-bottom:5px;font-weight:700;\">משניות — Long Tail</div>\n        <div class=\"kw-grid\" id=\"r-kw-long\"></div>\n      </div>\n      <div style=\"margin-bottom:8px;\">\n        <div style=\"font-size:10px;color:var(--red);margin-bottom:5px;font-weight:700;\">לא כדאי לקדם</div>\n        <div class=\"kw-grid\" id=\"r-kw-no\"></div>\n      </div>\n      <div class=\"rep-row\" style=\"margin-top:6px;\"><div class=\"rep-lbl\">מתאים לאורגני</div><div class=\"rep-val\" id=\"r-kw-seo\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">מתאים לממומן</div><div class=\"rep-val\" id=\"r-kw-ppc\">—</div></div>\n    </div>\n \n    <!-- ה. Competitors -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ה. מתחרים</div>\n      <div id=\"r-comp-list\" style=\"display:flex;flex-direction:column;gap:8px;margin-bottom:10px;\"></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">פער שניתן לנצל</div><div class=\"rep-val\" id=\"r-comp-gap\">—</div></div>\n    </div>\n \n    <!-- ו. Digital Assets -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ו. נכסים דיגיטליים</div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">נכסים חזקים</div><div class=\"rep-val\" id=\"r-assets-strong\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">נכסים חלשים</div><div class=\"rep-val\" id=\"r-assets-weak\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">יש לחבר</div><div class=\"rep-val\" id=\"r-assets-connect\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">לא להשתמש כרגע</div><div class=\"rep-val\" id=\"r-assets-skip\">—</div></div>\n    </div>\n \n    <!-- ז. Campaign Recommendation -->\n    <div class=\"rep\" style=\"border-color:rgba(37,99,235,.3);\">\n      <div class=\"rep-t\">ז. המלצת קמפיין</div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">סוג קידום</div><div class=\"rep-val\" id=\"r-camp-type\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">פלטפורמות</div><div class=\"rep-val\" id=\"r-camp-plat\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">למה פלטפורמות אלה?</div><div class=\"rep-val\" id=\"r-camp-why\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">האם מומלץ אורגני?</div><div class=\"rep-val\" id=\"r-seo\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">האם מומלץ ממומן?</div><div class=\"rep-val\" id=\"r-ppc\">—</div></div>\n    </div>\n \n    <!-- ח. Budget -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ח. תקציב מומלץ</div>\n      <div class=\"card\" style=\"background:var(--bg4);border:none;padding:0;margin-bottom:10px;\">\n        <table class=\"btable\">\n          <thead><tr><th>תרחיש</th><th>חודשי</th><th>יומי</th><th>עלות לליד</th><th>לידים משוערים</th></tr></thead>\n          <tbody id=\"r-budget-rows\"></tbody>\n        </table>\n      </div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">עלויות אורגני</div><div class=\"rep-val\" id=\"r-seo-cost\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">זמן לתוצאות SEO</div><div class=\"rep-val\" id=\"r-seo-time\">—</div></div>\n    </div>\n \n    <!-- ט. Forecast -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">ט. תחזית</div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">לידים צפויים/חודש</div><div class=\"rep-val\" id=\"r-leads\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">כניסות אורגניות</div><div class=\"rep-val\" id=\"r-traffic\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">זמן לשינוי משמעותי</div><div class=\"rep-val\" id=\"r-time\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">מדדים לבדיקה</div><div class=\"rep-val\" id=\"r-kpis\">—</div></div>\n      <div class=\"rep-row\"><div class=\"rep-lbl\">השפעה על מיתוג</div><div class=\"rep-val\" id=\"r-brand\">—</div></div>\n    </div>\n \n    <!-- י. Work Plan -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">י. תוכנית עבודה</div>\n      <div id=\"r-workplan\"></div>\n    </div>\n \n    <!-- SWOT -->\n    <div class=\"rep\">\n      <div class=\"rep-t\">יא. SWOT</div>\n      <div class=\"swot\">\n        <div class=\"swot-box\" style=\"border:1px solid rgba(34,197,94,.2)\"><div class=\"swot-t\" style=\"color:var(--green)\">💪 חוזקות</div><div class=\"swot-items\" id=\"sw-s\">—</div></div>\n        <div class=\"swot-box\" style=\"border:1px solid rgba(239,68,68,.2)\"><div class=\"swot-t\" style=\"color:var(--red)\">⚠️ חולשות</div><div class=\"swot-items\" id=\"sw-w\">—</div></div>\n        <div class=\"swot-box\" style=\"border:1px solid rgba(37,99,235,.2)\"><div class=\"swot-t\" style=\"color:var(--acc2)\">🚀 הזדמנויות</div><div class=\"swot-items\" id=\"sw-o\">—</div></div>\n        <div class=\"swot-box\" style=\"border:1px solid rgba(245,158,11,.2)\"><div class=\"swot-t\" style=\"color:var(--yel)\">🛡️ איומים</div><div class=\"swot-items\" id=\"sw-t\">—</div></div>\n      </div>\n    </div>\n \n    <div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;\">\n      <button class=\"btn btn-p\" onclick=\"showToast('📧 דוח נשלח ללקוח')\">📧 שלח ללקוח לאישור</button>\n      <button class=\"btn btn-g\" onclick=\"showToast('💾 הדוח נשמר')\">💾 שמור טיוטה</button>\n      <button class=\"btn btn-g\" onclick=\"showToast('🖨️ מדפיס...')\">🖨️ הדפס / PDF</button>\n    </div>\n  </div>\n</div>\n \n<!-- ══ TAB 5: APPROVE & HAND OFF ══ -->\n<div class=\"pane\" id=\"p5\">\n  <div class=\"ph\"><div class=\"ph-t\">✅ אישור ומעבר לעוזרים</div><div class=\"ph-s\">לאחר אישור הלקוח, הדוח מועבר לכל העוזרים. הם מתחילים לעבוד.</div><hr class=\"ph-r\"></div>\n  <div class=\"sec\">\n    <div class=\"alt alt-i\" style=\"margin-bottom:14px;\">ℹ️ המודול לא מחליף את העוזרים, המטרות והפעולות — הוא מזין אותם בנתונים מדויקים.</div>\n \n    <div class=\"st\">בדיקה סופית</div>\n    <div class=\"card\" style=\"margin-bottom:14px;\"><div id=\"cl\"></div></div>\n \n    <div class=\"st\" style=\"margin-top:16px;\">מה עובר לאן</div>\n    <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;\">\n      <div class=\"card\" style=\"text-align:center;\"><div style=\"font-size:22px;margin-bottom:5px;\">🤖</div><div style=\"font-size:12px;font-weight:700;\">עוזרים</div><div style=\"font-size:10px;color:var(--w50)\">יקבלו פרופיל עסקי + אסטרטגיה</div></div>\n      <div class=\"card\" style=\"text-align:center;\"><div style=\"font-size:22px;margin-bottom:5px;\">🎯</div><div style=\"font-size:12px;font-weight:700;\">20 מטרות</div><div style=\"font-size:10px;color:var(--w50)\">יותאמו לתחום ולקהל</div></div>\n      <div class=\"card\" style=\"text-align:center;\"><div style=\"font-size:22px;margin-bottom:5px;\">⚙️</div><div style=\"font-size:12px;font-weight:700;\">פעולות</div><div style=\"font-size:10px;color:var(--w50)\">יוצרו מהמלצות הדוח</div></div>\n      <div class=\"card\" style=\"text-align:center;\"><div style=\"font-size:22px;margin-bottom:5px;\">📊</div><div style=\"font-size:12px;font-weight:700;\">דוחות</div><div style=\"font-size:10px;color:var(--w50)\">ינוטרו לפי מדדים שנקבעו</div></div>\n    </div>\n \n    <div class=\"st\" style=\"margin-top:16px;\">Business Context — JSON</div>\n    <div class=\"card\" style=\"background:var(--bg4);\">\n      <pre id=\"ctx-json\" style=\"font-size:10px;color:var(--acc2);font-family:monospace;overflow-x:auto;line-height:1.8;white-space:pre-wrap;max-height:220px;overflow-y:auto;\"></pre>\n    </div>\n \n    <div id=\"exported\" style=\"display:none;margin-top:14px;\">\n      <div class=\"alt alt-ok\">✅ הדוח הועבר בהצלחה! העוזרים מתחילים. עבור למנהל השיווק AI לראות התקדמות.</div>\n      <div style=\"display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;\">\n        <button class=\"btn btn-p\" onclick=\"if(typeof goScreen==='function')goScreen('screen-agents');showToast('🚀 עובר למנהל השיווק...')\">פתח מנהל השיווק ←</button>\n        <button class=\"btn btn-g\" onclick=\"showToast('📧 נשלח ל-Gmail')\">📧 שלח ל-Gmail</button>\n      </div>\n    </div>\n  </div>\n</div>\n \n</div><!-- /main -->\n \n<!-- FOOTER -->\n<div class=\"footer\">\n  <div class=\"footer-hint\" id=\"fhint\">מלא פרטי עסק ולחץ \"הבא\"</div>\n  <div style=\"display:flex;gap:8px;\">\n    <button class=\"btn btn-g btn-sm\" id=\"btn-back\" onclick=\"prevT()\" style=\"display:none;\">← חזרה</button>\n    <button class=\"btn btn-p btn-sm\" id=\"btn-next\" onclick=\"nextT()\">הבא ←</button>\n  </div>\n</div>\n<div id=\"toast\"></div>";


// ── PLATFORMS DATA ──
const PLATFORMS = [
  {key:'website',icon:'🌐',name:'אתר אינטרנט',cat:'Google',
   data:'URL המלא, Sitemap אם קיים, גישת CMS',
   gets:'מבנה עמודים, תוכן, PageSpeed, SEO, Meta Tags, Links',
   fields:[{l:'כתובת URL',p:'https://www.example.co.il',k:'url'},{l:'CMS (WordPress/Wix...)',p:'WordPress',k:'cms'},{l:'Sitemap URL',p:'/sitemap.xml',k:'sitemap'}]},
  {key:'gsc',icon:'🔎',name:'Google Search Console',cat:'Google',
   data:'OAuth / הרשאת Google Account, Property URL',
   gets:'מילות מפתח, מיקומים, CTR, שגיאות אינדוקס, Core Web Vitals',
   fields:[{l:'Property URL',p:'https://www.example.co.il',k:'gsc-url'},{l:'Google Account (OAuth)',p:'user@gmail.com',k:'gsc-acc'}]},
  {key:'ga4',icon:'📊',name:'Google Analytics 4',cat:'Google',
   data:'OAuth, Measurement ID / Property ID',
   gets:'כניסות, סשנים, המרות, Bounce Rate, מקורות תנועה',
   fields:[{l:'Measurement ID',p:'G-XXXXXXXXXX',k:'ga4-id'},{l:'Property ID',p:'123456789',k:'ga4-prop'}]},
  {key:'gbp',icon:'📍',name:'Google Business Profile',cat:'Google',
   data:'OAuth, Business ID / Location ID',
   gets:'ביקורות, דירוג, צפיות בכרטיס, שאלות, פוסטים, פניות',
   fields:[{l:'Business ID',p:'123456789',k:'gbp-id'},{l:'Location ID',p:'...',k:'gbp-loc'}]},
  {key:'gads',icon:'📢',name:'Google Ads',cat:'Google',
   data:'Customer ID, OAuth, הרשאת Manager Account',
   gets:'קמפיינים, תקציב, ROAS, קליקים, CPC, המרות, Quality Score',
   fields:[{l:'Customer ID',p:'123-456-7890',k:'gads-id'},{l:'MCC Manager ID',p:'...',k:'gads-mcc'}]},
  {key:'fb',icon:'📘',name:'Facebook Page',cat:'Meta',
   data:'Page ID, Business Manager, Access Token, הרשאות Meta',
   gets:'עוקבים, פוסטים, reach, אינטראקציה, לידים',
   fields:[{l:'Page ID',p:'123456789',k:'fb-id'},{l:'Access Token',p:'EAA...',k:'fb-token'}]},
  {key:'fbads',icon:'📢',name:'Facebook Ads',cat:'Meta',
   data:'Ad Account ID, Access Token, Business Manager',
   gets:'קמפיינים, ROAS, CPL, נתוני קהל, המרות',
   fields:[{l:'Ad Account ID',p:'act_123456789',k:'fbads-id'},{l:'Business Manager ID',p:'...',k:'fbads-bm'}]},
  {key:'ig',icon:'📸',name:'Instagram',cat:'Meta',
   data:'Business Account, OAuth דרך Meta',
   gets:'עוקבים, Reach, Impressions, Engagement, Stories',
   fields:[{l:'Instagram Account',p:'@handle',k:'ig-acc'}]},
  {key:'igads',icon:'📸',name:'Instagram Ads',cat:'Meta',
   data:'מחובר דרך Facebook Ads, Ad Account ID',
   gets:'נתוני קמפיינים, CPM, CPL, Reach',
   fields:[{l:'Ad Account ID (כ-FB)',p:'act_123',k:'igads-id'}]},
  {key:'wa',icon:'💬',name:'WhatsApp Business',cat:'Meta',
   data:'Business Account ID, Phone Number ID, Token, Webhook URL',
   gets:'הודעות, שיחות, לידים, תבניות שנשלחו',
   fields:[{l:'Business Account ID',p:'...',k:'wa-bid'},{l:'Phone Number ID',p:'...',k:'wa-phone'},{l:'Token',p:'EAA...',k:'wa-token'},{l:'Webhook URL',p:'https://...',k:'wa-hook'}]},
  {key:'li',icon:'💼',name:'LinkedIn',cat:'LinkedIn',
   data:'Company Page ID, OAuth',
   gets:'עוקבים, Impressions, Engagement, לידים',
   fields:[{l:'Company Page ID',p:'123456',k:'li-id'}]},
  {key:'liads',icon:'💼',name:'LinkedIn Ads',cat:'LinkedIn',
   data:'Ads Account ID, OAuth',
   gets:'קמפיינים, CPL, CTR, נתוני קהל B2B',
   fields:[{l:'Ads Account ID',p:'123456789',k:'liads-id'}]},
  {key:'tiktok',icon:'🎵',name:'TikTok',cat:'TikTok',
   data:'Business Center, TikTok For Business Account',
   gets:'עוקבים, צפיות, אינטראקציה, Reach',
   fields:[{l:'Business Center ID',p:'...',k:'tt-id'}]},
  {key:'tiktokads',icon:'🎵',name:'TikTok Ads',cat:'TikTok',
   data:'Ad Account ID, Token מה-Business Center',
   gets:'קמפיינים, CPL, CPM, נתוני קהל',
   fields:[{l:'Ad Account ID',p:'...',k:'ttads-id'},{l:'Token',p:'...',k:'ttads-token'}]},
  {key:'yt',icon:'▶️',name:'YouTube',cat:'Google',
   data:'Channel ID, OAuth דרך Google',
   gets:'מנויים, צפיות, Watch Time, קהל, Traffic Sources',
   fields:[{l:'Channel ID',p:'UC...',k:'yt-id'}]},
  {key:'ytads',icon:'▶️',name:'YouTube Ads',cat:'Google',
   data:'דרך Google Ads, Customer ID',
   gets:'נתוני Video Ads, CPV, View Rate, Reach',
   fields:[{l:'Google Ads Customer ID',p:'כבר קיים',k:'ytads-id'}]},
  {key:'ms',icon:'🖥️',name:'Microsoft Ads',cat:'אחר',
   data:'Customer ID, Account ID, OAuth',
   gets:'Bing PPC, Microsoft Audience Network, קמפיינים',
   fields:[{l:'Customer ID',p:'...',k:'ms-id'},{l:'Account ID',p:'...',k:'ms-acc'}]},
  {key:'waze',icon:'🗺️',name:'Waze Ads',cat:'אחר',
   data:'Account ID, API Access',
   gets:'נוסעים שנחשפו, מיקום, Impressions',
   fields:[{l:'Account ID',p:'...',k:'waze-id'}]},
  {key:'taboola',icon:'📰',name:'Taboola',cat:'אחר',
   data:'Account ID, Token',
   gets:'Native Ads, כניסות, CTR, CPC',
   fields:[{l:'Account ID',p:'...',k:'tab-id'},{l:'Token',p:'...',k:'tab-token'}]},
  {key:'outbrain',icon:'📰',name:'Outbrain',cat:'אחר',
   data:'Account ID, Token',
   gets:'Native Ads, כניסות, CTR',
   fields:[{l:'Account ID',p:'...',k:'ob-id'},{l:'Token',p:'...',k:'ob-token'}]},
  {key:'pinterest',icon:'📌',name:'Pinterest',cat:'אחר',
   data:'Business Account, OAuth',
   gets:'Pins, Impressions, Clicks, Save Rate',
   fields:[{l:'Business ID',p:'...',k:'pin-id'}]},
  {key:'x',icon:'✖️',name:'X / Twitter',cat:'אחר',
   data:'Developer Account, Bearer Token, API Keys',
   gets:'ציוצים, Followers, Impressions, Engagement',
   fields:[{l:'Bearer Token',p:'AAAA...',k:'x-token'}]},
  {key:'threads',icon:'🧵',name:'Threads',cat:'Meta',
   data:'דרך Meta / Instagram Account',
   gets:'פוסטים, Followers, Engagement',
   fields:[{l:'Instagram Account (מחובר)',p:'@handle',k:'threads-acc'}]},
  {key:'reddit',icon:'🔴',name:'Reddit',cat:'אחר',
   data:'Ads Account אם יש',
   gets:'Posts, Karma, Community Reach',
   fields:[{l:'Username',p:'u/...',k:'reddit-u'}]},
  {key:'quora',icon:'❓',name:'Quora',cat:'אחר',
   data:'Business Account / Ads Account',
   gets:'Answers, Views, Ads אם יש',
   fields:[{l:'Profile URL',p:'https://quora.com/profile/...',k:'quora-url'}]},
  {key:'tg',icon:'✈️',name:'Telegram',cat:'אחר',
   data:'Bot Token, Channel ID',
   gets:'מנויים, הודעות, Views',
   fields:[{l:'Channel Link',p:'https://t.me/...',k:'tg-link'},{l:'Bot Token (אם יש)',p:'...',k:'tg-bot'}]},
  {key:'hs',icon:'🎯',name:'HubSpot',cat:'CRM',
   data:'API Key / OAuth',
   gets:'Contacts, Deals, Emails, נתוני CRM',
   fields:[{l:'API Key',p:'...',k:'hs-key'},{l:'Portal ID',p:'...',k:'hs-portal'}]},
  {key:'mc',icon:'📧',name:'Mailchimp',cat:'CRM',
   data:'API Key, Audience ID',
   gets:'רשימות, Campaigns, Open Rate, Click Rate',
   fields:[{l:'API Key',p:'...-usX',k:'mc-key'},{l:'Audience ID',p:'...',k:'mc-aud'}]},
  {key:'ac',icon:'🔁',name:'ActiveCampaign',cat:'CRM',
   data:'API Key, Account URL',
   gets:'Contacts, Automations, Deals, Email Stats',
   fields:[{l:'API Key',p:'...',k:'ac-key'},{l:'Account URL',p:'https://XXXX.activehosted.com',k:'ac-url'}]},
  {key:'crm',icon:'👥',name:'CRM',cat:'CRM',
   data:'API / Export / Integration בהתאם למערכת',
   gets:'לקוחות, לידים, עסקאות, היסטוריה',
   fields:[{l:'סוג CRM',p:'Salesforce / Monday / ...',k:'crm-type'},{l:'API Key / URL',p:'...',k:'crm-api'}]},
  {key:'blog',icon:'📝',name:'Blog',cat:'תוכן',
   data:'URL, גישת CMS אם נרצה לכתוב',
   gets:'מאמרים, תנועה לתוכן, Backlinks',
   fields:[{l:'Blog URL',p:'https://site.co.il/blog',k:'blog-url'}]},
  {key:'lp',icon:'📄',name:'Landing Pages',cat:'תוכן',
   data:'URLים של דפי הנחיתה',
   gets:'Conversion Rate, תנועה, לידים',
   fields:[{l:'Landing Pages (הפרד בפסיקים)',p:'https://.../lp1, ...',k:'lp-urls'}]},
  {key:'app',icon:'📱',name:'אפליקציה',cat:'תוכן',
   data:'App Store / Play Store URL, SDK אם יש',
   gets:'הורדות, Active Users, Reviews, Ratings',
   fields:[{l:'App Store URL',p:'https://apps.apple.com/...',k:'app-ios'},{l:'Play Store URL',p:'https://play.google.com/...',k:'app-android'}]},
  {key:'domains',icon:'🌍',name:'דומיינים נוספים',cat:'תוכן',
   data:'רשימת דומיינים',
   gets:'תנועה, Backlinks, Authority',
   fields:[{l:'דומיינים (הפרד בפסיקים)',p:'domain1.co.il, domain2.com',k:'domains-list'}]},
];
 
const AI_AGENTS = [
  {icon:'💬',name:'ChatGPT',color:'#10a37f',task:'אסטרטגיה, SWOT, המלצת פלטפורמות'},
  {icon:'🧠',name:'Claude',color:'#cc785c',task:'תוכן, SEO, מילות מפתח, שפה שיווקית'},
  {icon:'🔷',name:'Gemini',color:'#4285f4',task:'ניתוח Google, Search Console, Ads'},
  {icon:'🔍',name:'SEO Assistant',color:'#059669',task:'מחקר מילות מפתח, מתחרים, דירוגים'},
  {icon:'✍️',name:'Content Assistant',color:'#7c3aed',task:'תוכן אתר, Blog, Landing Pages'},
  {icon:'📢',name:'Ads Assistant',color:'#dc2626',task:'קמפיינים ממומנים, ROI, תקציב'},
  {icon:'🔷',name:'Google Assistant',color:'#1a73e8',task:'GBP, Maps, Reviews, Local SEO'},
  {icon:'📊',name:'Reports Assistant',color:'#0891b2',task:'מדדים, KPIs, תחזיות'},
  {icon:'👥',name:'CRM Assistant',color:'#65a30d',task:'לידים, CRM, אוטומציות'},
];
 
const LOG_STEPS = [
  '📖 קורא חומרים שהועלו...',
  '🌐 סורק את האתר ומנתח...',
  '🏆 מנתח מתחרים...',
  '🔍 מחקר מילות מפתח...',
  '👥 בונה פרופיל קהל יעד...',
  '🗺️ ממפה אזורי פרסום...',
  '📊 מנתח נכסים דיגיטליים...',
  '💡 בונה SWOT...',
  '📢 קובע המלצת קמפיין...',
  '💰 מחשב תחזית תקציב...',
  '📅 בונה תוכנית עבודה...',
  '✅ הדוח מוכן!',
];
 
const HINTS = ['מלא פרטים ולחץ "הבא"','חבר נכסים רלוונטיים','הפעל ניתוח AI','קרא ואשר את הדוח','שלח לאישור הלקוח'];
 
// ── STATE ──
const S = { tab:1, max:1, files:[], urls:[], analysed:false, data:{} };
 
// ── BUILD WIZARD ──
const STEP_LABELS = ['🏢 הכרת עסק','🔗 חיבור נכסים','🧠 ניתוח AI','📄 דוח ללקוח','✅ אישור'];
function buildWiz(){
  const el=document.getElementById('steps');
  el.innerHTML=STEP_LABELS.map((l,i)=>`<div class="step ${i===0?'active':'locked'}" id="ws${i+1}" onclick="goT(${i+1})"><div class="sn">${i+1}</div>${l}</div>`).join('');
}

// ── BUILD PLATFORMS ──
function buildPlats(){
  const el=document.getElementById('plat-list');
  el.innerHTML=PLATFORMS.map(p=>`
  <div class="plat" id="pc-${p.key}">
    <div class="plat-hd" onclick="togglePlat('${p.key}')">
      <span class="plat-icon">${p.icon}</span>
      <span class="plat-name">${p.name}</span>
      <span class="bd bd-x plat-st" id="ps-${p.key}">לא מחובר</span>
      <span class="plat-ch" id="pch-${p.key}">▼</span>
    </div>
    <div class="plat-body" id="pb-${p.key}">
      <div class="plat-section">
        <div class="plat-section-t">מה צריך מהלקוח</div>
        <div class="plat-info">${p.data}</div>
      </div>
      <div class="plat-section">
        <div class="plat-section-t">מה נקבל מהחיבור</div>
        <div class="plat-info">${p.gets}</div>
      </div>
      <div class="plat-fields">
        ${p.fields.map(f=>`<div class="fl" style="margin-bottom:6px;"><label>${f.l}</label><input class="inp" id="${f.k}" placeholder="${f.p}"></div>`).join('')}
      </div>
      <div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap;">
        <button class="btn btn-p btn-sm" onclick="connectPlat('${p.key}')">🔗 חבר</button>
        <button class="btn btn-g btn-sm" onclick="showToast('📋 הוראות ${p.name}')">📋 הוראות</button>
        <button class="btn btn-re btn-sm" onclick="disconnectPlat('${p.key}')">✕ נתק</button>
      </div>
    </div>
  </div>`).join('');
}

// ── BUILD AGENTS ──
function buildAgents(){
  const el=document.getElementById('agents-list');
  el.innerHTML=AI_AGENTS.map(a=>`
  <div class="agent-row">
    <div class="ag-ico" style="background:${a.color}22;border:1px solid ${a.color}44;">${a.icon}</div>
    <div style="flex:1;"><div class="ag-name">${a.name}</div><div class="ag-task">${a.task}</div></div>
    <span class="bd bd-x" id="ag-${a.name.replace(/\s/g,'')}" style="font-size:10px;">ממתין</span>
  </div>`).join('');
}

// ── PLATFORM ACTIONS ──
function togglePlat(key){
  const body=document.getElementById('pb-'+key);
  const ch=document.getElementById('pch-'+key);
  const isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  ch.style.transform=isOpen?'':'rotate(180deg)';
}
function connectPlat(key){
  var pel=document.getElementById('ps-'+key); if(!pel) return;
  pel.outerHTML=`<span class="bd bd-g plat-st" id="ps-${key}">● מחובר</span>`;
  showToast(`✅ ${key} חובר בהצלחה`);
}
function disconnectPlat(key){
  const el=document.getElementById('ps-'+key);
  if(el){el.outerHTML=`<span class="bd bd-x plat-st" id="ps-${key}">לא מחובר</span>`;}
  showToast(`🔌 ${key} נותק`);
}
function getConnected(){
  return PLATFORMS.filter(p=>document.getElementById('ps-'+p.key)?.textContent.includes('מחובר')).map(p=>p.name);
}
 
// ── UPLOAD ──
function dov(e){e.preventDefault();document.getElementById('upz').classList.add('drag');}
function dlv(){document.getElementById('upz').classList.remove('drag');}
function ddr(e){e.preventDefault();dlv();hf(e.dataTransfer.files);}
function hf(files){
  const exts={pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'🖼️',pptx:'🖼️',txt:'📋',jpg:'🖼️',png:'🖼️'};
  Array.from(files).forEach(f=>{
    S.files.push(f.name);
    const ext=f.name.split('.').pop().toLowerCase();
    const ic=exts[ext]||'📎';
    const div=document.createElement('div');
    div.className='fi';
    div.innerHTML=`<span>${ic}</span><span style="flex:1;font-size:12px">${f.name}</span><span style="font-size:10px;color:var(--w50)">${(f.size/1024).toFixed(0)}KB</span><button class="fi-rm" onclick="this.closest('.fi').remove()">✕</button>`;
    document.getElementById('fl2').appendChild(div);
  });
  if(files.length) showToast(`📁 ${files.length} קובץ נוסף`);
}
function addUrl(){
  const inp=document.getElementById('site-url');
  const u=inp.value.trim();
  if(!u){showToast('הזן URL');return;}
  S.urls.push(u);
  const div=document.createElement('div');
  div.className='fi';
  div.innerHTML=`<span>🌐</span><span style="flex:1;font-size:12px">${u}</span><span class="bd bd-b" style="font-size:10px;">נסרק</span><button class="fi-rm" onclick="this.closest('.fi').remove()">✕</button>`;
  document.getElementById('url-list').appendChild(div);
  inp.value='';showToast('🌐 URL נוסף');
}
 
// ── CHIPS ──
function tc(el){el.classList.toggle('on');}
function gChips(id){return[...document.querySelectorAll('#'+id+' .chip.on')].map(c=>c.textContent);}
 
// ── WIZARD NAV ──
function goT(n){
  if(n>S.max){showToast('השלם את השלב הנוכחי קודם');return;}
  S.tab=n;
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  document.getElementById('p'+n).classList.add('on');
  for(let i=1;i<=5;i++){
    const ws=document.getElementById('ws'+i);
    ws.className='step '+(i<n?'done':i===n?'active':i<=S.max?'':'locked');
    const sn=ws.querySelector('.sn');
    if(i<n) sn.textContent='✓';
    else sn.textContent=i;
  }
  document.getElementById('pf').style.width=(n/5*100)+'%';
  document.getElementById('btn-back').style.display=n>1?'':'none';
  document.getElementById('btn-next').textContent=n===5?'✅ אשר ושלח לעוזרים ←':'הבא ←';
  document.getElementById('fhint').textContent=HINTS[n-1]||'';
  if(n===4) buildReport();
  if(n===5) buildFinal();
  window.scrollTo(0,0);
}
function nextT(){
  const n=S.tab;
  if(n===1&&!v('b-name')&&!v('b-sector')){showToast('⚠️ שם עסק ותחום הם שדות חובה');return;}
  if(n===3&&!S.analysed){showToast('⚠️ לחץ "הפעל ניתוח AI" קודם');return;}
  if(n===5){exportData();return;}
  S.max=Math.max(S.max,n+1);
  collect();
  goT(n+1);
}
function prevT(){if(S.tab>1)goT(S.tab-1);}
 
// ── COLLECT ──
function collect(){
  S.data={
    name:v('b-name')||'—',sector:v('b-sector')||'—',site:v('b-site')||'',
    loc:v('b-loc')||'ישראל',size:v('b-size')||'',
    mainService:v('b-main')||'—',services:v('b-services')||'—',
    diff:v('b-diff')||'—',pain:v('b-pain')||'—',usp:v('b-usp')||'—',
    ideal:v('b-ideal')||'—',bad:v('b-bad')||'—',
    goal:v('b-goal')||'—',comp:v('b-comp')||'—',vs:v('b-vs')||'—',
    budget:v('b-budget')||'—',free:v('b-free')||'',
    sectors:gChips('sec-chips'),challenges:gChips('chal-chips'),
    files:S.files,urls:S.urls,connected:getConnected(),
  };
  const tc=document.getElementById('tb-client');
  if(S.data.name!=='—') tc.textContent=S.data.name;
}
function v(id){const e=document.getElementById(id);return e?e.value.trim():'';}
 
// ── AI ANALYSIS ──

function applySeedPrefill(seed) {
  if (!seed) return;
  S.data = Object.assign(S.data, seed);
  var set = function(id, val) { var e = document.getElementById(id); if (e && val != null && val !== '') e.value = val; };
  set('b-name', seed.name); set('b-sector', seed.sector); set('b-site', seed.site); set('b-loc', seed.loc);
  set('b-age', seed.age); set('b-size', seed.size); set('b-main', seed.mainService);
  set('b-services', seed.services); set('b-diff', seed.diff); set('b-pain', seed.pain); set('b-usp', seed.usp);
  set('b-ideal', seed.ideal); set('b-bad', seed.bad); set('b-goal', seed.goal); set('b-comp', seed.comp);
  set('b-vs', seed.vs); set('b-budget', seed.budget); set('b-free', seed.free);
  if (seed.site) { S.urls = seed.urls && seed.urls.length ? seed.urls.slice() : [seed.site]; }
  var tcEl = document.getElementById('tb-client');
  if (tcEl && seed.name) tcEl.textContent = seed.name;
  ['sec-chips', 'chal-chips'].forEach(function(cid) {
    var chips = cid === 'sec-chips' ? (seed.sectors || []) : (seed.challenges || []);
    document.querySelectorAll('#' + cid + ' .chip').forEach(function(ch) {
      if (chips.indexOf(ch.textContent.trim()) >= 0) ch.classList.add('on');
    });
  });
  autoConnectPlatforms(seed.connected || []);
}

function autoConnectPlatforms(names) {
  var map = {
    'אתר אינטרנט': 'website', 'Google Search Console': 'gsc', 'Google Analytics 4': 'ga4',
    'Google Business Profile': 'gbp', 'Google Ads': 'gads'
  };
  names.forEach(function(n) {
    var key = map[n];
    if (key) connectPlat(key);
  });
}

function mergedLogSteps() {
  var extra = [];
  if (window.BusinessStrategyModule && BusinessStrategyModule.scanSiteInsights) {
    var sc = BusinessStrategyModule.scanSiteInsights();
    if (sc.log && sc.log.length) extra = sc.log;
  }
  return LOG_STEPS.map(function(s, i) { return extra[i] || s; });
}

function startAnalysis(){
  collect();
  document.getElementById('ana-ready').style.display='none';
  document.getElementById('ai-box').classList.add('show');
  const log=document.getElementById('ai-log');
  log.innerHTML=LOG_STEPS.map((s,i)=>`<div class="ai-line" id="al${i}">${s}</div>`).join('');
 
  AI_AGENTS.forEach((a,i)=>{
    const key=a.name.replace(/\s/g,'');
    setTimeout(()=>{
      const el=document.getElementById('ag-'+key);
      if(el){el.outerHTML=`<span class="bd bd-y" id="ag-${key}" style="font-size:10px;">עובד...</span>`;}
    },i*900);
    setTimeout(()=>{
      const el=document.getElementById('ag-'+key);
      if(el){el.outerHTML=`<span class="bd bd-g" id="ag-${key}" style="font-size:10px;">✓ סיים</span>`;}
    },i*900+1800);
  });
 
  mergedLogSteps().forEach((_,i)=>{
    setTimeout(()=>{const e=document.getElementById('al'+i);if(e)e.classList.add('show');},i*700+300);
  });
 
  setTimeout(()=>{
    S.analysed=true;
    document.getElementById('ana-done').style.display='block';
    S.max=Math.max(S.max,4);
    document.getElementById('ws4').className='step';
    showToast('✅ ניתוח הושלם!');
  }, mergedLogSteps().length*700+1200);
}
 
// ── REPORT ──
function set(id,val){const e=document.getElementById(id);if(e)e.textContent=val;}
function setHTML(id,html){const e=document.getElementById(id);if(e)e.innerHTML=html;}
 
function buildReport(){
  collect();
  const d=S.data;
  const budget=parseBudget(d.budget);
 
  set('rep-name',d.name);
  set('rep-head',(d.sector||'—')+' | '+(d.loc||'ישראל')+' | '+(d.size||''));
  setHTML('rep-badges',`<span class="bd bd-b">${d.sectors?.includes('לוגיסטיקה')||d.sector?.includes('צי')?'B2B':'B2B/B2C'}</span><span class="bd bd-g">שוק מוכח</span><span class="bd bd-y">תחרות גבוהה</span>${d.connected?.length>3?'<span class="bd bd-p">נכסים מחוברים</span>':''}`);
 
  const sc=60+Math.min(35,(d.files?.length||0)*4+(d.diff?.length||0)*0.05+(d.connected?.length||0)*2+(d.comp?.length||0)*0.05+(d.goal?.length||0)*0.08);
  const scEl=document.getElementById('rep-score');
  if(scEl){scEl.textContent=Math.round(sc);scEl.style.color=sc>=80?'var(--green)':sc>=65?'var(--yel)':'var(--red)';}
 
  // א. Summary
  set('r-who',`${d.name} — עסק ${d.size||'בינוני'} בתחום ${d.sector}. פועל ב${d.loc}. שירות מרכזי: ${d.mainService}.`);
  set('r-problem', d.challenges?.join(', ')||'לא צוין');
  set('r-opp','חיזוק נוכחות אורגנית בגוגל + Google Business + תוכן מקצועי יביאו לידים איכותיים ב-90 יום.');
  set('r-rec',`שילוב SEO + קמפיין ממומן ממוקד. להתחיל ב-Google Ads על "${d.mainService}" ובמקביל לבנות תוכן אורגני.`);
 
  // ב. קהל יעד
  set('r-ta-main',d.ideal||'לא צוין');
  set('r-ta-roles','מנהלי לוגיסטיקה, בעלי עסקים, מנהלי רכש, מנהלי תפעול');
  set('r-ta-int',d.sectors?.join(', ')||d.sector||'—');
  set('r-ta-yes',d.ideal||'—');
  set('r-ta-no',d.bad||'—');
 
  // ג. גאוגרפי
  const loc=d.loc||'ישראל';
  set('r-geo-main',loc.includes('הארץ')||loc.includes('ישראל')?'כל הארץ':loc);
  set('r-geo-cities','מרכז (ת"א, גוש דן) → צפון (חיפה, גליל) → דרום (באר שבע, אשדוד)');
  set('r-geo-str','התחל במרכז הארץ שם מרוכז הביקוש. הרחב לצפון ודרום לאחר 3 חודשים.');
 
  // ד. מילות מפתח
  const kMain=['ניהול צי','ניהול צי GPS','מעקב רכבים','ניהול רכבי עסק','GPS לצי'].map(k=>`<span class="kw high">${k}</span>`).join('');
  const kLong=['ניהול צי רכב לעסקים קטנים','תוכנה ניהול צי GPS','מערכת מעקב רכבים לעסקים','עלות ניהול צי','ניהול תחזוקת רכבים'].map(k=>`<span class="kw med">${k}</span>`).join('');
  const kNo=['רכב פרטי','מוסך פרטי','הלוואה לרכב','ביטוח רכב פרטי'].map(k=>`<span class="kw low" style="text-decoration:line-through;opacity:.6">${k}</span>`).join('');
  setHTML('r-kw-main',kMain);
  setHTML('r-kw-long',kLong);
  setHTML('r-kw-no',kNo);
  set('r-kw-seo','ניהול צי, GPS לצי, מעקב רכבים עסקי — תחרות גבוהה אך ROI גבוה');
  set('r-kw-ppc','ניהול צי רכב לעסקים, עלות ניהול צי — Intent גבוה, CPC: ₪8-25');
 
  // ה. מתחרים
  const comps=(d.comp||'').split('\n').filter(Boolean).slice(0,4);
  setHTML('r-comp-list', comps.length ? comps.map(c=>`
    <div style="padding:8px 10px;background:var(--bg4);border-radius:8px;font-size:12px;">
      <div style="font-weight:700;margin-bottom:3px;">${c.split('–')[0].trim()}</div>
      <div style="color:var(--w50)">חזקות: מותג ידוע, תקציב גדול</div>
      <div style="color:var(--green);margin-top:2px;">🎯 פער: שירות אישי, מחיר, התאמה לעסקים קטנים</div>
    </div>`).join(''):`<div style="font-size:12px;color:var(--w50);">לא הוזנו מתחרים ספציפיים — ה-AI ינתח בשלב הסריקה.</div>`);
  set('r-comp-gap',d.vs||'שירות אישי, ותק מוכח, טכנולוגיה ייחודית');
 
  // ו. נכסים
  const conn=d.connected||[];
  set('r-assets-strong',conn.filter(a=>['אתר אינטרנט','Google Business Profile','Facebook Page'].includes(a)).join(', ')||'—');
  set('r-assets-weak',conn.length<3?'רוב הנכסים לא מחוברים':'נכסים חלשים יזוהו בסריקה');
  set('r-assets-connect',conn.length?'✓ '+conn.length+' נכסים מחוברים':'Google Search Console, Google Analytics, Google Ads');
  set('r-assets-skip','TikTok, Pinterest — לא רלוונטי לקהל B2B בשלב זה');
 
  // ז. קמפיין
  const hasBudget=budget.monthly>0;
  set('r-camp-type',hasBudget?'שילוב: SEO אורגני + Google Ads ממומן':'SEO אורגני + Google Business (ללא תקציב גדול)');
  set('r-camp-plat','Google Ads (Search), Google Business Profile, SEO אורגני, LinkedIn (אופציונלי)');
  set('r-camp-why','הקהל מחפש פתרון ב-Google בדיוק כשיש צורך. Google Search Ads = Intent גבוה. SEO = ROI לטווח ארוך.');
  set('r-seo','✅ כן — קידום אורגני חיוני. זמן לתוצאות: 3-6 חודשים. ROI גבוה לטווח ארוך.');
  set('r-ppc',hasBudget?`✅ כן — Google Ads עם תקציב ${d.budget}. לידים מיידיים.`:'⚠️ תלוי תקציב — עם ₪5,000+/חודש מומלץ מאוד.');
 
  // ח. תקציב
  const rows=[
    {name:'מינימום',mon:3000,day:100,cpl:300,leads:'8-12'},
    {name:'מומלץ',mon:7000,day:230,cpl:200,leads:'25-40'},
    {name:'אגרסיבי',mon:15000,day:500,cpl:150,leads:'60-90'},
  ];
  setHTML('r-budget-rows',rows.map((r,i)=>`<tr class="${i===1?'hl':''}"><td>${r.name}</td><td>₪${r.mon.toLocaleString()}</td><td>₪${r.day}</td><td>₪${r.cpl}</td><td>${r.leads}</td></tr>`).join(''));
  set('r-seo-cost','בניית תוכן: ₪1,500-3,000/חודש + כתיבת עמודים: ₪500-1,000 לעמוד');
  set('r-seo-time','3 חודשים לדירוגים ראשונים • 6 חודשים לתנועה משמעותית • 12 חודשים ל-ROI מלא');
 
  // ט. תחזית
  set('r-leads',hasBudget?`${budget.monthly<=4000?'8-20':budget.monthly<=8000?'25-50':'50-100'} לידים/חודש`:'15-30 לידים/חודש (SEO בלבד לאחר 6 חודשים)');
  set('r-traffic','1,000-3,000 כניסות/חודש לאחר 6 חודשים של SEO');
  set('r-time','שבוע 1-2: הקמה | חודש 1-3: ביצועים ראשונים | חודש 6: ROI מלא');
  set('r-kpis','לידים/חודש, CPL, CTR, מיקום מילות מפתח, DA, Bounce Rate');
  set('r-brand','שיפור תדמית מקצועית, ביקורות חיוביות, Brand Awareness בענף');
 
  // י. תוכנית עבודה
  setHTML('r-workplan',[
    {dot:'📋',color:'var(--acc2)',title:'שבוע 1',txt:'הקמת Google Ads, בניית Landing Page ממוקד, הגדרת Google Business, חיבור Search Console + Analytics'},
    {dot:'🔧',color:'var(--pur)',title:'חודש 1',txt:'אופטימיזציה של קמפיין, כתיבת 3 עמודי שירות, פרסום 2 מאמרים SEO, בניית Backlinks ראשוניים'},
    {dot:'🚀',color:'var(--yel)',title:'90 יום',txt:'לפחות 20 לידים/חודש, Top 10 על 5 מילות מפתח, Bounce Rate < 50%, DA > 25'},
    {dot:'🎯',color:'var(--green)',title:'לעוזרים',txt:'כל הפעולות מועברות לעוזרים כמשימות מפורטות — SEO, Content, Ads, CRM'},
  ].map(t=>`
    <div class="tl-item">
      <div class="tl-marker">
        <div class="tl-dot" style="background:${t.color}22;border:2px solid ${t.color};color:${t.color};">${t.dot}</div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-body">
        <div class="tl-title" style="color:${t.color}">${t.title}</div>
        <div class="tl-txt">${t.txt}</div>
      </div>
    </div>`).join(''));
 
  // SWOT
  set('sw-s',`• ${d.diff||'ניסיון מוכח'}\n• ${d.usp||'USP ייחודי'}\n• ${d.mainService||'שירות מרכזי חזק'}`);
  set('sw-w',(d.challenges?.slice(0,3)||['לא צוין']).map(c=>'• '+c).join('\n'));
  set('sw-o','• ביקוש גובר לניהול מרחוק\n• מתחרים לא מנצלים SEO\n• LinkedIn B2B לא מנוצל');
  set('sw-t','• מתחרים עם תקציפי ענק\n• שינויי אלגוריתם Google\n• כלכלה לא יציבה');
}
 
// ── FINAL ──
function buildFinal(){
  collect();
  const d=S.data;
  const checks=[
    {ok:!!d.name&&d.name!=='—',label:'שם עסק ותחום'},
    {ok:!!d.mainService&&d.mainService!=='—',label:'שירות מרכזי'},
    {ok:!!d.diff&&d.diff!=='—',label:'בידול הוגדר'},
    {ok:!!d.ideal&&d.ideal!=='—',label:'קהל יעד'},
    {ok:!!d.comp&&d.comp!=='—',label:'מתחרים'},
    {ok:S.analysed,label:'ניתוח AI בוצע'},
    {ok:(d.connected?.length||0)>0,label:'נכסים מחוברים'},
    {ok:!!d.goal&&d.goal!=='—',label:'מטרה עסקית'},
  ];
  setHTML('cl',checks.map(c=>`
    <div class="cl-item">
      <span style="font-size:16px">${c.ok?'✅':'⚠️'}</span>
      <span style="color:${c.ok?'var(--w80)':'var(--yel)'}">${c.label}</span>
      ${c.ok?'':'<span class="bd bd-y" style="font-size:10px;margin-right:auto">מומלץ להשלים</span>'}
    </div>`).join(''));
 
  var ctx = window.BusinessStrategyModule ? BusinessStrategyModule.buildBusinessContext(S.data) : {
    clientId:'dalia-c-official',company:d.name,sector:d.sector,site:d.site,location:d.loc,
    mainService:d.mainService,differentiator:d.diff,usp:d.usp,
    idealClient:d.ideal,avoidClient:d.bad,businessGoal:d.goal,
    competitors:d.comp?d.comp.split('\n').filter(Boolean):[],
    challenges:d.challenges,sectors:d.sectors,budget:d.budget,
    connectedAssets:d.connected,ai_analysed:S.analysed,
    timestamp:new Date().toISOString(),
    strategy:{type:'SEO+PPC',platforms:['Google Ads','SEO','GBP'],budget_tier:parseBudget(d.budget).tier}
  };
  setHTML('ctx-json',JSON.stringify(ctx,null,2));
}
 
function exportData(){
  collect();
  try{localStorage.setItem('dalia_biz',JSON.stringify(S.data));}catch(e){}
  var res = window.BusinessStrategyModule ? BusinessStrategyModule.exportToPlatform(S.data) : { ok: false };
  if (!res.ok) { showToast('⚠️ שגיאה בהעברה'); return; }
  document.getElementById('exported').style.display='block';
  document.getElementById('btn-next').style.display='none';
  showToast('🚀 הועבר לכל העוזרים!');
}
 
function parseBudget(b){
  if(!b||b==='—') return{monthly:0,tier:'minimal'};
  if(b.includes('3,000')) return{monthly:3000,tier:'starter'};
  if(b.includes('6,000')) return{monthly:6000,tier:'recommended'};
  if(b.includes('10,000')) return{monthly:10000,tier:'growth'};
  if(b.includes('20,000')) return{monthly:20000,tier:'aggressive'};
  if(b.includes('20,000+')) return{monthly:25000,tier:'enterprise'};
  return{monthly:5000,tier:'recommended'};
}
 
// ── TOAST ──
function showToast(m){
  const t=document.getElementById('toast');
  t.textContent=m;t.style.opacity='1';t.style.transform='translateY(0)';
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(16px)';},3000);
}


  window.tc = tc; window.dov = dov; window.dlv = dlv; window.ddr = ddr; window.hf = hf;
  window.addUrl = addUrl; window.togglePlat = togglePlat; window.connectPlat = connectPlat;
  window.disconnectPlat = disconnectPlat; window.goT = goT; window.nextT = nextT; window.prevT = prevT;
  window.startAnalysis = startAnalysis; window.exportData = exportData; window.showToast = showToast;

  function mountWizard() {
    rootEl = document.getElementById('biz-strategy-root');
    if (!rootEl) return Promise.resolve(false);
    if (!window.BusinessStrategyModule || !BusinessStrategyModule.isEnabled()) {
      rootEl.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">מודול זמין ב-Staging לדליה בלבד</div>';
      return Promise.resolve(false);
    }
    return BusinessStrategyModule.whenDataReady().then(function () {
      return BusinessStrategyModule.loadCompetitors();
    }).then(function () {
      rootEl.innerHTML = shellHtml;
      rootEl.classList.add('biz-wiz');
      S.tab = 1; S.max = 1; S.analysed = false; S.files = []; S.urls = []; S.data = {};
      buildWiz();
      buildPlats();
      buildAgents();
      applySeedPrefill(BusinessStrategyModule.buildSeed());
      collect();
      goT(1);
      return true;
    });
  }

  function openWizard() {
    if (!window.BusinessStrategyModule || !BusinessStrategyModule.isEnabled()) {
      if (typeof showToast === 'function') showToast('מודול זמין ב-Staging לדליה בלבד');
      if (typeof goScreen === 'function') goScreen('screen-clients');
      return Promise.resolve();
    }
    return mountWizard().then(function () {
      if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    });
  }

  window.BusinessStrategyWizard = {
    VERSION: '2.0.0-approved',
    open: openWizard,
    mount: mountWizard,
  };
})();
