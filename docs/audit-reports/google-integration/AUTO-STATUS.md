# Google Integration — מצב אחרי שמירת Redirect URI

**עודכן:** 2026-06-18

## מה בוצע ✅

Redirect URI `http://127.0.0.1:4521/oauth2callback` נשמר ב-GCP עבור **Dalia Login** — נדרש ל-OAuth.

## למה OAuth עדיין לא רץ

שמירת Redirect URI ב-Console **לא מעדכנת** את הקבצים המקומיים.

| מקור | מצב |
|------|-----|
| `integrations/google/credentials.oauth.json` | **תבנית example** (`YOUR_CLIENT_ID`) — לא credentials אמיתיים |
| `~/Downloads/client_secret*.json` | רק קבצי OAuth Playground ישנים (פרויקט זר) |
| `token.json` | לא קיים |

הסקריפטים דורשים `client_id` + `client_secret` אמיתיים מ-**Dalia Login**. בלי הורדת JSON — אין מה לשלוח ל-Google.

## Gate 1 — עדיין נדרש (פעולה אחת)

[Credentials](https://console.cloud.google.com/apis/credentials) → **Dalia Login** → **Download JSON** (אייקון הורדה)

לאחר ההורדה — `google:watch` יזהה אוטומטית וימשיך:
OAuth (Gate 2 — אישור בדפדפן) → token → בדיקות API → דוח
