# OAuth Sync — רשימת פעולות (מחשב בית בלבד)

**חשוב:** אל תריץ מכאן. השתמש בהרשאות ובקבצים **הקיימים** — אל תיצור OAuth client חדש.

## קבצים נדרשים (כבר אצלך)

```
integrations/google/credentials.oauth.json   # OAuth client קיים
integrations/google/token.json                 # refresh token (נוצר ע"י auth)
.env.ads                                       # Google Ads Developer Token (אם קיים)
```

## פקודות (בסדר)

```bash
# 1. רענון token — רק אם פג תוקף
npm run project-001:auth

# 2. סנכרון מלא → dashboard.json
npm run project-001:sync-and-export

# 3. העלאה ל-Staging
git add public/project-001/dashboard.json
git commit -m "Refresh dashboard from home OAuth sync"
git push
```

## לאן הנתונים נכנסים (מוכן מראש)

| שלב | קובץ / מודול |
|-----|----------------|
| Export | `public/project-001/dashboard.json` |
| Site crawl | `public/project-001/site-crawl.json` |
| UI mapping | `app.js` → `mapDashboardRaw()` |
| Live init | `dalia-site-config.js` → `initOfficial()` |
| Client ID | `client-id-ssot.js` → `dalia-c-official` |
| Hub / Status | `coco-claude-data.js` → `bindHub` / `bindStatus` |
| עוזרים | `dalia-site-config.js` → `getAgentData()` |

## אימות אחרי sync

```bash
npm run project-001:qa-v4
node scripts/qa-infrastructure.mjs
node scripts/qa-staging-live-close.mjs
```

## בדיקה ידנית

1. התחברות Staging כ**יוני אטיאס**
2. לקוח עסקי חדש — **שיווק בלבד**
3. לקוח עסקי חדש — **צי + שיווק**
4. כרטיס שיווק → **מצב נוכחי** → GSC/GA4 אמיתיים
5. חזרה לדליה

## שירותים שעדיין דורשים אישור Google (לא OAuth בלבד)

- **GBP** — Basic API Access ([בקשה](https://support.google.com/business/contact/api_default))
- **Ads** — Developer Token (`.env.ads`)
- **GTM** — scope ב-OAuth הקיים

ראה: `docs/audit-reports/project-001/owner-gates.json`
