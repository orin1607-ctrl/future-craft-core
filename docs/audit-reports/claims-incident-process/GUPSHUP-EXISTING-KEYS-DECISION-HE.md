# החלטה: מפתחות Gupshup קיימים — בלי ליצור חדש

**תאריך:** 2026-07-21  
**Production:** לא בוצע

## החלטה מפורשת

**אין צורך ליצור API Key חדש.**

השתמש באחד משני ה-App API Keys שכבר קיימים באפליקציית **DaliaVehicle** — והדבק אותו ב-Production Edge Secrets כ-`GUPSHUP_API_KEY`.

## למה

| בדיקה | תוצאה |
|--------|--------|
| Staging (מפתח קיים) | `gupshup_verified: true` · HTTP 202 · שייך ל-`DaliaVehicle` |
| App ID | `496709e8-b5fc-4de9-9c75-bc87455482dd` |
| ריצה חיה | [Actions #29868360469](https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29868360469) |
| Gupshup | עד 2 מפתחות App לרמה — שניהם תקפים לאותה אפליקציה |

המערכת משתמשת במפתח ברמת האפליקציה (`apikey` ל-`/wa/api/v1/msg`). כל אחד משני המפתחות הקיימים של האפליקציה מתאים ל-Production.

## מה לעשות

1. Gupshup → `DaliaVehicle` → Settings → אחד משני ה-API Keys הקיימים (העתק — לא צ׳אט)
2. הדבק רק ב-Production: https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions → `GUPSHUP_API_KEY`
3. מומלץ (לא חובה): אותו מפתח כמו Staging אם מזהים אותו; אחרת — כל אחד מהשניים
4. כתוב: **«סיימתי Gupshup»** לאימות חוזר

**אל תיצור מפתח חדש** אלא אם שני הקיימים נמחקו / לא ניתנים להעתקה.

**אל תריץ Production** עד אחרי האימות.
