# כרך ט' – קוד / איכות הקוד (Code Quality Due Diligence)
## מערכת דליה · Read Only · ראיות בלבד · ללא ציוני מוכנות

| שדה | ערך |
|-----|-----|
| תאריך | 2026-07-24 |
| Production | https://dalia-car.online · Supabase `qasomfndnjuixgjmjwcm` |
| מקור קוד שנבדק | ענף הביקורת `cursor/due-diligence-audit-pack-5017` (מבוסס `main`/עץ העבודה) |
| Bundle חי (כרכים קודמים) | `/assets/index-8KZoTB0x.js` · Last-Modified 2026-07-22 |
| מצב עבודה | **Read Only** — תיעוד בלבד; ללא שינוי קוד/תלויות/lockfiles/Prod/Staging/DB/Secrets/Deploy |
| מגבלת ציונים | **אין** ציון Code Health / Readiness / Enterprise בכרך זה — ציונים רק בכרך י"ט (§149–168) |

### מקרא סטטוס
| סטטוס | משמעות |
|--------|--------|
| 🟢 מאומת / תקין ברמת הראיה | ראיה מול Production / בדיקה חיה מתועדת / דפוס חיובי מאומת בקוד |
| 🟡 דורש שיפור / אימות | ראיה בקוד/lock/CI; אכיפה או השפעה חיה חלקית |
| 🔴 ממצא מאומת | פער/סיכון שאומת ברמת הראיה (לא בהכרח ניצול חי) |
| 🔴 V5 | לא ניתן לאמת ברמת ודאות מספקת |

### מקרא ודאות V1–V5
| קוד | משמעות |
|-----|--------|
| **V1** | מאומת בוודאות מול Production חי / מדידה ישירה מתועדת |
| **V2** | מאומת חלקית מול Production |
| **V3** | נמצא בקוד / lock / docs / CI בלבד |
| **V4** | אינדיקציה / חשד בלבד |
| **V5** | לא ניתן לאימות |

### עקרונות כרך זה
1. כל טענה מלווה במקור ראיה, נתיב, סביבה ורמת ודאות.
2. קוד ב-`main`/repo **אינו** מוצג כפעיל ב-Prod בלי הוכחה (הצלבה ל-bundle / Edge / כרכים קודמים).
3. CVE ≠ ניצול ב-Prod; TODO ≠ סיכון אבטחה אוטומטי.
4. **אין** הדבקת ערכי סודות / JWT מלאים / מפתחות במסמך זה.

---

# 76. איכות הקוד

## מצב קיים

