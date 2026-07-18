# שער Owner — בדיקת WhatsApp Demo (Staging)

**סטטוס:** ממתין למפתח Staging  
**פרויקט מותר:** `usfeoerkpcafxxlyuldl` בלבד  
**Production / Hostinger / merge ל-main:** אסור

## מה אושר ע״י Owner
- בדיקת WhatsApp אמיתית **אחת** מ-Staging
- יעד: `0534338601`
- Demo: יוני אטיאס · תקלה · פנצ׳ר
- רק אחרי אימות שמירה / מספר אירוע / מעקב / כרטיסים / דשבורדים

## מה חסר בסביבת הסוכן
אין `SUPABASE_ACCESS_TOKEN` ואין `SUPABASE_SERVICE_ROLE_KEY` של Staging.

בלי אחד מהם אי אפשר:
1. ליצור תקלת Demo במסד Staging (RLS חוסם anon)
2. להנפיק JWT של `super_admin` ל-Edge `send-whatsapp-message`
3. לבצע את השליחה האמיתית האחת

## מה מוכן להרצה מיידית
סקריפט:

```bash
# אפשרות A — Access Token של Supabase (מומלץ)
export SUPABASE_ACCESS_TOKEN='sbp_...'
node scripts/staging-demo-fault-whatsapp-once.mjs

# אפשרות B — service_role של Staging בלבד
export SUPABASE_SERVICE_ROLE_KEY='eyJ...'   # ref חייב להיות usfeoerkpcafxxlyuldl
node scripts/staging-demo-fault-whatsapp-once.mjs
```

הסקריפט:
- יוצר תקלת Demo
- מריץ את כל בדיקות ה-pre-send
- שולח WhatsApp **אחד** בלבד ל-`0534338601` עם טקסט הלקוח (`buildWhatsAppPreview`)
- כותב דוח ל-`docs/audit-reports/claims-incident-process/WHATSAPP-DEMO-SEND-REPORT-HE.md`

## אימות סביבה שנעשה כבר
- Staging RPC `allocate_incident_event_number(p_company, p_prefix)` קיים (המיגרציה על Staging)
- anon לא יכול לקרוא/לכתוב faults/drivers/vehicles (RLS)
- Edge `send-whatsapp-message` דוחה anon (`missing sub claim`)
- `.env` המקומי מצביע ל-`kuenhflklivaxrmqbsee` — **לא** בשימוש לבדיקה זו
