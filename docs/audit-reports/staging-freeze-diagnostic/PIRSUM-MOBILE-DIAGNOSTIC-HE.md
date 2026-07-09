# דוח מובייל — למה במחשב עובד ובטלפון נתקע

**תאריך:** 2026-07-09  
**סביבה:** Staging (`orin1607-ctrl.github.io/future-craft-core`)  
**בדיקה:** Pixel 5 emulation (Chrome mobile) + ניתוח קוד

---

## סיכום מנהלים

בדיקות Desktop ו-mobile emulation **עברו ניווט מלא** (Orin → פרסום → עבודה → שליטה, 20 מעברים).  
בטלפון אמיתי המשתמש עדיין חווה תקיעות — הסיבה העיקרית: **מכשיר איטי + חסימת Main Thread + חוסר משוב מיידי**, לא overlay שקוף ולא iframe של Orin.

תוקנו 5 גורמי שורש שמשפיעים במיוחד על מובייל, **בלי פיצ'רים חדשים ובלי שינוי עיצוב מהותי**.

---

## מה עבר בבדיקה (לפני התיקון)

| בדיקה | תוצאה |
|--------|--------|
| Orin boot — אין overlay חוסם | ✓ |
| Touch על כפתור פרסום | ✓ |
| pirsum-home — אין iframe / launcher | ✓ |
| Touch מרכז עבודה | ✓ |
| Touch מרכז שליטה | ✓ |
| 20 מעברים work↔control (Staging emulation) | ✓ (max ~71s) |

---

## למה Desktop לפעמים עובד ו-Mobile נתקע

### 1. קישורים שהתחילו ב-`href="#"` (קריטי למובייל)
ב-`pirsum-home.html` הכפתורים היו `#` עד שה-JS בסוף העמוד רץ.  
במחשב מהיר זה בלתי מורגש; בטלפון עם רשת איטית — **לחיצה ראשונה לא עושה כלום**.

**תיקון:** href אמיתי כבר ב-HTML + עדכון context ב-head.

### 2. כפל אירועי מגע (`touchend` + `click`)
במובייל, `touchend` ואחריו `click` על אותו אלמנט יכולים לירות **שתי ניווטים** → `ERR_ABORTED` / תחושת כפתור תקוע.

**תיקון:** debounce מגע בכרטיס פרסום ב-Orin; ב-pirsum-home רק `click` על `<a>` עם `touch-action: manipulation`.

### 3. מרכז השליטה חוסם את ה-Main Thread
`ai-control-center-v5-STANDALONE.html` טוען ~20 סקריפטים + `renderAll()` סינכרוני (50 עוזרים, 10 יועצים, מנועים).  
ב-Desktop: 2–3 שניות; בטלפון: **10–60+ שניות** שבהן המסך נראה חי אבל **לא מגיב למגע**.

**תיקון:** `renderKPIs` + `renderCategories` מיד; שאר `renderAllHeavy` ב-`requestIdleCallback` — כפתורי הבית זמינים מהר יותר.

### 4. אין משוב ויזואלי בזמן טעינה
משתמש לוחץ → מסך לבן / ללא תגובה → חושב שהכפתור שבור.

**תיקון:** overlay קל `טוען…` / `טוען פרסום…` בעת ניווט.

### 5. יעדי מגע קטנים / header צפוף במובייל
במסכים צרים, ה-header דחס את הכפתורים; אזורי לחיצה מתחת ל-44px.

**תיקון:** `min-height: 44–88px`, `safe-area`, הסתרת badge במובייל, `touch-action: manipulation`.

---

## מה **לא** מצאנו

| נבדק | תוצאה |
|------|--------|
| Overlay שקוף חוסם (pirsum-home) | לא נמצא |
| iframe של Orin בזרימה החדשה | לא נמצא |
| screen-pirsum / launcher ב-boot | לא נטען |
| Client context | נשמר (`dalia-c-official`) |

---

## קבצים שתוקנו (מובייל בלבד)

| קובץ | שינוי |
|------|--------|
| `public/coco-dalia/pirsum-home.html` | href מיידי, touch CSS, nav-busy, safe-area |
| `public/coco-dalia/work-center-lite.html` | חזרה לפרסום, touch tabs, defer iframe |
| `public/ai-marketing/ai-control-center-v5-STANDALONE.html` | defer render כבד, חזרה לפרסום |
| `public/ai-marketing/coco-marketing-lite-mode.js` | touch בטוח לכרטיס פרסום |
| `public/ai-marketing/coco-marketing-lite-ui.css` | nav-busy overlay |
| `public/ai-marketing/client-id-ssot.js` | משוב טעינה בפתיחת פרסום |
| `public/ai-marketing-platform.html` | cache bust `v3-pirsum-mobile-1` |
| `scripts/verify-pirsum-mobile.mjs` | בדיקת מובייל + 20 מעברים |

---

## בדיקה בטלפון אחרי פריסה

1. **Hard Refresh** (או ניקוי cache) — חובה בפעם הראשונה  
2. Orin → **פרסום** → אמור להופיע `טוען פרסום…`  
3. **מרכז העבודה** → אמור להופיע `טוען…` ואז לפתוח  
4. **חזרה** (← פרסום) → **מרכז השליטה**  
5. חזור על מעבר 5–10 פעמים  

אם עדיין נתקע — כתוב: **איזה כפתור**, **איזה מכשיר** (דגם + דפדפן), **האם רואים "טוען…"**.

---

## מדדים (mobile emulation, Staging לפני תיקון סופי)

| מדד | ערך |
|-----|-----|
| Orin boot | ~2.4s |
| pirsum-home | ~1.0s |
| מרכז עבודה | ~1.6s |
| מרכז שליטה | ~2.9s (עד אינטראקטיביות מלאה עד ~60s בטלפון איטי) |
| 20 מעברים max | ~71s |