### חוזקות שזוהו
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| מבנה תיקיות | הפרדה ברורה: `components/`, `pages/`, `hooks/`, `lib/`, `services/`, `contexts/`, `integrations/supabase/`, `modules/fleetos/`, Edge `_shared/` | 🟢 | V3 |
| לקוח Supabase מטיפוס | `createClient<Database>(…)` ב-`src/integrations/supabase/client.ts` עם `VITE_SUPABASE_*` | 🟢 | V3 |
| Auth משותף ל-Edge | `supabase/functions/_shared/edgeAuth.ts` — `requireAuth` / Roles / CORS | 🟢 דפוס · 🟡 CORS `*` (כרך ז') | V3 |
| ולידציה ייעודית | `src/lib/requiredFieldsValidate.ts` + בדיקות יחידה | 🟢 | V3 |
| טיפול בשגיאות Edge | `src/lib/edgeFunctionError.ts` + `edgeFunctionError.test.ts` | 🟢 | V3 |
| UI kit | shadcn/ui (`components.json`) + Radix | 🟢 | V3 |
| בדיקות יחידה ממוקדות | **17** קבצי `*.test.ts` תחת `src/lib` ו-`src/utils` | 🟢 חלקי | V3 |

### נקודות תחזוקה / איכות
| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| TypeScript strict | `tsconfig.app.json`: `"strict": false`, `"noImplicitAny": false`, unused locals/params כבויים; `tsconfig.json`: `strictNullChecks: false`, `allowJs: true` | 🔴 | V3 |
| שימוש ב-`any` | ~**144** מופעים בסגנון `: any` / `as any` / generics ב-**49** קבצי `src` (דגימה: WorkOrders, Vehicles, Faults, Routes, VehicleExchange וכו') | 🟡 | V3 |
| קבצים גדולים | ראו טבלה למטה — מספר דפי ליבה >30–50KB; `types.ts` ~118KB | 🟡 | V3 |
| `console.*` | ~**89** קריאות ב-**45** קבצי `src`; ב-bundle חי (כרכים קודמים) נשארו מופעי `console.error/log/warn` | 🟡 | V3/V2 |
| zod | תלות ישירה `zod@^3.25.76` — **0 ייבואים** ב-`src`/`supabase`/`scripts` | 🟡 חוב טכני | V3 |
| react-hook-form | שימוש עיקרי דרך `src/components/ui/form.tsx` (מעטפת shadcn); `@hookform/resolvers` ללא `zodResolver` שנמצא | 🟡 | V3 |
| הפרדת אחריות | רוב הלוגיקה בדפי `pages/` גדולים (Reports/Customers/Faults/WorkOrders) במקום שכבת services אחידה | 🟡 | V3 |
| Source maps | `vite.config.ts` ללא `sourcemap` מפורש; בדיקה קודמת — URL `.map` מחזיר HTML (SPA) | 🟢 נטייה לאי-חשיפה · 🟡 | V2 |

### קבצים הגדולים ביותר (לפי גודל בבתים)
| גודל (bytes) | נתיב |
|-------------|--------|
| 117,674 | `src/integrations/supabase/types.ts` |
| 56,335 | `src/pages/Project001Dashboard.tsx` |
| 50,867 | `src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx` |
| 50,090 | `src/pages/Reports.tsx` |
| 49,539 | `src/components/HelpButton.tsx` |
| 49,437 | `src/pages/Customers.tsx` |
| 44,588 | `src/components/vehicles/VehicleHub.tsx` |
| 43,322 | `src/pages/WorkOrders.tsx` |
| 42,199 | `src/pages/Faults.tsx` |
| 39,638 | `src/pages/ServiceOrders.tsx` |
| 33,162 | `src/pages/VehicleExchange.tsx` |
| 32,709 | `src/pages/Drivers.tsx` |

### ממצאים נבחרים (§76)
| מזהה | כותרת | סטטוס | חומרה | ודאות | מקור |
|------|--------|--------|--------|--------|------|
| CQ-76-01 | TypeScript לא ב-strict mode | 🔴 | גבוה (תחזוקה/בטיחות טיפוסים) | V3 | `tsconfig.app.json`, `tsconfig.json` |
| CQ-76-02 | ריכוז `any` בדפי ליבה | 🟡 | בינוני | V3 | חיפוש ב-`src/**/*.ts(x)` |
| CQ-76-03 | דפים מונוליטיים גדולים | 🟡 | בינוני | V3 | גודל קבצים |
| CQ-76-04 | לקוח Supabase מטיפוס + env | 🟢 | — | V3 | `src/integrations/supabase/client.ts` |
| CQ-76-05 | zod לא בשימוש | 🟡 | נמוך | V3 | `package.json` + חיפוש ייבואים |
| CQ-76-06 | עזרי ולידציה/שגיאות עם טסטים | 🟢 | — | V3 | `requiredFieldsValidate`, `edgeFunctionError` + tests |

## כיצד נבדק / מקור הראיה
קריאת `tsconfig*`, ספירת `any`/`console`, מיון גדלי קבצים, חיפוש ייבוא `zod`, בדיקת `client.ts`, הצלבה לכרך ז' לגבי bundle/`console`.

## סיכונים
- היעדר strict מעלה סיכון לרגרסיות שקטות ולכשלי null/undefined בריצה.
- דפים גדולים מקשים על review, בדיקות והפרדת הרשאות עקבית (קשר לכרך ח').
- תלויות לא בשימוש (`zod`) מרחיבות משטח audit ללא תועלת.

## המלצות
- להפעיל בהדרגה `strict` / `noImplicitAny` (מודול-מודול) — **לא בוצע בכרך זה**.
- לפצל דפי ליבה גדולים לשכבות hooks/services.
- להסיר או להתחיל להשתמש ב-`zod` + resolvers באופן עקבי.
- לצמצם `console.*` ב-build Production.

---

# 77. מבנה הפרויקט

## מצב קיים

### עץ עליון (תמצית)
| רכיב | תפקיד | סטטוס |
|------|--------|--------|
| `src/` | SPA React/Vite | 🟢 |
| `supabase/functions` + `migrations` | Backend Edge + SQL | 🟢 מבנה · 🟡 יישור Prod (כרך ז') |
| `docs/` | תיעוד נרחב + תיק נאותות | 🟢 |
| `scripts/` | סקריפטי ops/E2E/אבחון (~316 קבצים בעץ) | 🟡 |
| `.github/workflows/` | CI/CD ו-ops רבים | 🟡 |
| `public/`, `nginx.conf` | סטטי + תצורת VPS לדוגמה | 🟢/🟡 |
| `project-001-ai-marketing/` | מודול שיווק נפרד (Apps Script וכו') | 🟡 |
| `sites/` | אתרים/נכסים נוספים | 🟡 |
| קבצי env לדוגמה | `.env.*.example` | 🟢 |
| `.env` ב-git | **מעקב ב-git למרות `.gitignore`** — ראו §82 | 🔴 |

### `src` — חלוקה
`assets`, `components` (admin/auth/documents/faults/…/whatsapp), `contexts`, `data`, `dev` (mocks), `hooks`, `integrations/supabase`, `lib`, `modules/fleetos`, `pages` (+ admin), `services`, `styles`, `test`, `utils`.

### מלאי גודל (מדידה על העץ)
| מדד | ערך | ודאות |
|------|------|--------|
| עמודי `pages` (`*.tsx`) | **93** | V3 |
| מיגרציות SQL | **89** | V3 |
| Edge function dirs | **34** | V3 |
| בדיקות יחידה | **17** | V3 |
| דפי `Dev*.tsx` | **17** | V3 |

### נתיבי `/dev/*` ב-`App.tsx`
נתיבים מחוץ ל-Layout/RouteGuard (הצלבה לכרך ח'/ז'), בין השאר:
`/dev/vehicle-card`, `vehicle-flows`, `vehicle-new-form*`, `vehicle-form-live*`, `faults-scoped`, `documents-scoped`, `document-ux-preview`, `staging-proof-flow`, `incident-alerts-proof`, `vehicles-list`, `fleet-manager-driver-flow`, `fleetos-*`, `/dev/project-001/dashboard`.

Mocks ב-`src/dev/`: `fleetOSPreviewMock.ts`, `vehicleHubPreviewMock.ts`.

| ממצא | סטטוס | ודאות |
|------|--------|--------|
| `/dev/*` קיימים בקוד ה-Router | 🔴 חוב תפעולי | V3 |
| `/dev/*` ב-bundle Production | 🔴 | **V1** (כרך ז') |
| FE/BE מופרדים (`src` מול `supabase`) | 🟢 | V3 |
| CI Prod frontend משתמש ב-bun | 🟢 מתועד ב-workflow | V3 |
| Default GitHub branch = `production` בעוד דיפלוי מ-`main` | 🟡 בלבול מתודולוגי | V1 (כרכים קודמים) |

### ממצאים נבחרים (§77)
| מזהה | כותרת | סטטוס | חומרה | ודאות |
|------|--------|--------|--------|--------|
| CQ-77-01 | נתיבי `/dev` ב-Prod bundle | 🔴 | גבוה | V1 |
| CQ-77-02 | מבנה FE/Edge/docs ברור | 🟢 | — | V3 |
| CQ-77-03 | ריבוי scripts/workflows מול ליבת מוצר | 🟡 | בינוני | V3 |
| CQ-77-04 | Project001/Marketing בתוך אותה אפליקציה | 🟡 | בינוני | V3 |

## כיצד נבדק / מקור הראיה
`git ls-tree` / ספירות תיקיות; `App.tsx`; כרך ז' להימצאות `/dev` ב-bundle; `dalia-ci-preview.yml` (`bun install --frozen-lockfile`).

## סיכונים
- משטח תצוגות פיתוח ב-Production.
- בלבול ענפים (`production` default מול `main` deploy) → מסקנות/דיפלוי שגויים.
- מלאי scripts גדול מעלה סיכון לסודות/hardcodes (ראו §82).

## המלצות
- להוציא `/dev` ו-mocks מ-build Production (flag/ bundler exclude).
- ליישר default branch למקור האמת של הדיפלוי.
- לקטלג scripts לפי סביבה (prod-safe / staging-only / local).

---

# 78. Libraries

## מצב קיים — ספריות ישירות מרכזיות

| ספרייה | תפקיד | גרסה ב-`package.json` | ב-lock | בשימוש בקוד? | הערות | סטטוס |
|--------|--------|------------------------|--------|--------------|--------|--------|
| `react` / `react-dom` | UI | ^18.3.1 | 18.3.1 | כן | ליבה | 🟢 |
| `react-router-dom` | ניתוב | ^6.30.1 | 6.30.1 | כן | CVE — §81 | 🟡 |
| `@supabase/supabase-js` | Backend client | ^2.98.0 | 2.98.0 | כן | | 🟢 |
| `@tanstack/react-query` | cache/server state | ^5.83.0 | (lock) | כן | | 🟢 |
| Radix UI suite | primitives | מגוון | — | כן (shadcn) | | 🟢 |
| `lucide-react` | אייקונים | ישיר | — | כן | | 🟢 |
| `recharts` | גרפים | ישיר | — | כן | | 🟢 |
| `date-fns` | תאריכים | ישיר | — | כן | | 🟢 |
| `zod` | סכמות | ^3.25.76 | 3.25.76 | **לא נמצא ייבוא** | תלות מתה | 🟡 |
| `@hookform/resolvers` | resolvers | ^3.10.0 | — | שימוש מצומצם/לא zod | | 🟡 |
| `react-hook-form` | טפסים | ^7.61.1 | — | בעיקר UI form | | 🟡 |
| `@elevenlabs/client` + `react` | Voice | ישיר | — | `VoiceAgentDialer.tsx` | credentials חלקיים ב-Prod (כרך ד'/ז') | 🟡 |
| `sonner` / `cmdk` / `vaul` / `embla-carousel-react` / `input-otp` / `next-themes` | UX | ישיר | — | כן | | 🟢 |

### devDependencies מרכזיים
| ספרייה | תפקיד | גרסה | הערות | סטטוס |
|--------|--------|------|--------|--------|
| `vite` | build | ^5.4.19 → 5.4.19 | CVE build/dev — §81 | 🟡 |
| `typescript` | קומפילציה | ^5.8.3 → 5.8.3 | | 🟢 |
| `vitest` | unit tests | ^3.2.4 → 3.2.4 | CVE critical ב-UI — §81 | 🟡 |
| `eslint` | lint | ^9.32.0 | | 🟢 |
| `playwright` | E2E מקומי/סקריפטים | ישיר | | 🟡 |
| `googleapis` | סקריפטים | ^144.0.0 | CVE moderate דרך uuid | 🟡 |
| `lovable-tagger` | כלי Lovable | ישיר | | 🟡 |

### Edge (לא מ-npm של האפליקציה)
| רכיב | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| `edgeAuth.ts` | `https://esm.sh/@supabase/supabase-js@2` (minor לא נעוץ) | 🟡 | V3 |
| גרסת Deno runtime ב-Prod | לא נמדדה בסשן | 🔴 V5 | V5 |

## כיצד נבדק / מקור הראיה
`package.json`, `package-lock.json`, חיפושי ייבוא, דגימת `bun.lock` לגרסאות זהות בדגימה קודמת.

## סיכונים
- ספריות ישירות לא בשימוש מרחיבות מלאי CVE.
- תלות Edge ב-esm.sh `@2` — גרסה בריצה לא מנוהלת כמו lock של הפרונט.

## המלצות
- לנקות תלויות מתות (`zod` אם לא יאומץ).
- לנעוץ גרסת supabase-js ב-Edge ל-URL מדויק.
- להפריד dev-only libs ממשטח Prod במדיניות תחזוקה.

---

# 79. Dependencies

## מצב קיים

| מדד | ערך | מקור | ודאות |
|------|------|------|--------|
| dependencies ישירות | **52** | `package.json` | V3 |
| devDependencies | **24** | `package.json` | V3 |
| סה״כ חבילות לפי `npm audit` metadata | **627** (prod 280 / dev 344 / …) | `npm audit --package-lock-only` | V3 |
| שם חבילה | `vite_react_shadcn_ts` @ `0.0.0` | package.json | V3 |
| `engines` / `packageManager` | **חסרים** | package.json | V3 |
| Lockfiles | `package-lock.json` + `bun.lock` + `bun.lockb` | עץ | 🟡 V3 |
| CI Prod/preview | `bun install --frozen-lockfile` | `dalia-ci-preview.yml` | V3 |
| יישור bun ↔ npm | דגימה קודמת: react/vite/vitest/supabase/zod/postcss/rollup תואמים | השוואת locks | 🟡 V2 |
| יישור מלא כל העץ | לא הוכח לכל חבילה | — | 🔴 V5 |

### סוגי סיכון תלויות (ללא תיקון)
| סוג | ממצא | סטטוס |
|------|--------|--------|
| Unused ישיר | `zod` (0 imports) | 🟡 |
| כפילות מנהלי חבילות | bun + npm locks | 🟡 |
| Outdated / CVE | 23 ממצאי audit — §81 | 🟡/🔴 לפי נתיב ניצול |
| Transitive | רוב ה-high ב-audit | 🟡 |
| Build-time vs runtime | vite/rollup/postcss/vitest/esbuild בעיקר כלי פיתוח/בילד | 🟡 להבחנה |

## כיצד נבדק / מקור הראיה
ספירת `package.json`; `npm audit --package-lock-only` (ללא `audit fix`, ללא שינוי lock); קריאת workflow; הצלבת גרסאות בדגימה.

## סיכונים
- שני lockfiles עלולים להתפצל עם הזמן → בילד שונה ממה שנבדק ב-audit.
- היעדר `engines`/`packageManager` מקשה על שחזור סביבה.

## המלצות
- לבחור מנהל חבילות יחיד ל-CI ולתעד.
- להוסיף `packageManager` / `engines`.
- להריץ מדיניות dependabot/renovate — **לא הופעל כאן**.

---

# 80. גרסאות

## מצב קיים

| רכיב | ערך שנמצא | סביבה | סטטוס | ודאות |
|------|-----------|--------|--------|--------|
| React | 18.3.1 | repo lock | 🟢 | V3 |
| React Router DOM | 6.30.1 (`@remix-run/router` 1.23.0) | repo lock | 🟡 CVE | V3 |
| Supabase JS (FE) | 2.98.0 | repo lock | 🟢 | V3 |
| Supabase JS (Edge import) | `@supabase/supabase-js@2` דרך esm.sh | קוד Edge | 🟡 | V3 |
| Vite | 5.4.19 | lock | 🟡 CVE | V3 |
| TypeScript | 5.8.3 | lock | 🟢 | V3 |
| Vitest | 3.2.4 (<3.2.6) | lock | 🔴 CVE critical (dev UI) | V3 |
| PostCSS | 8.5.6 | lock | 🟡 CVE | V3 |
| Rollup | 4.24.0 | lock | 🟡 CVE | V3 |
| Node בסוכן הביקורת | v22.14.0 / npm 10.9.7 | סשן סוכן | 🟡 לא = Prod | V3 לסשן · **V5 ל-Prod** |
| Node ב-VPS / Actions runners | לא נמדד במלואו בכרך זה | Prod/CI | 🔴 V5 | V5 |
| Deno Edge runtime | לא נמדד | Prod | 🔴 V5 | V5 |

## כיצד נבדק / מקור הראיה
`package-lock.json` versions; `edgeAuth.ts`; `node -v` בסשן; היעדר מדידת VPS.

## סיכונים
- פער גרסאות לא מתועד בין מפתחים / CI / VPS.
- Edge unpinned → התנהגות משתנה עם הזמן ללא שינוי lock של הפרונט.

## המלצות
- לתעד Matrix גרסאות רשמי (Node ל-Actions, Node ל-VPS אם רלוונטי, Deno).
- לנעוץ ייבוא Edge.
- לעדכן vitest ≥3.2.6 בסביבת dev — **לא בוצע כאן**.

---

# 81. CVEs

## מתודולוגיה
- בוצע `npm audit --package-lock-only` **לקריאה בלבד**.
- **לא** הורצו `npm audit fix` / שדרוגים / שינויי lock.
- כל ממצא מסווג לפי: קיום ב-lock · האם ב-bundle runtime · נתיב ניצול סביר.
- יישור מלא ל-`bun.lock` לכל CVE = **V5** (דגימה חלקית בלבד הראתה התאמה בגרסאות ליבה).

## סיכום כמותי
| חומרה | כמות |
|--------|------|
| critical | 1 |
| high | 14 |
| moderate | 7 |
| low | 1 |
| **סה״כ** | **23** |

## CVE Register (תמצית אנליטית)

| חבילה | חומרה | ישיר? | ב-Prod runtime SPA? | נתיב ניצול סביר | סטטוס הערכה |
|--------|--------|--------|---------------------|-----------------|-------------|
| `vitest` <3.2.6 | critical | כן | **לא** (dev) | Vitest UI — קריאת/הרצת קבצים כשהשרת מאזין | 🟡 סיכון dev · לא runtime Prod |
| `react-router-dom` / `react-router` / `@remix-run/router` | high | כן (dom) | **כן** | XSS דרך open redirects / protocol-relative | 🟡 דורש ניתוח משטחי ניתוב · לא הוכח ניצול חי |
| `vite` | high | כן | לא כשרת dev ב-Prod; כן ככלי build | בעיקר dev server / middleware | 🟡 build/dev |
| `postcss` | high | כן (גם transitive) | עקיף בבילד CSS | XSS ב-stringify / sourceMappingURL | 🟡 בעיקר pipeline |
| `rollup` | high | לא | בילד | path traversal בכתיבת קבצים בבילד | 🟡 CI/dev |
| `ws` | high | לא | תלוי שימוש | memory/DoS | 🟡 V5 לנתיב באפליקציה |
| `lodash` | high | לא | תלוי | template/prototype pollution | 🟡 V5 לנתיב |
| `minimatch` / `glob` / `brace-expansion` | high | לא | כלי/טרנזיטיבי | ReDoS / cmd injection ב-CLI | 🟡 בעיקר כלי |
| `js-yaml` / `flatted` / `form-data` | high | לא | תלוי | DoS / prototype / CRLF | 🟡 |
| `esbuild` | moderate | לא | dev | dev server request forgery | 🟡 dev |
| `googleapis` (+ uuid/gaxios) | moderate | כן (devDep) | לא ב-SPA | סקריפטים | 🟡 scripts |
| `ajv` / `yaml` | moderate | לא | תלוי | ReDoS / stack overflow | 🟡 |
| `@tootallnate/once` | low | לא | תלוי | control flow | 🟡 נמוך |

### ממצאים נבחרים (§81)
| מזהה | כותרת | סטטוס | חומרה | ודאות |
|------|--------|--------|--------|--------|
| CQ-81-01 | 23 ממצאי npm audit על package-lock | 🟡 מלאי | מידע→קריטי לפי חבילה | V3 |
| CQ-81-02 | critical ב-vitest הוא משטח **dev UI** | 🟡 | גבוה ל-dev, נמוך ל-Prod user | V3 |
| CQ-81-03 | react-router בשרשרת Prod SPA | 🟡 | גבוה פוטנציאלי | V3 לקיום · V5 לניצול חי |
| CQ-81-04 | אין הוכחה שכל 23 קריטיים למשתמש קצה | 🟢 מתודולוגיה | — | V3 |

## כיצד נבדק / מקור הראיה
`npm audit --package-lock-only --json`; מיפוי ישיר/טרנזיטיבי; הצלבה לידיעת ארכיטקטורת SPA (אין Vitest UI ב-Prod).

## סיכונים
- בלבול בין ממצא audit לבין סיכון עסקי ב-Production.
- פער bun/npm עלול להסתיר או להציג ממצאים לא מדויקים.

## המלצות
- לטפל קודם ב-`react-router*` (משטח Prod) לאחר בדיקת open-redirect באפליקציה.
- לעדכן vitest בסביבת dev.
- לקבוע SLA ל-CVE לפי runtime vs build vs scripts.
- **לא** להריץ `audit fix` עיוור בלי רגרסיה.

---

# 82. Hardcoded Values

> **אזהרה:** במסמך זה מופיעים **סוגי** ערכים ונתיבים בלבד. אין הדבקת מפתחות/JWT מלאים.

## מצב קיים — ספירות חיפוש (עץ repo, ללא node_modules)

| דפוס | קבצים (סדר גודל) | הערות | סטטוס |
|------|-------------------|--------|--------|
| `dalia-car.online` | ~113 | דומיין Prod לגיטימי בסקריפטים/docs | 🟡 |
| hosts `*.supabase.co` / project refs | ~153 | כולל Prod+Staging+דוגמאות | 🟡 |
| `localhost` | ~60 | בעיקר scripts/dev | 🟡 |
| JWT-like (`eyJ…`) | **לפחות 8 נתיבים** | ראו Register | 🔴 |
| טלפונים/אימיילים/IP | עשרות–מאות מופעים בסקריפטים | לא מועתקים | 🟡 |

## Hardcoded Values Register (ללא סודות)

| מזהה | סוג | מיקום | סביבה | חומרה | סטטוס | ודאות |
|------|------|--------|--------|--------|--------|--------|
| CQ-82-01 | קובץ `.env` **במעקב git** | `.env` (למרות `.gitignore`) | Staging host `usfeoerkpcafxxlyuldl`; מפתחות anon/publishable באורך ~208 | **קריטי (חשיפת repo)** | 🔴 | V1 לקיום הקובץ ב-git |
| CQ-82-02 | JWT-like במיגרציה | `supabase/migrations/20260424090419_89f166d5-5404-40a3-8c2a-63a3ef9b4d84.sql` | קוד/היסטוריית git | גבוה | 🔴 | V3 |
| CQ-82-03 | JWT-like בסקריפטים | `scripts/staging-health-check.mjs`, `wa-ui-alert-e2e.mjs`, `audit-staging-schema.mjs`, `staging-demo-fault-whatsapp-once.mjs` | scripts | גבוה | 🔴 | V3 |
| CQ-82-04 | JWT-like ב-docs/deploy | `docs/deploy-setup/set-github-secrets*.ps1`, `DEPLOYMENT.md` | docs | גבוה | 🔴 | V3 |
| CQ-82-05 | אימייל Owner / בדיקות | סקריפטים + Edge (למשל create-admin-user staging test email) | קוד | בינוני | 🟡 | V3 |
| CQ-82-06 | Project ID ב-bundle חי | `qasomfndnjuixgjmjwcm` | Production SPA | מידע (צפוי ל-anon client) | 🟢 צפוי · 🟡 מודעות | V1 |
| CQ-82-07 | שימוש נכון ב-env בפרונט | `import.meta.env.VITE_SUPABASE_*` ב-`client.ts` | קוד | — | 🟢 | V3 |
| CQ-82-08 | IP VPS / דומיין בסקריפטים | scripts/docs | ops | נמוך–בינוני | 🟡 | V3 |

### הערת ריפו ציבורי
הריפו **Public** (כרכים קודמים, V1). קיום `.env` + מחרוזות JWT-like ב-git מגדיל חשיפה גם אם המפתחות הם anon/staging — ויש לבצע רוטציה/ניקוי היסטוריה בנפרד (לא בוצע כאן).

## כיצד נבדק / מקור הראיה
`git ls-files .env`; קריאת **שמות מפתחות** ו-host בלבד מ-`.env`; `rg` לדפוסי JWT/domain; הצלבה ל-`client.ts` ולכרך ז'.

## סיכונים
- חשיפת מפתחות/טוקנים בריפו ציבורי ובהיסטוריית git.
- בלבול Staging/Prod בגלל `.env` שנכנס ל-clone.
- מיגרציות עם Bearer JWT — סיכון היסטורי גם אחרי מחיקה מה-HEAD אם לא טופלה היסטוריה.

## המלצות
- להסיר `.env` ממעקב git, לוודא ignore, ולבצע רוטציה למפתחות שנחשפו.
- לנקות JWT ממיגרציות/סקריפטים/docs ולהעביר ל-secrets.
- לסרוק היסטוריית git לטוקנים (כלי ייעודי) — מחוץ לכרך זה.

---

# 83. TODO / FIXME / HACK / TEMP / placeholders / mocks

## מצב קיים

| קטגוריה | ממצא | סטטוס | ודאות |
|---------|--------|--------|--------|
| `TODO:` / `FIXME:` / `HACK:` ב-`src`+`supabase` | כמעט אין (רעש מ-CSS/policies) | 🟢 מיעוט | V3 |
| `index.html` | `<!-- TODO: Update og:title to match your application name -->` | 🟡 | V3 |
| `project-001-ai-marketing/src/Config.gs` | TODO Phase 1–4 (connectors/analysis/content/publish) | 🟡 מוצר לא שלם | V3 |
| Dry-run UI | `TransportImportPage.tsx` — "יבוא נתונים — Dry Run" | 🟡 | V3 |
| Mocks מפורשים | `notificationLogMock.ts` ("Mock data — no DB"); `whatsappUiMock.ts` ("UI-only mock…") | 🟡 | V3 |
| Dev mocks | `src/dev/*PreviewMock.ts` | 🟡 + קשר ל-`/dev` | V3 |
| Placeholders תצהירים | `declarationTemplates` — מנגנון `{{placeholder}}` לגיטימי | 🟢 | V3 |
| TEMP ב-SQL | מדיניות/נהגים זמניים אפשריים — **לא** סווגו אוטומטית כ-TODO אבטחה | 🟡 זהירות מתודולוגית | V3/V4 |

### ממצאים נבחרים (§83)
| מזהה | כותרת | סטטוס | חומרה | ודאות |
|------|--------|--------|--------|--------|
| CQ-83-01 | מיעוט TODO קלאסי בליבת `src` | 🟢 | — | V3 |
| CQ-83-02 | Project001 עם TODO שלבי מוצר | 🟡 | בינוני (מוצר) | V3 |
| CQ-83-03 | שכבות mock/dry-run פעילות בקוד | 🟡 | בינוני | V3 |
| CQ-83-04 | og:title TODO ב-`index.html` | 🟡 | נמוך | V3 |

## כיצד נבדק / מקור הראיה
`rg TODO/FIXME/HACK`; קריאת mocks ו-TransportImport; הימנעות מספירת placeholder UI כחוב.

## סיכונים
- Mocks עלולים להיכנס ל-UX אמיתי אם לא מופרדים היטב.
- TODO בשיווק עלול להיתפס כהבטחת מוצר (קשר לכרך שיווק עתידי).

## המלצות
- לקטלג mocks כ-dev-only ולהוציא מ-Prod build.
- לסגור או להסיר TODO ב-`index.html`.
- לא להציג Project001 כהושלם בלי Owner Gate.

---

# 84. קוד ישן / מת / לא פעיל / חוב טכני

## מצב קיים

| נושא | ממצא | סטטוס | ודאות |
|------|--------|--------|--------|
| Dual locks | `bun.lock` + `bun.lockb` + `package-lock.json` | 🟡 | V3 |
| תלות מתה | `zod` ללא ייבוא | 🟡 | V3 |
| `/dev` + Dev pages | 17 דפים + נתיבים ב-Prod bundle | 🔴 | V1/V3 |
| Marketing Edge ב-repo מול Prod | פונקציות marketing-* ב-`main` מחזירות **404** ב-Prod (כרך ז') | 🟡 קוד עודף מול Prod | V1 |
| פערי Edge hardening | `check-driver-availability` / `check-exam-expiry` ב-Prod שונים מ-`main` (כרך ז') | 🔴 יישור גרסאות | V1 |
| `types.ts` מול DB | חסר לפחות `incident_notification_deliveries` ב-types מול שימוש E2E (כרך ה') | 🟡 drift | V2 |
| `googleapis` כ-devDependency לסקריפטים | כן | 🟡 | V3 |
| ריפו Public + default branch `production` | כן | 🟡 | V1 |
| בדיקות יחידה | 17 בלבד מול ~93 עמודים | 🟡 כיסוי נמוך | V3 · **V5** לאחוז כיסוי |
| CI preview | bun install + vite build + smoke — **ללא** lint/typecheck/test מלא בנתיב זה | 🟡 | V3 |
| E2E/ops | עשרות workflows/scripts ל-WA/Make/Prod — קיימים כראיות תפעול | 🟢 נוכחות · 🟡 אחידות | V3 |

### Frontend exposure (סיכום לכרך קוד)
| פריט | מצב | סטטוס | ודאות |
|------|------|--------|--------|
| Anon/publishable ב-bundle | צפוי ל-SPA | 🟢/🟡 | V1/V3 |
| שמות Edge functions / routes | חשופים ב-JS | 🟡 | V1 |
| `/dev` routes | חשופים | 🔴 | V1 |
| Source maps ציבוריים | לא אומת חשיפה; `.map`→HTML | 🟢 נטייה | V2 |
| `console.*` ב-bundle | קיים | 🟡 | V2 |

### Validation / Errors / Tests / CI (סיכום רוחב)
| נושא | ממצא | סטטוס |
|------|--------|--------|
| ולידציית FE | שדות חובה מודולריים + טפסים מקומיים; לא zod end-to-end | 🟡 |
| ולידציית Edge/webhooks | חלקית לפי פונקציה; הצלבה לכרך ז' | 🟡 |
| שגיאות | `edgeFunctionError` חיובי; לא אחיד בכל הדפים | 🟡 |
| Unit tests | 17 ממוקדים | 🟡 |
| E2E מתועדים | כן (Notifications Live וכו') | 🟢 נוכחות |
| Coverage % | לא נמדד | 🔴 V5 |
| Branch protection | `gh` 403 בעבר | 🔴 V5 |

### ממצאים נבחרים (§84)
| מזהה | כותרת | סטטוס | חומרה | ודאות |
|------|--------|--------|--------|--------|
| CQ-84-01 | קוד dev ב-Prod bundle | 🔴 | גבוה | V1 |
| CQ-84-02 | Drift types/migrations/Edge↔Prod | 🔴/🟡 | גבוה | V1/V2 |
| CQ-84-03 | Dual package managers | 🟡 | בינוני | V3 |
| CQ-84-04 | כיסוי בדיקות יחידה נמוך | 🟡 | בינוני | V3 |
| CQ-84-05 | CI ללא שער lint/test מלא | 🟡 | בינוני | V3 |

## כיצד נבדק / מקור הראיה
ספירות עץ; הצלבה לכרכים ד'/ה'/ז'/ח'; audit; קריאת workflow; רשימת tests.

## סיכונים
- "קוד מת" ב-Prod מרחיב משטח תקיפה ותחזוקה.
- Drift בין repo ל-Prod שובר הנחות אבטחה ("הקוד המחוסן" ≠ "מה שרץ").
- CI חלקי מאפשר רגרסיה בלי שער איכות.

## המלצות
- מלאי Edge חי מול `main` + יישור.
- הסרת dev/marketing הלא-פרוסים מ-build או ממודול נפרד.
- שער CI: lint + `tsc` + vitest על PR.
- רענון `types.ts` מול Prod.

---

# Codebase Inventory

| רכיב | כמות / הערה |
|------|-------------|
| עמודי UI (`src/pages/**/*.tsx`) | 93 |
| מיגרציות | 89 |
| Edge function directories | 34 |
| Unit tests | 17 |
| Dev pages (`Dev*.tsx`) | 17 |
| Dependencies ישירות | 52 + 24 dev |
| חבילות לפי audit metadata | ~627 |
| Lockfiles | 3 (npm + bun ×2) |
| סקריפטים (עץ `scripts`) | ~316 |
| Workflows (שורות מצטברות בסדר גודל) | אלפי שורות תחת `.github/workflows` |

---

# Code Quality Findings (מדגם מאוחד)

| מזהה | סעיף | סטטוס | כותרת |
|------|------|--------|--------|
| CQ-76-01 | 76 | 🔴 | TypeScript לא strict |
| CQ-76-04 | 76 | 🟢 | Supabase client מטיפוס + env |
| CQ-76-06 | 76 | 🟢 | עזרי ולידציה/שגיאות עם טסטים |
| CQ-77-01 | 77 | 🔴 | `/dev` ב-Prod bundle |
| CQ-77-02 | 77 | 🟢 | מבנה FE/Edge/docs ברור |
| CQ-78/79 | 78–79 | 🟡 | zod לא בשימוש; dual locks |
| CQ-81-02 | 81 | 🟡 | vitest critical = dev |
| CQ-81-03 | 81 | 🟡 | react-router ב-Prod SPA |
| CQ-82-01 | 82 | 🔴 | `.env` tracked ב-git |
| CQ-82-02..04 | 82 | 🔴 | JWT-like בקבצים |
| CQ-83-01 | 83 | 🟢 | מיעוט TODO בליבה |
| CQ-84-02 | 84 | 🔴/🟡 | Drift קוד↔Prod |

**אין ציון מספרי לאיכות הקוד בכרך זה.**

---

# Dependency Inventory (תמצית)

| קבוצה | דוגמאות | הערה |
|--------|----------|------|
| Runtime UI | react 18.3.1, react-router-dom 6.30.1, radix, tanstack query | ב-SPA |
| Backend client | @supabase/supabase-js 2.98.0 | ב-SPA |
| Validation (מוצהר) | zod 3.25.76 | **לא בשימוש** |
| Voice | @elevenlabs/* | UI קיים; Prod חלקי |
| Build | vite 5.4.19, typescript 5.8.3, rollup 4.24.0, postcss 8.5.6 | |
| Test | vitest 3.2.4, playwright | |
| Scripts | googleapis | devDependency |

---

# CVE Register — סיכום הנהלה
- **23** ממצאים ב-`package-lock` audit.
- **1 critical** (`vitest`) — משטח פיתוח, לא משתמשי Prod.
- **high רלוונטי ל-SPA:** משפחת `react-router` / `@remix-run/router` — דורש ניתוח open-redirect; **לא** סומן כניצול מאומת ב-Prod.
- יתר high/moderate — בעיקר build/transitive/scripts; אין להציגם כולם כקריטיים ללקוח קצה.

---

# Hardcoded Values Register — סיכום הנהלה
- ממצא חמור: **`.env` במעקב git** בריפו ציבורי (Staging + מפתחות publishable/anon).
- JWT-like בלפחות מיגרציה אחת, סקריפטים ו-docs/deploy.
- דפוס חיובי: לקוח הפרונט קורא מ-`import.meta.env`.
- Project ID ב-bundle — צפוי ל-anon client.

---

# Technical Debt Register

| # | חוב | סעיף | עדיפות |
|---|-----|------|--------|
| 1 | `/dev` + mocks ב-Prod | 77/84 | דחוף |
| 2 | `.env` + JWT ב-git | 82 | דחוף |
| 3 | יישור Edge/types מול Prod | 84 | דחוף |
| 4 | TypeScript strict כבוי | 76 | 30 יום |
| 5 | Dual locks / אין packageManager | 79/80 | 30 יום |
| 6 | zod לא בשימוש | 78/79 | 30 יום |
| 7 | דפים מונוליטיים + `any` | 76 | 30–90 יום |
| 8 | CI ללא lint/test מלא | 84 | 30 יום |
| 9 | כיסוי בדיקות נמוך | 84 | 90 יום |
| 10 | Project001 TODO / marketing לא פרוס | 83/84 | 90 יום |

---

# Code Risk Summary

| רמת סיכון קוד | נושאים עיקריים |
|----------------|----------------|
| גבוה (מאומת כפער) | `/dev` ב-Prod; `.env`/JWT ב-git; drift Edge/types מול Prod |
| בינוני | TS לא strict; dual locks; CVEs ב-router; CI חלקי; קבצים גדולים |
| נמוך / מידע | og:title TODO; תלויות UX תקינות; anon key ב-bundle (צפוי) |
| חוזקות | מבנה תיקיות; client מטיפוס; edgeAuth משותף; עזרי ולידציה+טסטים; E2E תפעולי קיים |

---

# רשימת פערי V5

| נושא | חסר |
|------|------|
| Node/Deno מדויק ב-VPS וב-Edge Prod | גישת SSH/Management |
| יישור מלא bun.lock ↔ npm audit לכל CVE | השוואת עץ מלאה / כלי bun audit רשמי |
| אחוז כיסוי בדיקות | דוח coverage |
| Branch protection בפועל | הרשאת `gh` (403 בעבר) |
| ניצול חי של open-redirect ב-react-router | מבחן אבטחה ממוקד |
| האם source maps חשופים בכל הנתיבים | סריקת CDN/nginx מלאה |
| האם כל המפתחות ב-`.env` עדיין תקפים | Owner / רוטציה |

---

# פעולות דחופות
1. להסיר `.env` מ-git, לוודא ignore, ולסובב מפתחות שנחשפו (Staging/anon לפי הצורך).
2. להוציא `/dev/*` ו-mocks מ-build Production.
3. לנקות JWT-like ממיגרציות/סקריפטים/docs ולהעביר ל-secrets.
4. לייצר מלאי Edge חי מול `main` ולסגור פערי hardening שכבר תועדו.

# פעולות ל-30 יום
1. יישור מנהל חבילות יחיד + `packageManager`/`engines`.
2. שער CI: lint + typecheck + vitest על PR.
3. תוכנית הפעלת TypeScript strict הדרגתית.
4. טיפול ממוקד ב-CVE של `react-router*` לאחר בדיקת משטח.
5. הסרת/אימוץ `zod`; רענון `types.ts`.

# פעולות ל-90 יום
1. פיצול דפים מונוליטיים והפחתת `any`.
2. הרחבת כיסוי בדיקות ליחידות ליבה + רגרסיית הרשאות.
3. הפרדת מודולי marketing/Project001 מליבת הצי אם אינם ב-Prod.
4. מדיניות CVE מתמשכת (runtime vs build vs scripts).

---

# מסקנה מרכזית
הקוד מאורגן במבנה FE/Edge ברור עם מספר חוזקות הנדסיות (לקוח מטיפוס, `_shared/edgeAuth`, עזרי ולידציה ובדיקות ממוקדות). מולם מתועדים פערים מאומתים: **TypeScript לא strict**, **משטח `/dev` ב-Production**, **סודות/JWT-like ו-`.env` ב-git**, **תלויות כפולות/מתות**, ו-**23 ממצאי audit** שיש לפרש לפי נתיב ניצול ולא כמספר בלבד. **לא הוצג ציון איכות קוד מספרי** — זה שמור לכרך י"ט.

## אישור מתודולוגיה
| בדיקה | תוצאה |
|--------|--------|
| סעיפים 76–84 | כן |
| Codebase Inventory + Registers | כן |
| ללא ציוני Readiness/Enterprise | כן |
| ללא שינוי קוד/תלויות/Prod | כן |
| ללא הדבקת סודות במסמך | כן |

**סוף כרך ט' – קוד**
