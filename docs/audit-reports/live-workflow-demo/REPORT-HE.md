# דמו Workflow חי — Orin Staging (Preview בלבד)

**תאריך:** 2026-06-29  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1-1fdfb7a  
**מצב:** `EXECUTION_MODE=preview` — **לא** שונה dalia-c.com

---

## 1. איזה עמוד נבדק

**השירותים שלנו - דליה** (`/השירותים-שלנו`)  
URL חי (לקריאה בלבד): https://dalia-c.com/%D7%94%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99%D7%9D-%D7%A9%D7%9C%D7%A0%D7%95/  
pageId: `page-07` · 14 פעולות פתוחות ב-SSOT

---

## 2. מה היה לפני

| שדה | ערך |
|-----|-----|
| Title | השירותים שלנו - דליה |
| Meta | חברת דליה עוסקת בתפעול ותחזוקת רכבים עם ניסיון וותק של מעל ל-20 שנה בתחום הרכב. חברתינו גא… |
| H1 | **חסר** |
| SEO | ציון 5/10 |
| PageSpeed | pending |
| GSC | 14 חשיפות, מיקום 5.5 |
| GA4 | 0 צפיות |
| בעיות | missing_h1, images_without_alt:2, canonical_mismatch |

---

## 3. מה שונה (Preview בלבד — localStorage/sessionStorage)

| שדה | אחרי (הצעה) |
|-----|-------------|
| Title | שירותי ניהול צי רכב לעסקים | דליה — תפעול, תחזוקה ומעקב |
| Meta | גלו את שירותי דליה: ניהול צי רכב, תחזוקה מונעת, מעקב GPS וטיפול 24/7. פתרון מלא לעסקים בישראל. צרו קשר לייעוץ חינם. |
| H1 | שירותי ניהול צי רכב ותחזוקה לעסקים |

**לא פורסם לאתר החי.** תצוגה ב-iframe של שולחן העבודה.

---

## 4. אילו AI השתתפו

| מנוע | מצב | תפקיד |
|------|-----|--------|
| ChatGPT (OpenAI) | stub (stub) | תוכן/Meta |
| Claude (Anthropic) | stub (stub) | ניתוח |
| Gemini (Google) | stub (stub) | SEO routing |

> **כנה:** ב-Staging אין API חי — כל התשובות מ-`MultiAiOrchestrator` stub.

---

## 5. מה ההמלצה שלהם

- **H1:** חסר H1 (`act-page-07-h1`)
- **Alt לתמונות:** 2 תמונות ללא alt (`act-page-07-alt`)
- **Title:** לבדוק אורך ומיקוד Title (`act-page-07-title`)
- **Meta Description:** למקד Meta עם CTA (`act-page-07-meta`)

**החלטה משולבת (preview):** H1 + Title + Meta ממוקדים ל"ניהול צי רכב".

---

## 6. האם העמוד מוכן לאישור שלי?

**כן — `pending_approval` · לא אושר אוטומטית.**

**איך לראות:**
1. פתח: https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1-1fdfb7a
2. **פעולות** → **פתח שולחן עבודה** לעמוד `/השירותים-שלנו`
3. **תצוגה מקדימה** — before/after
4. **מרכז בקרה AI** — הודעה "עמוד מוכן לאישור"

**איך לאשר ידנית (אתה):** בשולחן העבודה → פתח פעולה → **מוכן לביצוע** (שומר ב-localStorage preview בלבד).

---

## אמיתי vs Stub vs Preview

| רכיב | סטטוס |
|------|--------|
| נתוני SSOT (עמוד, פעולות) | **אמיתי** מ-`site-work-plan.json` |
| Multi-AI | **Stub** (Staging — אין API חי) |
| Daily Engine | **אמיתי** — ריצה בדפדפן → localStorage |
| Preview iframe | **אמיתי** — sessionStorage (before 1044B / after 1075B) |
| AI Control Center | **הודעה** via `MarketingNotifications` (hook `notifyPageReadyForApproval` נוסף מקומית — עדיין לא ב-Staging המ deployed) |
| dalia-c.com | **לא נגע** (0 write requests) |
| אישור | **לא** — ממתין לך |

צילומי מסך: `docs/audit-reports/live-workflow-demo/screenshots/` (01–04)
