# דוח טכני — ביצועים ויציבות (Orin Staging)

**תאריך:** 2026-07-07  
**סביבה:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html  
**Commits רלוונטיים:** `82fea1c` (Hub Lite) · `69fec7e` (iframe יחיד + UI מינימלי) · `5676c79` (תיקון סינון DOM)

---

## 1. למה המערכת נתקעת? — ממצאים עם הוכחות

### סיכום מנהלים

התקיעות **לא** נובעות מבעיית CSS או LocalStorage.  
הן נובעות משילוב של:

1. **עומס DOM ו-JavaScript במסכים ישנים** (לפני Lite)
2. **שתי אפליקציות כבדות ב-iframe במקביל** (מרכז עבודה + מרכז שליטה)
3. **טיימרים ברקע** בתוך כל iframe
4. **באג בטעינת Lite** — סינון המסכים לא רץ כש-`CocoHubLite` לא נטען (תוקן ב-`5676c79`)

---

### ממצא #1 — מסכי Orin ישנים: DOM ענק + Workbench איטי

| מדד | ערך | מקור |
|-----|-----|------|
| צמתי DOM ב-Hub (מצב מלא) | **15,466** | `docs/audit-reports/actions-performance-audit/report-before-lite.json` |
| זמן פתיחת Workbench | **45,036ms** (~45 שניות) | אותו קובץ — `openWorkbenchMs` |
| זמן הרחבת פעולה ראשונה | **40,017ms** | `expandFirstActionMs` |
| זמן Preview | **90,038ms** | `previewOpenMs` |

**איפה:** `coco-claude-screens.html` (~4,900 שורות HTML), `actions-workbench.js`, `coco-claude-data.js` (bindAll לכל המסכים).

**סוג בעיה:** JavaScript + Rendering + DOM — לא Network בלבד.

**מה עשינו:** Hub Lite מנתק 28 מודולים מה-boot ומסתיר מסכים (כשהסינון רץ).

---

### ממצא #2 — שני iframes כבדים רצים במקביל

**איפה נתקע:** מסך `screen-pirsum` → `coco-dalia-pirsum-launcher.js`

| iframe | קובץ | גודל | סקריפטים |
|--------|------|------|----------|
| מרכז העבודה | `coco-dalia-full-A-J-WIRED (1).html` | **468,764 bytes** | 16+ קבצי JS + אלפי שורות inline |
| מרכז השליטה | `ai-control-center-v5-STANDALONE.html` | **91,095 bytes** | 20 קבצי JS |

**לפני התיקון:** אחרי ביקור בשני הטאבים — **שני המנועים רצים יחד** (Orchestrator, assistants, wired-sync, marketing-api) פעמיים.

**טיימרים מוכחים בקוד:**

```37:37:public/ai-marketing/coco-dalia-wired-sync.js
    setInterval(syncTeamIframe, 30000);
```

```690:690:public/ai-marketing/coco-dalia-integration.js
    setInterval(function () { publishProgress({ silent: true }); }, 15000);
```

**סוג בעיה:** iframe + זיכרון + Event Listeners + JavaScript ברקע.

**תיקון (69fec7e):** במצב Lite — **רק iframe אחד פעיל**. בעת מעבר טאב, השני מושעה (`about:blank`) ומשחרר זיכרון/טיימרים.

---

### ממצא #3 — באג: Lite טען פחות סקריפטים אבל השאיר 15 מסכים ב-DOM

**הוכחה ממדידה (לפני 5676c79):**

```json
"lite": {
  "scripts": 24,
  "dom": 5785,
  "screens": ["screen-hub","screen-pirsum", ... 13 מסכים ישנים],
  "lite": false
}
```

מקור: `docs/audit-reports/staging-performance-profile/shell-compare.json`

**סיבה:** `hubLiteActive()` ב-`ai-marketing-platform.html` הפעיל מסלול Lite לסקריפטים, אבל `filterScreensHtml` רץ רק אם `window.CocoHubLite` קיים. כשהמודול לא נטען — **כל ה-HTML הוזרק ל-DOM**.

**תיקון (5676c79):** פונקציית `filterScreensLite()` מובנית ב-platform — לא תלויה במודול חיצוני.

---

### ממצא #4 — Global Filter Context (סרגל עליון)

**איפה:** `coco-marketing-unified.js`, `global-filter-bar.js`

**סוג:** Rendering + Event Listeners (`resize`, `scroll`, `requestAnimationFrame` לסנכרון מיקום).

**השפעה:** בינונית ב-shell, גבוהה כשעוברים בין 10 מסכים.

**מה עשינו:** `shouldShowGlobalChrome()` מחזיר `false` ב-Lite — הסרגל מוסתר, לוגיקת הקשר נשארת.

---

### ממצא #5 — לא Orchestrator כשורש התקיעה ב-Shell

ה-Orchestrator (`coco-dalia-orchestrator.js`) רץ **בתוך iframe**, לא ב-shell הראשי.  
הוא תורם לעומס **רק כשה-iframe שלו טעון**.  
במצב iframe-יחיד — עומסו מוגבל לטאב הפעיל.

---

### מה **לא** זוהה כגורם עיקרי

| קטגוריה | סטטוס |
|---------|--------|
| CSS | לא גורם עיקרי |
| LocalStorage | ~10KB — זניח |
| Network/API ב-boot | מועט ב-Lite shell |
| Lazy Loading שגוי | iframes נטענים נכון, אבל **לא הושעו** לפני התיקון |

---

## 2. בדיקת ביצועים — תוצאות מדידה

### השוואת Shell: Lite מול Full (Staging חי)

מקור: `shell-compare.json` — Playwright, 2026-07-07

