# Project 001 — חלוקת עבודה (חלק א׳ + חלק ב׳)

**Updated:** 2026-06-18  
**Owner account (OAuth):** orin1607@gmail.com  
**GA4 owner account:** yoni122222@gmail.com (existing property — no new GA4)

---

## כללי בטיחות (כל הפרויקט)

| מותר | אסור בלי אישור ידני |
|------|---------------------|
| חיבור, קריאה, probe | פרסום לאתר |
| משיכת נתונים → Sheets | שינוי קמפיינים (Ads) |
| טיוטות / דוחות בדיקה | עדכון Google Business Profile |
| OAuth + APIs | מיילים אמיתיים |
| | העלאת תוכן |

**Owner Gate:** Cursor מביא עד מסך האישור → עוצר → ממשיך אוטומטית אחרי אישור.

---

## חלק א׳ — חיבורים והרשאות (שלבים 1–5)

Cursor מוביל: פותח קישורים, מפעיל APIs, מכין OAuth, מציג מסכי אישור, מריץ Probe/Sync/Verify בסיסי אחרי כל חיבור.

### שלב 1 — Google Analytics

| פריט | מצב |
|------|-----|
| OAuth scopes | ✅ `analytics.readonly` |
| GCP APIs | ✅ Data + Admin |
| Token | ✅ orin1607@gmail.com |
| Property גלוי ב-API | ❌ **חסום** |
| Sync נתונים | ❌ |

**Owner Gate הנוכחי:**
1. מ-yoni122222@gmail.com: Property access → **orin1607@gmail.com** → **Viewer**
2. מ-orin1607@gmail.com: **Accept** הזמנה ב-Gmail/Analytics
3. (אופציונלי) שלח Property ID: `properties/XXXXXXXXX`

**אחרי אישור:** `npm run project-001:probe` → sync (425 יום) → verify  
**לא:** יצירת Account/Property חדש.

---

### שלב 2 — Google Search Console

| פריט | מצב |
|------|-----|
| OAuth scopes | ✅ `webmasters.readonly` |
| GCP API | ✅ Search Console + Site Verification |
| אתר רשום | ✅ staging URL |
| אתר מאומת | ❌ **חסום** |
| משיכת נתונים | ❌ |

**Owner Gate:**
1. `git push origin main` — deploy קבצי אימות (commit `38747e6` מקומי)
2. אימות אתר (META / FILE) — אוטומטי אחרי deploy

**אחרי אישור push:** verify-site → probe → sync GSC tabs

---

### שלב 3 — Google Ads

| פריט | מצב |
|------|-----|
| OAuth / scripts | ⏳ **לא נבנה עדיין** |
| GCP API | ⏳ Google Ads API — requires Developer Token |
| Scopes | ⏳ `adwords` (read-only for Part A) |

**Owner Gates (צפויים):**
1. הפעלת Google Ads API ב-GCP
2. Developer Token (Google Ads — אישור Google, לעיתים 24h+)
3. OAuth עם חשבון Ads הנכון
4. **קריאה בלבד** — לא שינוי קמפיינים

**אחרי חיבור:** probe accounts/campaigns (read) → Sheets snapshot → verify

---

### שלב 4 — Google Business Profile

| פריט | מצב |
|------|-----|
| OAuth scope | ✅ `business.manage` (ב-token) |
| GCP APIs | ✅ My Business APIs (ב-scopes.json) |
| Probe script | ⏳ לא נבנה |
| פרסום / עריכה | 🚫 חסום בחלק א׳ |

**Owner Gate:** OAuth re-approval אם נדרש + גישה ל-GBP location הנכון  
**אחרי חיבור:** probe locations/reviews (read) → Sheets → verify  
**לא:** שינוי פרופיל, תגובות, פרסום.

---

### שלב 5 — ChatGPT API

| פריט | מצב |
|------|-----|
| Integration folder | ⏳ לא נבנה |
| API key | ⏳ Owner Gate — יצירה ב-platform.openai.com |
| שימוש בחלק א׳ | probe בלבד (models list / test call) |

**Owner Gate:** יצירת API key + הדבקה ב-`.env` (gitignored)  
**אחרי חיבור:** probe connectivity → verify  
**לא:** יצירת תוכן / פרסום (זה חלק ב׳).

---

## חלק ב׳ — בניית המערכת (אחרי שלב 5)

| # | שלב | תלוי ב |
|---|-----|--------|
| 6 | חיבור Dashboard (Claude) | חלק א׳ מלא |
| 7 | בדיקות מלאות | 6 |
| 8 | מנוע AI | 5 + 6 |
| 9 | יצירת תוכן כטיוטות | 8 |
| 10 | Approval Center | 9 |
| 11 | Dashboard סופי | 10 + אישור |
| 12 | דוחות ואוטומציות | 11 |

**לא מתחילים חלק ב׳ עד שכל 5 החיבורים בחלק א׳ עברו Probe/Verify בסיסי.**

---

## פקודות קיימות (חלק א׳ — Google)

```bash
npm run verify                  # תשתית Google 7/7
npm run project-001:auth        # OAuth (Owner Gate)
npm run project-001:enable-apis # פתיחת טאבי GCP
npm run project-001:probe       # GSC + GA4 discovery
npm run project-001:sync        # Sheets
npm run project-001:verify      # Phase 1 verify
```

---

## Git (נכון לעכשיו)

- **Branch:** `main`
- **Last commit:** `38747e6` — GSC verification files
- **Status:** ahead 2, לא pushed; רוב תשתית Project 001 untracked locally

---

## הצעד הבא (ממתין לאישורך)

**חלק א׳ — סדר מומלץ:**

1. **GA4** — אישור Viewer + Accept (או Property ID)
2. **GSC** — אישור `git push origin main`
3. **Ads** — Cursor יבנה probe + יפתח Owner Gates
4. **GBP** — Cursor יבנה probe (read-only)
5. **ChatGPT** — Cursor יבקש API key במסך אישור

כתוב **"התחל חלק א׳"** + אישור על GA4/GSC כשמוכן.
