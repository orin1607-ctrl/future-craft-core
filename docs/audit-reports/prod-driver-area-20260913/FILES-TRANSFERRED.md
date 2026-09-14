# Production driver-area selective transfer

Live baseline: `172f525c5b1c1ff1aed3525dd3526828a9938c8a`
Restore tag: `restore/prod-before-driver-area-20260913`
Restore branch: `cursor/prod-restore-172f525c-b784`

Every file below is required directly by one of the six approved driver-area tasks.

## New files
| File | Why |
|---|---|
| `src/lib/driverAppActions.ts` | Catalog + ON/OFF + notification flags (tasks 1–4) |
| `src/lib/driverAppActions.test.ts` | Catalog tests |
| `src/lib/dispatchDriverEvent.ts` | Dispatch to notify-driver-event (task 4) |
| `src/lib/resolveEmergencyPhone.ts` | Company then Dalia emergency phone; no *8888/100 (task 5) |
| `src/lib/resolveEmergencyPhone.test.ts` | Phone resolver tests |
| `src/lib/stagingWhatsAppGuard.ts` | Allow live Production Gupshup only |
| `src/lib/stagingWhatsAppGuard.test.ts` | Guard tests |
| `src/hooks/useDriverActionVisibility.ts` | Driver ON/OFF visibility (task 2) |
| `src/components/DriverActionGate.tsx` | URL block when action OFF (task 2) |
| `src/pages/DriverAppNotificationsAdmin.tsx` | Super Admin «הגדרות אזור נהג» (tasks 1–4) |
| `src/pages/DriverOdometer.tsx` | Odometer report + history (task 6) |
| `supabase/functions/notify-driver-event/index.ts` | Email/WhatsApp/in-app per company settings (task 4) |
| `supabase/migrations/20260913220000_prod_driver_area_only.sql` | Isolated additive SQL |
| `.github/workflows/prod-driver-area-selective.yml` | Backup + migrate + one function + this SHA only |
| `public/project-001/prod-driver-area-deploy.json` | Arming gate |

## Surgical edits on live Production files
| File | Why |
|---|---|
| `src/App.tsx` | Routes `/driver-area-settings`, `/driver-app-notifications`, `/odometer` |
| `src/components/BottomNav.tsx` | Super Admin settings link in ניווט; odometer; visibility filter |
| `src/components/DriverDashboard.tsx` | Odometer button + visibility filter (dashboard chrome kept) |
| `src/components/Layout.tsx` | DriverActionGate only |
| `src/components/faults/WhatsAppButton.tsx` | Emergency phone from driver-area settings + dispatch; position unchanged |
| `src/lib/incidentCreate.ts` | dispatchDriverEvent beside existing incidentNotify |
| `src/lib/routeAccess.ts` | Super-admin-only settings routes |
| `src/pages/AdminHome.tsx` | Settings tile |
| `src/pages/DaliaSettings.tsx` | Settings section |
| `src/pages/Emergency.tsx` | Approved SLA flow; no service_orders insert; no *8888 |
| `src/pages/Expenses.tsx` | dispatchDriverEvent |
| `src/pages/ServiceOrders.tsx` | dispatchDriverEvent beside existing email |
| `src/integrations/supabase/types.ts` | New driver-area tables/columns/RPCs only |
| `supabase/config.toml` | `[functions.notify-driver-event]` only |

## Explicitly not transferred
HomeDashboard, Dashboard.tsx, Vehicles.tsx, garage, claims, customers, reports, telematics, send-whatsapp-message, notify-accident-email, notify_managers_on_fault, log_vehicle_changes.

## Live status (2026-09-14)
- **Frontend live:** `https://dalia-car.online/PRODUCTION-DEPLOY.txt` → `commit=fda4d2821aab4c771aada9e17f6ad7839ccc07c8 bundle=index-C_3rMZ1C.js reason=driver-area-only-2026-09-13 before=172f525c…`
- **SQL applied:** `20260913220000_prod_driver_area_only.sql` (additive driver-area only)
- **Edge Function `notify-driver-event`:** not live yet (Management API token on VPS empty; retrying GitHub secret from the Actions runner). Existing `send-whatsapp-message` / `notify-accident-email` / `notify-service-order-email` were **not** redeployed.