| מדד | Lite (`?hub=lite`) | Full (`?hub=full`) | שיפור |
|-----|-------------------|-------------------|--------|
| זמן boot (DOM ready) | **4,473ms** | **8,227ms** | **-46%** |
| בקשות סקריפט | **24** | **55** | **-56%** |
| סה"כ בקשות רשת | **46** | **77** | **-40%** |
| Heap JS (shell) | 9.5 MB | 9.5 MB | שווה (לפני iframe) |

### Hub Lite (לאחר סינון תקין) — מדידה קודמת

מקור: `docs/audit-reports/hub-lite-staging/report.json`

| מדד | ערך |
|-----|-----|
| DOM Content Loaded | 623ms |
| Hub מוכן | 2,400ms |
| מסכים ב-DOM | 2 (hub + pirsum) |
| סקריפטים ישנים | 0 |
| חיבור דליה | `dalia-c-official` ✓ |

### iframe — עומס צפוי (מבנה קוד)

| רכיב | הערכה |
|------|--------|
| מרכז עבודה | DOM אלפי צמתים (קובץ 469KB) |
| מרכז שליטה | ~20 מודולים, assistants engine |
| **שניהם יחד** | ~2× עומס — **מנוטרל ב-iframe יחיד** |

---

## 3. ניקוי ממשק פרסום — מה בוצע

| אלמנט | פעולה |
|--------|--------|
| Topbar במסך פרסום | מוסתר ב-Lite |
| Topbar ב-Hub | מוסתר ב-Lite |
| כותרות "פרסום — מערכת חדשה" | מוסתר |
| תיאור ארוך בכרטיס פרסום | מוסתר |
| ChatGPT FAB בפרסום | מוסתר |
| כניסה אוטומטית לפרסום | פעילה (אחרי boot) |
| טאבים | מינימליים — רק שני כפתורים |

קבצים: `coco-marketing-lite-ui.css`, `coco-marketing-lite-mode.js`

**Preview:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html

---

## 4. תיקונים שבוצעו

| # | בעיה | תיקון | קובץ |
|---|------|--------|------|
| 1 | 28 מודולים ישנים ב-boot | מסלול Lite / Full נפרד | `ai-marketing-platform.html` |
| 2 | 15 מסכים ב-DOM | `filterScreensLite()` | `ai-marketing-platform.html` |
| 3 | שני iframes במקביל | `suspendFrame()` ב-Lite | `coco-dalia-pirsum-launcher.js` |
| 4 | סרגל סינון | הסתרה ב-Lite | `coco-marketing-unified.js` |
| 5 | UI עמוס בפרסום | CSS מינימלי | `coco-marketing-lite-ui.css` |
| 6 | ai-assistant ב-boot | דחייה 8 שניות ב-Lite | `ai-marketing-platform.html` |

---

## 5. בדיקות שבוצעו

| בדיקה | תוצאה |
|--------|--------|
| Hub Lite smoke (13 בדיקות) | **עבר** — `hub-lite-staging/report.json` |
| השוואת Lite/Full shell | **עבר** — `shell-compare.json` |
| 20 מעברי טאב work↔control | סקריפט: `profile-staging-fast.mjs` |
| 10 דקות רצופות | **דורש אימות ידני** — לא הושלם אוטומטית (מגבלת זמן CI) |

**המלצה:** להריץ ידנית 10 דקות על Preview אחרי deploy של `5676c79`.

---

## 6. לפני / אחרי — מספרים

| מדד | לפני (Full / ישן) | אחרי (Lite + תיקונים) |
|-----|-------------------|----------------------|
| סקריפטים ב-boot | 55 | 24 |
| זמן boot shell | ~8.2s | ~4.5s |
| מסכים ב-DOM | 15 | 2 |
| צמתי DOM shell | ~5,800+ | ~200 (צפוי אחרי 5676c79) |
| Workbench פתיחה | 45s | מנותק (לא נטען) |
| iframes פעילים | 2 במקביל | 1 בכל רגע |
| חיבור דליה | פעיל | פעיל |
| Orchestrator / עוזרים | ב-iframe | ב-iframe — **לא נגענו** |

---

## 7. אישורים

- **Production / Hostinger:** לא נגענו
- **חיבור דליה אוטומטי:** לא שונה (`dalia-site-config.js`)
- **50 עוזרים / 10 יועצים / Orchestrator:** לא שונה — רק **היקף טעינה** (iframe יחיד)
- **Evidence / Mission Control:** לא שונה
- **Google / Supabase / Edge / AI APIs:** לא שונה

---

## 8. מה עדיין פתוח (ללא פיתוח חדש)

1. **אימות ידני 10 דקות** — חובה לפני המשך פיצ'רים
2. **מרכז העבודה (469KB HTML)** — אופטימיזציה עתידית (פיצול קובץ, לא שינוי לוגיקה)
3. **מצב `?hub=full`** — נשאר לצורך שחזור/דיבוג בלבד

---

## 9. כלי Profiling שנוספו

- `scripts/profile-shell-compare.mjs` — Lite vs Full
- `scripts/profile-staging-fast.mjs` — iframe + stress
- `scripts/profile-staging-performance.mjs` — profiling מלא
- `scripts/verify-hub-lite-staging.mjs` — smoke

---

**מסקנה:** התקיעות נגרמו בעיקר מ**עומס DOM/JS במודולים ישנים** ומ**הרצה מקבילית של שני iframes כבדים**.  
התיקונים ממוקדים, לא נוגעים בלוגיקת הלקוח או ב-Orchestrator.  
**עוצרים פיתוח חדש** עד אימות יציבות על Preview עם commit `5676c79`.
