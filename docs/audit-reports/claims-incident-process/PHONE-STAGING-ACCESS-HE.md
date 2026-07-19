# למה לא רואים את השינויים מהטלפון — ומה חסר

**תשובה קצרה:** הקוד נמצא ב-branch `feat/incident-alerts-staging` + מיגרציה על Supabase Staging.  
אתר GitHub Pages Staging עדיין מגיש את **main הישן** (נפרס לאחרונה ב-16 ביולי) — לכן מהטלפון רואים את הגרסה הקודמת.

## תשובות מדויקות

### 1. האם השינויים זמינים ב-Staging כרגע?
| שכבה | סטטוס |
|------|--------|
| Git branch | כן — `feat/incident-alerts-staging` |
| Supabase DB Staging (`usfeoerkpcafxxlyuldl`) | כן — מיגרציית מספר אירוע / עמודות / הגדרות |
| אתר Staging (GitHub Pages) | **לא** — עדיין build של `main` בלבד |

### 2. קישור מהטלפון (אחרי פריסה)
- אפליקציה: https://orin1607-ctrl.github.io/future-craft-core/
- הוכחה ויזואלית ללא Login (אחרי פריסת ה-branch):  
  https://orin1607-ctrl.github.io/future-craft-core/dev/incident-alerts-proof

### 3. Login
- דף ההוכחה `/dev/incident-alerts-proof` — **ללא Login**
- מסכים מלאים (`/faults`, `/accidents`, `/vehicle-tracking`, `/alert-settings`, דשבורדים) — **כן, Login** עם משתמש Staging (נהג / מנהל צי / super_admin)

### 4. Cache
רענון Cache **לא** יעזור כל עוד Pages מגיש את `main`.  
אחרי פריסת ה-branch: רענון קשה (מחיקת Cache לאתר) מומלץ בטלפון.

### 5. האם זה רק ב-Git?
**כן לגבי ה-Frontend החי.** זה בדיוק הסיבה.

Workflow `Deploy Staging to GitHub Pages`:
- רץ על push ל-`main` בלבד (או workflow_dispatch)
- עד כה תמיד עשה `checkout` של `main`
- עודכן ב-branch לתמוך בפריסת feature branch — אבל הסוכן קיבל **403** בהפעלת Actions; נדרש Owner להריץ ידנית

### 6. נתיבים במערכת (אחרי פריסה + Login)

| מסך | נתיב |
|-----|------|
| פתיחת תקלה | `/faults` → דיווח חדש |
| פתיחת תאונה | `/accidents` → דיווח חדש |
| אישור + מספר אירוע | אחרי שליחה (מסך הצלחה) |
| מעקב רכבים | `/vehicle-tracking` → פילטר תקלות |
| כרטיס רכב | `/vehicles` → Hub → תקלות |
| כרטיס נהג | `/drivers` → כרטיס |
| דשבורד מנהל צי | `/dashboard` / בית מנהל |
| דשבורד נהג | דשבורד נהג → דיווחים אחרונים |
| AlertSettings | `/alert-settings` → התראות תאונות/תקלות |
| Preview WA/Email | במסך האישור אחרי דיווח |

## שלב שחסר (Owner — דקה אחת)

1. היכנס: https://github.com/orin1607-ctrl/future-craft-core/actions/workflows/deploy-staging-pages.yml  
2. **Run workflow**  
3. Branch: `feat/incident-alerts-staging`  
4. Input `deploy_ref`: `feat/incident-alerts-staging`  
5. המתן לסיום ירוק  
6. מהטלפון פתח:  
   https://orin1607-ctrl.github.io/future-craft-core/dev/incident-alerts-proof  
   (ולמסכים מלאים — Login)

**אין Merge ל-main · אין Production · אין Hostinger.**

## צילומי מסך (כבר מוכנים ב-repo)

`docs/screenshots/incident-alerts-proof/` — 11 מקטעים + full page.
