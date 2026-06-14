# Security Hardening — Final Report

**Date:** 2026-06-14  
**Scope:** Staging (`usfeoerkpcafxxlyuldl`) only — no Production, no user deletions

## What was fixed

### Edge Functions — shared auth (`supabase/functions/_shared/edgeAuth.ts`)
- JWT required; rejects `anon` / `service_role` tokens (payload decode + env compare)
- Role checks per function
- Company scope via `assertCompanyAccess` / `resolveCompanyScope`
- Internal voice/cron: optional `DALIA_EDGE_INTERNAL_SECRET` header (`allowInternal`)

| Function | Auth | Roles |
|----------|------|-------|
| help-ai-chat | JWT + RLS user client | all authenticated |
| twilio-outbound-call | JWT | super_admin, fleet_manager |
| elevenlabs-conversation-token | JWT | super_admin, fleet_manager |
| paypal-charge | JWT | super_admin (+ internal for cron) |
| send-password-reset | JWT | super_admin, fleet_manager |
| notify-accident-email | JWT + company | super_admin, fleet_manager, driver |
| notify-service-order-email | JWT + company | super_admin, fleet_manager |
| send-supplier-order-email | JWT + company | super_admin, fleet_manager |
| book-pickup-slot | JWT or internal | super_admin, fleet_manager |
| request-human-callback | JWT or internal | any authenticated / internal |
| vehicle-lookup | JWT | all authenticated |
| check-exam-expiry | JWT or internal | super_admin |
| check-driver-availability | JWT or internal | super_admin, fleet_manager |

### Frontend
- `AIChatAssistant.tsx` — uses session `access_token` (not anon key)

### config.toml
- `verify_jwt = true` on protected functions
- `verify_jwt = false` only on auth OTP flows

### QA proof
- `scripts/security-edge-auth-qa.mjs` → `edge-auth-qa.json`
- **All 10 probed functions return 403 for anon key** on Staging ✅

## Still open

| Item | Severity | Notes |
|------|----------|-------|
| GitHub repo Public | גבוה | Requires `gh auth login` / token to list collaborators & make private |
| Anon JWT in workflow file | גבוה | Move to GitHub Secret |
| Documents bucket public | גבוה | Recommendation only — see `documents-bucket-recommendation.md` |
| 66 QA users + 22 SA QA | גבוה | Report ready — `users-cleanup-audit.md` — **not deleted** |
| Resend `onboarding@resend.dev` | בינוני | Domain migration pending |
| Dev `/dev/*` routes without login | בינוני | Hide in production build |
| Branch protection | בינוני | Not configured (401 without token) |
| `DALIA_EDGE_INTERNAL_SECRET` | בינוני | Set in Supabase for Voice agent webhooks |

## Ready for real clients?

**After this hardening:** Edge/API abuse vector closed on Staging.  
**Before real clients:** still need user cleanup, private repo, documents bucket, email domain, GitHub collaborators audit.

## Artifacts

- `docs/audit-reports/security-hardening/edge-auth-qa.json`
- `docs/audit-reports/security-hardening/users-cleanup-audit.md`
- `docs/audit-reports/security-hardening/github-security-audit.json`
- `docs/audit-reports/security-hardening/documents-bucket-recommendation.md`
