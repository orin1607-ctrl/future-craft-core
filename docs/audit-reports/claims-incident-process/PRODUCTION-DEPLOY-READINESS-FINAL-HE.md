# דוח פריסה סופי — מוכנות Production (ללא ביצוע)

**תאריך:** 2026-07-21  
**סטטוס:** Staging הושלם בהצלחה · **פריסת Production לא בוצעה**  
**אימות Secrets (2026-07-21):** `SUPABASE_ACCESS_TOKEN` תקין · `RESEND_API_KEY` קיים · **`GUPSHUP_API_KEY` חסר ב-Prod** → עדיין **לא** ready  
**פירוט:** `PROD-SECRETS-VERIFY-HE.md` · Actions run `29868047586`  
**תנאי מעבר:** השלמת GUPSHUP ב-Prod + אימות חוזר, ואז Owner כותב במפורש: **`אשר Production`**

---

## 0) אישורים מפורשים

| נושא | סטטוס |
|------|--------|
| מודול תביעות | **לא שונה** · אין מסלול תביעות ב-`notify-accident-email` |
| מנגנון התראות חדש | **לא נבנה** · רק חיבור/תיקון של מסלול קיים (תקלה/תאונה) |
| Production | **לא בוצע** בדוח זה |

---

## 1) כל השינויים שבוצעו היום (Staging)

| # | נושא | מה נעשה | היכן מתועד |
|---|------|---------|------------|
| 1 | חיבור / תיקון WhatsApp–Gupshup | שליחת session text מ-Edge; אבחון נתיבים; E2E חי | דוחות WA / UI E2E |
| 2 | תיקון Whatsapp Bot (Make) | תשובות חיות; Active+linked; הסרת Forward שבור מהבוט | `WA-BOT-FIX-REPLY-HE.md` |
| 3 | ניקוי התור | מחיקת incomings ישנים לפני E2E; תור ריק אחרי בדיקות | סקריפטי bot / one-way |
| 4 | הסרת Sleep | מודולי Sleep **88/77** הוסרו (אחרי Gupshup, 1ש׳ כ״א) | `WA-BOT-STAGE1-OPT-HE.md` |
| 5 | טיפול במודול 58 | `handleErrors=false` + `onerror` Ignore; תרחיש לא נכבה על HTTP 400 | `WA-BOT-FIX-ACTIVE-58-HE.md` |
| 6 | חיבור DLR | תרחיש ייעודי `9553017` → Staging `gupshup-webhook`; תיקון `createJSON` | `MAKE-FIX-TOJSON-HE.md` · `STAGING-DLR-*` |
| 7 | התראות דרך UI (תקלה/תאונה) | E2E כיוני: `/alert-settings` → `/faults` → שלח דיווח | `WA-UI-ALERT-E2E-HE.md` · `FLT-2026-000003` |
| 8 | WhatsApp + Email | Gupshup `sent` + Resend `sent` דרך UI | אותו E2E |
| 9 | הפרדת Reply להתראה מהבוט | Router: Message ID ב-`incident_notification_deliveries` → skip בלי AI | `WA-ALERT-ONE-WAY-HE.md` |
| 10 | Footer | `זוהי הודעת מערכת אוטומטית ואין להשיב לה.` | `notify-accident-email` + `incidentNotify.ts` |

**Commit ראש (Staging מוכן):** `8b25053` על `main`  
**Supabase Staging:** `usfeoerkpcafxxlyuldl`  
**Make Bot (חי):** תרחיש `5797671` · Hook `2567320`

> הערה חשובה על Make: תרחיש Whatsapp Bot מחובר למספר העסקי החי. השינויים ב-Make (Sleep / 58 / one-way) **כבר חלים על אותו תרחיש** שנבדק ב-Staging — אין עותק Make נפרד ל-Production.

---

## 2) רשימה מדויקת — מה עובר ל-Production (כשיהיה אישור)

### 2.1 קוד / Commit

| פריט | ערך |
|------|-----|
| Branch | `main` |
| Tip מומלץ לפריסה | `8b25053` (או HEAD עדכני אחרי אישור, בלי שינויי Prod נוספים) |
| Frontend Prod | Hostinger / `deploy-production-vps.yml` (Environment Approve) |
| Preview | `dalia-ci-preview.yml` (אוטומטי מ-`main` — כבר רץ על push) |

קבצי ליבה רלוונטיים:

- `supabase/functions/notify-accident-email/index.ts` — footer + שליחה
- `supabase/functions/gupshup-webhook/index.ts` — DLR + `check_system_alert`
- `src/lib/incidentNotify.ts` · `src/lib/incidentCreate.ts` · מסכי `/faults` `/accidents` `/alert-settings`
- `public/ai-marketing/coco-mission-control.js` (מרכז משימה — לא קריטי ל-runtime Prod)

### 2.2 Edge Functions (Production ref `qasomfndnjuixgjmjwcm`)

