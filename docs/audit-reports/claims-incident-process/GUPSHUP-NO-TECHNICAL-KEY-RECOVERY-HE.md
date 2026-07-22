# פסק דין: אין דרך טכנית לשחזר GUPSHUP_API_KEY

**תאריך:** 2026-07-22  
**חשבון מחובר:** `yoni19111977@gmail.com` (Google) — חשבון מקורי  
**App:** `DaliaVehicle` · App ID `496709e8-b5fc-4de9-9c75-bc87455482dd`  
**Production:** לא בוצע

---

## פסק דין מפורש

**אין דרך טכנית לשלוף / לשחזר את ערך המפתח הקיים** — לא מ-Gupshup Management/Account/Partner API, לא מ-Supabase Management API, ולא מהפורטל במצב הנוכחי.

לכן **הצעד הבא הנכון הוא פנייה ל-Gupshup Support.**

---

## 1) האם זו מגבלת הרשאות Gupshup?

**חלקית כן — ומדיניות אבטחה של הפלטפורמה:**

| תופעה | משמעות |
|--------|--------|
| רואה את האפליקציה + App ID הנכון | החשבון `yoni19111977@gmail.com` הוא בעל גישה לאפליקציה |
| API Keys = No Data | אין מפתח App גלוי; מפתחות account-level **מוסתרים בכוונה** מה-UI (מדיניות Feb 2026) |
| Create → Authentication Failed | פעולת יצירת App key נכשלת באימות — גם כשאתה בחשבון המקורי. זו **תקלה/חסימה בצד Gupshup** (session/API של Create), לא «חשבון שגוי» |
| תפריט API key מחזיר לאותו Account | אין מסך שחזור נפרד — אין «הצג מפתח קיים» |

כלומר: גם Owner רואה את האפליקציה, אבל **אין ממשק לשחזור ערך מפתח ישן**, ו-Create אצלך שבור/חסום.

מדיניות Gupshup (Apr 2026): App API Keys / Tokens **נראים פעם אחת** אחרי יצירה — אחרי זה לא ניתנים לשליפה מה-UI.

---

## 2) האם אפשר לשלוף בדרך אחרת?

| ערוץ | אפשר לשלוף ערך מפתח? | למה |
|------|----------------------|-----|
| **Supabase Management API** `GET /v1/projects/{ref}/secrets` | **לא** | מחזיר שמות (ולכל היותר digest) — **לא plaintext**. Staging מוכיח שהמפתח *קיים*, לא מה הערך |
| **Supabase Dashboard** Secrets | **לא** (בדרך כלל) | write-only אחרי שמירה |
| **Gupshup Partner / Account API** | **לא בלי מפתח קיים** | אין endpoint מתועד שמחזיר plaintext של API key קיים; `appLink` **דורש** `apiKey` כקלט; Get Partner Apps מחזיר מטא-דאטה (id/name/phone) לא secret |
| **Edge Function runtime** | **לא** לסוכן | המפתח נטען רק בזמן ריצה בצד שרת; אין API שלנו שמדפיס אותו (ובכוונה) |
| **GitHub Secrets / VPS** | **לא נמצא** | CI קודם: אין `GUPSHUP_API_KEY` ב-Actions; VPS SSH timeout |
| **פורטל Gupshup (מצבך)** | **לא** | No Data + Create Auth Failed |

**מסקנה:** המפתח ב-Staging **עובד** אבל **לא ניתן להעתקה טכנית** לסביבת Production.

---

## 3) הצעד הבא — Gupshup Support

שלח מ-`yoni19111977@gmail.com` אל Support / `dev-support@gupshup.io`:

```text
Subject: Cannot create/view API Key — Authentication Failed — App DaliaVehicle

Hello Gupshup Support,

I am the account owner logged in with Google:
Email: yoni19111977@gmail.com

App Name: DaliaVehicle
App ID: 496709e8-b5fc-4de9-9c75-bc87455482dd
WhatsApp source / WABA number: 972546500305

Issue:
1) Settings → API Keys table shows "No Data"
2) Create API Key returns "Authentication Failed"
3) There is no way to view/copy an existing API key in the UI
4) Account-level keys (if any) are not displayed

We have a working API key stored only in our Staging environment (cannot be read back via Supabase Management API). We need either:
A) Fix Create API Key for this account so we can generate a new App API Key, or
B) Securely provide/regenerate an App API Key for this App ID to the account owner.

Thank you.
```

אחרי שתקבל מפתח מ-Support (או שCreate יתוקן אצלם):

1. הדבק ב-Production Edge Secrets בלבד (אל תשלח בצ׳אט)  
2. כתוב **«סיימתי Gupshup»**  
3. נאמת — ורק אז **«אשר Production»**

---

## אל תעשה

- אל תלחץ Create שוב עד ש-Support יאשרו שתוקן  
- אל תמחק את האפליקציה  
- אין פריסת Production
