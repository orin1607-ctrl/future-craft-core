# Stage-1 אופטימיזציה — הסרת Sleep + אבחון Gupshup 58

**סטטוס:** ממתין לתוצאות CI (`wa-bot-stage1-opt`)  
**תרחיש:** Whatsapp Bot `5797671` · Staging בלבד  
**לא בוצע:** שינויי AI Agent · Cache במקום Sheets · Production

---

מסמך זה מתעדכן אוטומטית אחרי הרצת `scripts/wa-bot-stage1-opt.mjs`.  
תוצאות גולמיות: `public/project-001/wa-bot-stage1-opt-result.json` · סיכום: `wa-bot-stage1-opt-summary.json`.

## כוונת שלב 1

1. לבדוק ולהסיר Sleep **88** ו-**77** אם בטוח (טרמינלי אחרי Gupshup, בלי הפניות).
2. לאבחן מודול Gupshup **58** (HTTP 400) — האם בשימוש; **בלי** תיקון mapper בשלב זה.
3. E2E: שתי הודעות «היי» → «יוני» דרך Make Hook.
4. השוואת ביצועים לפני/אחרי + אישור שלוגיקת AI/Sheets לא השתנתה.