| Function | חובה לפריסה? | הערות |
|----------|---------------|--------|
| `notify-accident-email` | **כן** | Footer + לוגיקת התראות תקלה/תאונה |
| `gupshup-webhook` | **כן** | DLR + בדיקת Message ID לחד-כיווניות |
| `send-whatsapp-message` | מומלץ אם חסר/ישן | בדיקות/פרוב — לא מסלול UI הראשי |

פריסה מתוכננת (רק אחרי `אשר Production`):

```text
workflow_dispatch: deploy-edge-incident-notify.yml → target=production
+ deploy ידני/סקריפט ל-gupshup-webhook על אותו project-ref
```

### 2.3 Supabase migrations (Production DB)

| Migration | תפקיד | לבדוק אם כבר הוחל |
|-----------|--------|-------------------|
| `20260719010000_incident_event_number_and_alert_settings.sql` | מספרי אירוע + `incident_notify_*` | ייתכן שחלק כבר ב-Prod מגו-לייב קודם |
| `20260719080000_incident_notification_deliveries.sql` | טבלת משלוחים | — |
| `20260721080000_gupshup_dlr_deliveries.sql` | שדות DLR / סטטוסים | — |
| `20260721090000_delivery_status_history.sql` | היסטוריית סטטוס | — |

**אין migration חדש למודול תביעות.**

### 2.4 Secrets (Production)

| Secret | מיקום | סטטוס ידוע |
|--------|--------|------------|
| `GUPSHUP_API_KEY` | Supabase Edge Prod | **חסר / לא מוגדר** (`configured: false` בדוח Go-Live) |
| `GUPSHUP_SOURCE` / `GUPSHUP_APP_NAME` | Edge Prod | לאמת מול Staging (`972546500305` / `DaliaVehicle`) |
| `RESEND_API_KEY` / `RESEND_FROM` | Edge Prod | כנראה קיים — לאמת |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets | היסטוריית 401 — **לאמת לפני deploy Edge** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | GitHub (build Prod) | נדרש ל-frontend Prod |
| VPS SSH (`VPS_*`) | GitHub | לפריסת Hostinger |

### 2.5 Make — scenarios / modules

| תרחיש | ID | Hook | מה כבר שונה | פעולת Prod |
|-------|-----|------|-------------|------------|
| Whatsapp Bot | `5797671` | `2567320` | Sleep הוסר · soft-fix 58 · Router one-way (Message ID) | **כבר חי** — אין «העתקה ל-Prod»; רק לוודא Active אחרי פריסת Edge Prod |
| CO.CO Dalia DLR → Staging | `9553017` | `4270688` | Forward ל-Staging webhook | להחליט: להשאיר Staging, או ליצור/לשנות URL ל-Prod `gupshup-webhook` |

מודולים קריטיים בבוט: Webhook → Lookup/`check_system_alert` → Normalize flag → Router (skip / chat) → AI → Gupshup **87** · מודול **58** עם Ignore ב-onerror.

### 2.6 Webhooks

| Webhook | יעד נוכחי | ל-Production |
|---------|-----------|--------------|
| Gupshup inbound (הודעות) | Make Hook `2567320` (Bot) | ללא שינוי Portal אלא אם Owner מחליט |
| DLR / Delivery | Make DLR `4270688` → Staging Edge | לעדכן ל-Prod Edge **רק אם** רוצים DLR ב-Prod DB |
| Staging Edge | `…usfeoerkpcafxxlyuldl…/gupshup-webhook` | נשאר ל-Staging |
| Prod Edge (עתידי) | `…qasomfndnjuixgjmjwcm…/gupshup-webhook` | אחרי deploy + עדכון Make DLR (אופציונלי) |

### 2.7 הגדרות Gupshup

| פריט | ערך / הערה |
|------|------------|
| App | `DaliaVehicle` (Staging) |
| Source | `972546500305` |
| שינוי Portal ל-Prod | **לא חובה** אם אותו חשבון משרת גם Prod Edge עם אותו API key |
| חובה לפני Prod Edge | `GUPSHUP_API_KEY` ב-Secrets של פרויקט Prod |

### 2.8 Frontend

| פריט | הערה |
|------|------|
| Staging Pages | כבר מעודכן מ-`main` |
| Production `dalia-car.online` | דורש `deploy-production-vps` + Approve Environment |
| שינויי UI קריטיים | preview התראה + מסלול תקלה/תאונה הקיים; **אין מסך תביעות חדש** |

---

## 3) Secrets שחסרים / דורשים אימות ב-Production

| Secret | חומרה | פעולת Owner |
|--------|--------|-------------|
| `GUPSHUP_API_KEY` ב-Edge Prod | **חוסם WhatsApp** | להוסיף ב-Dashboard Prod |
| `GUPSHUP_SOURCE` / `GUPSHUP_APP_NAME` | גבוה | ליישר ל-Staging אם חסרים |
| `SUPABASE_ACCESS_TOKEN` (GitHub) | חוסם deploy Edge | לוודא Management API ≠ 401 |
| `RESEND_*` ב-Prod | בינוני | smoke אחרי deploy |
| עדכון Make DLR → Prod webhook | אופציונלי | רק אם רוצים DLR ב-DB של Prod |

