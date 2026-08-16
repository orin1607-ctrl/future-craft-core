# 12 — מפתח ראיות (Evidence Index)
**ללא ערכי סודות.**

| מזהה | תיאור | סוג | מיקום/פקודה | תומך בממצא |
|------|--------|-----|-------------|-------------|
| E1 | Bundle Supabase ref | Prod | `curl` JS → `qasomfndnjuixgjmjwcm` | ארכיטקטורה |
| E2 | Bundle GUPSHUP strings | Prod | rg על JS החי | F-WA-01 |
| E3 | gupshup-webhook GET 200 | Prod | `.../functions/v1/gupshup-webhook` | F-WA-01 |
| E4 | send-whatsapp-message קיים | Prod | 401 missing sub / no auth header | F-WA-01 |
| E5 | E2E WA send | CI | Actions run `29946137467` | F-WA-01, deliveries |
| E6 | provider_message_ids | CI log | `6556b4c6-...`, `e97319c6-...` | F-WA-01 |
| E7 | DNS/SSL/IP | Prod | dig/openssl | תשתית |
| E8 | Security headers חסרים | Prod | `curl -sI https://dalia-car.online` | F-HDR-01 |
| E9 | paypal unknown action 400 עם anon | Prod | POST paypal-charge | F-PAY-01 |
| E10 | mail relay probe | Prod | POST send-vehicle-file-report `{}` → 400 | F-MAIL-01 |
| E11 | Twilio creds missing | Prod | GET twilio-outbound-call → 500 | F-TWILIO-01 |
| E12 | SSH denied | Session | ssh root@72.60.36.182 | F-ACCESS-01 |
| E13 | No supabase CLI | Session | `which supabase` | F-ACCESS-01 |
| E14 | gh secrets 403 | Session | `gh secret list` / API | F-ACCESS-01 |
| E15 | branch production stale | Git | log 2026-06-06 vs main 2026-07-22 | F-META-01 |
| E16 | send-whatsapp source | Code main | `supabase/functions/send-whatsapp-message/index.ts` | F-WA-01 |
| E17 | gupshup-webhook source | Code main | `supabase/functions/gupshup-webhook/index.ts` | F-WA-01 |
| E18 | deliveries migration | Code | `20260719080000_incident_notification_deliveries.sql` | F-WA-01 |
| E19 | GUPSHUP rotation success doc | Repo | `GUPSHUP-ROTATION-SUCCESS-HE.md` | Secrets names/status |
| E20 | MCP catalog | Session | GetMcpTools → רק cursor-cloud | גישות |
| E21 | Storage anon bucket | Prod | bucket not found / list `[]` | F-STOR-01 |
| E22 | notify-accident uses Gupshup | Code main | `notify-accident-email/index.ts` | F-WA-01 |

### ראיות אסורות לשיתוף חיצוני
לוגי CI מלאים שעשויים להכיל אימיילים/טלפונים; כל Secret values; dumps DB מלאים.
