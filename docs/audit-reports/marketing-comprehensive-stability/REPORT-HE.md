# דוח יציבות שיווק מקיף — Staging

**תאריך:** 2026-06-30  
**Staging URL:** `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html`  
**Commit:** *(מתעדכן לאחר push)*

---

## 1. מה בוצע

- תיקון Stack Overflow במסך פעולות (`actions-workbench.js`)
- שער אישור סיכום עסקי (`business-summary-approval-gate.js`)
- סטנדרט Google World Class (`google-page-quality-standard.js`)
- AI Page Advisor (`ai-page-advisor.js`)
- עדכון שרשרת Gates בכל המודולים הרלוונטיים
- טעינת סקריפטים ב-`ai-marketing-platform.html`
- סקריפטי QA: `verify-marketing-comprehensive-audit.mjs` + הרחבת `verify-full-marketing-flow.mjs`

---

## 2. מה תוקן

| בעיה | תיקון |
|------|--------|
| `RangeError: Maximum call stack size exceeded` ב-`getPageStatusSummary` / `render` | Guard `_isRendering` + defer `goScreen` + הגבלת איטרציה ב-`getPageStatusSummary` |
| אין אישור סיכום עסקי לפני המשך | שער חדש לפני Strategic Briefing |
| אין הערכת איכות Google לעמוד | מודול heuristic עם 18 קריטריונים |
| אין הסבר ציון / שיפורים לעמוד | AI Page Advisor ב-preview וב-blueprint |

---

## 3. מה עדיין חסר

- מדידת Core Web Vitals חיה (ללא API — מוצג "חסר מידע" / הערכה היוריסטית)
- פרסום production — Staging בלבד
- חיבורי API חיים (GSC/GA) — לא מופעלים
- אימות פיזי במכשירים — Playwright בלבד

---

## 4. תוצאות QA

| מכשיר | עבר | נכשל |
|-------|-----|------|
| Desktop 1366×900 | 19 | 0 |
| iPhone 13 | 19 | 0 |
| Android Pixel 5 | 19 | 0 |
| **סה"כ comprehensive** | **57** | **0** |
| **full-marketing-flow (×3)** | **153** | **0** |

---

## 5. Stack overflow fix

**שורש:** רינדור חוזר סינכרוני — `render` → `goScreen` → `bindScreen` → `render` ללא guard.

**תיקון מינימלי:**
- `_isRendering` / `_pendingRerender` ב-`render()` ו-`rerender()`
- `goScreen('screen-actions')` בדיפ-לינק — `setTimeout(0)` במקום קריאה סינכרונית
- `getPageStatusSummary` — בדיקת `Array.isArray` + cap 500 פעולות

---

## 6. Business summary gate

- **מפתחות:** `coco-business-summary-v1`, `coco-business-summary-approved-v1`
- **שאלה:** "האם אתה מאשר שהסיכום נכון ומלא לפי העסק?"
- **מקורות:** `dalia_biz`, `coco-business-context-v1`, זרע briefing
- **שרשרת:** Wizard export → **Business Summary** → Strategic Briefing → Materials → SEO → Pre-Build → Build

---

## 7. Google Standard

- `evaluatePage(pageData)` — 18 קריטריונים, ציון 0–100
- `assertPublishGate(pageId)` — סף 70, override ידני ב-`coco-google-publish-override-v1`
- אינטגרציה: Blueprint, Website Builder preview, Client Preview Publisher, Site Hub auto-tasks

---

## 8. AI Page Advisor

- הסבר ציון, 3 שיפורים מובילים, impact, חובה/אופציונלי
- "חסר מידע" כשאין נתונים
- פאנלים: `wb-page-advisor-root`, `bp-page-advisor-root`

---

## 9. Gates / buttons / reports נבדקו

- שלילי: summary, briefing, materials, SEO, report — כולם חוסמים
- אישורים: summary, briefing, materials, SEO, pre-build
- כפתורים: אשף, next/back, צור אתר AI, preview, המשך לעוזרים
- דוחות: Pre-Build export/approve
- AI Consultant: briefing + SEO stages

---

## 10. Preview נבדק

- 7 עמודים multipage
- ניווט מלא במסך
- Google scores ב-DOM
- AI Advisor עם ציון
- URL קבוע: `/client-previews/...`

---

## 11. Negative tests

- `neg_business_summary_blocks` — חוסם ללא אישור ✓
- `neg_gates_block_incomplete` — כל השערים חוסמים כשלא מלא ✓

---

## 12. Commit hash

`b11a774`

---

## 13. Staging URL

https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html

---

## 14. השלב הבא

- Deploy ל-GitHub Pages ואימות חי על Staging URL
- הרחבת נתוני CWV מ-Lighthouse CI (ללא API חי)
- אינטגרציית Gmail approval (נפרד)