עד ש-`GUPSHUP_API_KEY` ב-Prod לא מוגדר — **אין טעם לפרוס Edge התראות ל-WhatsApp חי**.

---

## 4) תוכנית Rollback מלאה

### 4.1 קוד / Frontend

1. `rollback-production-vps.yml` (workflow_dispatch + Environment) — חזרה ל-dist קודם ב-VPS.  
2. או: deploy של commit קודם ידוע-טוב (לפני `54e65d9` / לפני footer+one-way אם רוצים לבטל גם UI preview).  
3. Staging Pages: לא חובה לגלגל אחורה אלא אם משפיע על בדיקות.

### 4.2 Edge

1. Redeploy גרסה קודמת של:
   - `notify-accident-email` (בלי footer / בלי שינויי טקסט אם נשמר tag/commit ישן)
   - `gupshup-webhook` (בלי `check_system_alert` אם צריך)
2. פקודה טיפוסית (רק אחרי אישור): deploy מ-commit ישן עם `--project-ref qasomfndnjuixgjmjwcm`.  
3. אם migration כבר רצה — **לא מוחקים טבלאות**; הקוד הישן פשוט מתעלם משדות חדשים.

### 4.3 Make

| שינוי | Rollback |
|-------|----------|
| Router one-way + lookup | Unwrap: להשאיר Webhook → שאר ה-flow הישן (בלי lookup/router); או לשחזר blueprint מגיבוי Make |
| Soft-fix מודול 58 | להחזיר `handleErrors` / להסיר Ignore ב-onerror **רק אם** מוכנים לסיכון כיבוי על 400 |
| Sleep 88/77 | להחזיר רק אם Owner דורש; לא נדרש לתפקוד |
| תור | לא למחוק הודעות Owner בלי צורך |

**ביטול חד-כיווניות בלי לפגוע בבוט:**  
להסיר רק את מודולי Lookup + Normalize + Router, ולהחזיר את מסלול ה-AI/Gupshup 87 כמסלול יחיד אחרי Webhook — הבוט חוזר לענות גם על Reply להתראות.

### 4.4 Webhooks / Gupshup Portal

- לא לשנות Portal בזמן rollback אלא אם שינינו URL בפריסה.  
- אם DLR הופנה ל-Prod — להחזיר ל-Staging hook או לנתק זמנית.

### 4.5 עקרון בטיחות

Rollback של **Edge/Frontend Prod** אינו דורש שינוי Make.  
Rollback של **one-way ב-Make** אינו דורש rollback של Edge (רק התנהגות Reply תחזור).

---

## 5) Checklist — מיד אחרי פריסה (רק כשיהיה `אשר Production`)

סביבה: Production · משתמש: מנהל על יוני · בלי סקריפט שליחה ידני.

| # | בדיקה | קריטריון הצלחה |
|---|--------|----------------|
| 1 | פתיחת תקלה ב-UI | נשמרת · מספר אירוע · הצלחה במסך |
| 2 | פתיחת תאונה ב-UI | כנ״ל |
| 3 | WhatsApp | הודעה ל־0534338601 · status `sent` · Message ID ב-DB |
| 4 | Email | מייל ל־orin1607@gmail.com · status `sent` |
| 5 | Reply להתראה | **אין** תשובת בוט |
| 6 | הודעה חדשה «היי» | **יש** תשובת בוט |
| 7 | תור Make | `queueCount=0` (או לא מצטבר) |
| 8 | Whatsapp Bot | `isActive=true` · `islinked=true` |
| 9 | מודול 58 | אין כיבוי תרחיש · אין סדרת HTTP 400 שעוצרת |
| 10 | כפילויות | אין כפילות WA/Email לאותו אירוע/נמען |

Footer בכל התראת מערכת:  
`זוהי הודעת מערכת אוטומטית ואין להשיב לה.`

---

## 6) סדר פריסה מומלץ (רק אחרי האישור המילולי)

1. Owner: Secrets Prod (`GUPSHUP_*`, אימות `SUPABASE_ACCESS_TOKEN`, `RESEND_*`).  
2. Migrations Prod (אם חסרים).  
3. Deploy Edge: `notify-accident-email` + `gupshup-webhook` → Prod.  
4. Frontend Prod (VPS) מ-`main`.  
5. (אופציונלי) Make DLR → Prod webhook.  
6. Checklist §5.  
7. אם כשל — Rollback §4.

---

## 7) מה לא ייכנס לפריסה

- מודול תביעות / מנגנון התראות חדש  
- שינוי לוגיקת AI / Sheets של הבוט  
- WordPress / Hostinger מחוץ ל-frontend הרגיל בלי אישור  
- Billing / OAuth חדשים  

---

## 8) ממתין ל-Owner

**אין לבצע Production עד שתיכתב במפורש השורה:**

`אשר Production`

עד אז: Staging בלבד · דוח זה הוא תכנון פריסה בלבד.
