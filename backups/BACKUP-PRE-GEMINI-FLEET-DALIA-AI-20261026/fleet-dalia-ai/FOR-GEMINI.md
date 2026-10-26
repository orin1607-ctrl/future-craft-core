# לג'ימיני — מודול שיחת צי הרכב

קרוס לא מוחק את הקבצים האלה ולא נוגע עכשיו ב-`help-ai-chat` או ב-`FleetDaliaAiPage.tsx`.
האתר החי נשאר `ff6fd8a`. אין לפרסם את השינויים המקומיים עד סיום החיבור ואישור הבעלים.
אין לגעת ב-Production (`qasomfndnjuixgjmjwcm`, `dalia-car.online`).

## קבצים לשמור ולשלב

שני הקבצים לא ב-commit. הם רק בתיקיית העבודה:

- `src/features/fleet-dalia-ai/fleetConversation.ts`
- `src/features/fleet-dalia-ai/fleetConversation.test.ts`

עותק שמור גם ב-`C:\Users\אליאב\.cursor\handoff-gemini-fleet-conversation\`.

המסך עדיין לא מייבא את המודול. `askGeneral` שכבר נערך כאן שולח שיחה חופשית ל-`help-ai-chat` עם `module: "fleet"`.

## מה המודול עושה

`planFleetTurn(text, history)`:

- פעולה פעילה של קריאה או ניווט → `{ kind: "read", actionId, query }`
- פעולה כבויה או `mode: "write"` → `{ kind: "blocked-write" }`
- טקסט של תביעות או מוסך בלי פעולת צי → `{ kind: "outside-fleet" }`
- המשך קצר (`ומה` / `עוד` / `אותו` / `שלו`) → אותה פעולת קריאה קודמת
- אחרת → `{ kind: "clarify" }`

`answerFleetTurn(text, history, { role, company })` קורא ל-`executeFleetAction` רק עבור `read`.
אין בתוך המודול קריאה ל-`help-ai-chat` ואין קריאה ל-`/api/ai/chat`.

## חיבור סופי — חברה, הרשאה, קריאה בלבד

1. שאלת נתון שמזוהה כפעולת צי נענית דרך `answerFleetTurn`, לא דרך כלי התביעות.
2. `executeFleetAction` מקבל את התפקיד מהסשן ואת החברה מ-`useCompanyFilter`.
3. מותר רק `super_admin` או `fleet_manager`, ורק אחרי שנבחרה חברה אחת. `guardCompany` דוחה "כל החברות".
4. הקריאה עוברת ב-`liveReads.ts`: סשן המשתמש, `applyCompanyScope`, ו-`assertStagingReadTarget` לפרויקט `usfeoerkpcafxxlyuldl`.
5. כל פעולה עם `mode: "write"` נשארת `enabled: false`. אין להפעיל אותה מהמודל.
6. שבעת התחומים נשארים: רכבים, נהגים, מעקב רכבים, מעקב נהגים, דוחות, משימות והתראות, שיחה כללית.

## בתוך help-ai-chat, כש-`module` הוא `fleet`

הדף כבר שולח `module: "fleet"` ו-`company_name`. בפונקציה, מודול שאינו `garage` / `reports` / `claims` נופל ל-`FLEET_GEMINI_TOOLS`, ו-`executeFleetTool` כבר מקבל את `companyScope` מ-`resolveCompanyScope`.

עדיין חסר, וזה חלק מהחיבור הסופי:

- כש-`module === "fleet"`, לא להפעיל `hasClaimsIntent` ולא את מסלולי התביעות המהירים (חבילת פתיחה, קישור לקוח, חבילת ביטוח). משפט על תביעה מתוך מסך הצי לא פותח כלי תביעות.
- לא להוסיף למודול הצי כלי כתיבה של תביעות או מוסך.
- כלי הצי בפונקציה הם שבעה סיכומים בלבד. נתון מפורט (רכב מסוים, רישיון, משימה) נשאר ב-`answerFleetTurn` / `liveReads`.
- שיחה חופשית שלא תואמת פעולה יכולה להמשיך אל המודל, אחרי הסינון הזה.

## בדיקה שכבר עברה

מתוך תיקיית העבודה:

`npx vitest run src/features/fleet-dalia-ai/fleetConversation.test.ts`

3 בדיקות עברו: אין קריאה לשירות החי מתוך המודול, כתיבה ותביעה נחסמות, נהג לא מקבל נתונים.

אחרי הסיום קרוס בודק בדשבורד החי את הכפתור **AI דליה**, את שבעת התחומים ואת השיחה החופשית יחד.
