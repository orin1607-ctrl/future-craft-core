# E2E התראות דרך ממשק התוכנה (Staging)

**סטטוס:** רץ ב-CI · Playwright כמנהל על יוני אטיאס  
**לא:** קריאה ישירה ל-Edge מהסקריפט · לא Production  

מסלול משתמש:
1. Session כ־`orin1607@gmail.com` / יוני אטיאס  
2. `/alert-settings` — הפעלת Email + WhatsApp + In-app  
3. `/faults` → דיווח תקלה חדשה → **שלח דיווח**  
4. המערכת קוראת ל-`notify-accident-email` (מהדפדפן)  

תוצאות: `public/project-001/wa-ui-alert-e2e-summary.json`
