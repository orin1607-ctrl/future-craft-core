# Google Gate 1 — ממשק חדש (ללא Download JSON)

**מדיניות Google (2025+):** Client secret מוצג **פעם אחת בלבד** — ביצירת client או ב-**Add secret**. אין הורדת JSON ל-client קיים.

## Owner Gate 1 — הוראה אחת

**Dalia Login** → **Add secret** → העתק **Client ID** + **Client secret** החדש לקובץ:

`integrations/google/credentials.oauth.paste.json`

(תבנית: `credentials.oauth.paste.example.json`)

`google:watch` יזהה את הקובץ, יבנה `credentials.oauth.json`, וימשיך ל-OAuth אוטומטית.

קישור: https://console.cloud.google.com/auth/clients

## למה Redirect URI לא מספיק

Redirect URI נשמר ב-GCP בלבד. הסקריפטים צריכים `client_id` + `client_secret` מקומיים — Google לא שולחת אותם אחרי שעוזבים את המסך.
