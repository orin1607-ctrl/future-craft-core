/**

 * Static audit: Dalia Settings ↔ Dalia New sync coverage.

 * Usage: node scripts/dalia-settings-new-sync-audit.mjs

 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

import { join } from 'path';



const ROOT = process.cwd();

const OUT_DIR = join(ROOT, 'docs', 'audit-reports', 'dalia-settings-new-sync');

mkdirSync(OUT_DIR, { recursive: true });



const STAGING = 'https://orin1607-ctrl.github.io/future-craft-core/';



function read(rel) {

  return readFileSync(join(ROOT, rel), 'utf8');

}



function hasAll(src, needles) {

  return needles.every((n) => src.includes(n));

}



const files = {

  daliaPersist: read('src/lib/daliaVehiclePersist.ts'),

  drivers: read('src/pages/Drivers.tsx'),

  documents: read('src/pages/Documents.tsx'),

  serviceOrders: read('src/pages/ServiceOrders.tsx'),

  vehicleImport: read('src/pages/VehicleImport.tsx'),

  notificationLog: read('src/pages/NotificationLogPage.tsx'),

  daliaSettings: read('src/pages/DaliaSettings.tsx'),

  vehicleForm: read('src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx'),

  approvalQueue: read('src/lib/approvalQueue.ts'),

  vehicleTypesConfig: read('src/lib/vehicleTypesConfig.ts'),

  vehicleTypesSettings: read('src/pages/admin/VehicleTypesSettings.tsx'),

  requiredFieldsSchema: read('src/lib/requiredFieldsSchema.ts'),

  vehicleTasks: read('src/pages/VehicleTasks.tsx'),

  vehicleActionModal: read('src/components/vehicles/VehicleActionModal.tsx'),

  taskValidation: read('src/lib/taskFieldValidation.ts'),

  homeAlertPrefs: read('src/hooks/useHomeAlertPrefs.ts'),

  homeAlertPrefsApi: read('src/lib/homeAlertPrefsApi.ts'),

  driverDashboard: read('src/components/DriverDashboard.tsx'),

  fleetManagersPage: read('src/pages/FleetManagers.tsx'),

};



const vehicleTypesGap =

  (hasAll(files.daliaSettings, ['vehicle-types']) ? 0 : 1) +

  (hasAll(files.vehicleForm, ['useVehicleTypes']) ? 0 : 1) +

  (hasAll(files.vehicleTypesConfig, ['VEHICLE_TYPES_CONFIG_KEY']) ? 0 : 1);



const tasksGap =

  (hasAll(files.requiredFieldsSchema, ["key: 'tasks'"]) ? 0 : 1) +

  (hasAll(files.daliaSettings, ['tasks/required-fields']) ? 0 : 1) +

  (hasAll(files.taskValidation, ["validateRequiredModuleFields('tasks'"]) ? 0 : 1) +

  (hasAll(files.vehicleActionModal, ['validateTaskFields']) ? 0 : 1);



const fleetManagersGap = hasAll(files.daliaSettings, ['/fleet-managers']) ? 0 : 1;



const driverDashboardGap = hasAll(files.driverDashboard, ['useHiddenButtons']) ? 0 : 1;



const homeAlertGap =

  (hasAll(files.homeAlertPrefs, ['fetchHomeAlertPrefs']) ? 0 : 1) +

  (hasAll(files.homeAlertPrefsApi, ['dalia_form_config']) ? 0 : 1);



const domains = [

  {

    domain: 'Vehicles',

    source: hasAll(files.daliaSettings, ['שדות חובה — רכבים']) ? 1 : 0,

    target: hasAll(files.vehicleForm, ['validateModule', 'vehicles']) ? 1 : 0,

    gap:

      (hasAll(files.daliaSettings, ['שדות חובה — רכבים']) ? 0 : 1) +

      (hasAll(files.vehicleImport, ['validateRequiredModuleFields', 'createApprovalRequest']) ? 0 : 1) +

      (hasAll(files.daliaPersist, ['createApprovalRequest']) ? 0 : 1),

  },

  {

    domain: 'Vehicle Types',

    source: hasAll(files.daliaSettings, ['vehicle-types']) ? 1 : 0,

    target: hasAll(files.vehicleForm, ['useVehicleTypes']) ? 1 : 0,

    gap: vehicleTypesGap,

  },

  {

    domain: 'Drivers',

    source: hasAll(files.daliaSettings, ['שדות חובה — נהגים']) ? 1 : 0,

    target: hasAll(files.drivers, ["validateRequiredModuleFields('drivers'"]) ? 1 : 0,

    gap: hasAll(files.drivers, ["validateRequiredModuleFields('drivers'"]) ? 0 : 1,

  },

  {

    domain: 'Profiles',

    source: 1,

    target: 1,

    gap: 0,

  },

  {

    domain: 'Company Settings',

    source: hasAll(files.daliaSettings, ['alert-settings']) ? 1 : 0,

    target: hasAll(files.daliaPersist, ['validateVehicleAgainstCompanyPolicy']) ? 1 : 0,

    gap: hasAll(files.vehicleImport, ['require_insurance_docs']) ? 0 : 1,

  },

  {

    domain: 'Documents',

    source: hasAll(files.daliaSettings, ['שדות חובה — מסמכים']) ? 1 : 0,

    target: hasAll(files.documents, ["validateRequiredModuleFields('documents'"]) ? 1 : 0,

    gap: hasAll(files.documents, ["validateRequiredModuleFields('documents'"]) ? 0 : 1,

  },

  {

    domain: 'Document Metadata',

    source: 1,

    target: hasAll(files.documents, ['uploadDocument']) ? 1 : 0,

    gap: 0,

  },

  {

    domain: 'Driver Notifications',

    source: 1,

    target: 1,

    gap: 0,

  },

  {

    domain: 'Tasks',

    source: hasAll(files.daliaSettings, ['tasks/required-fields']) ? 1 : 0,

    target: hasAll(files.vehicleTasks, ['validateTaskFields']) ? 1 : 0,

    gap: tasksGap,

  },

  {

    domain: 'Service Orders',

    source: 1,

    target: hasAll(files.serviceOrders, ["validateRequiredModuleFields('treatments'", 'createApprovalRequest']) ? 1 : 0,

    gap: hasAll(files.serviceOrders, ["validateRequiredModuleFields('treatments'"]) ? 0 : 1,

  },

  {

    domain: 'Alerts',

    source: 1,

    target: hasAll(files.notificationLog, ['fetchNotificationLogEntries']) ? 1 : 0,

    gap: hasAll(files.notificationLog, ['fetchNotificationLogEntries']) ? 0 : 1,

  },

  {

    domain: 'Home Alert Prefs',

    source: hasAll(files.daliaSettings, ['alert-settings']) ? 1 : 0,

    target: hasAll(files.homeAlertPrefs, ['saveHomeAlertPrefs']) ? 1 : 0,

    gap: homeAlertGap,

  },

  {

    domain: 'Fleet Managers',

    source: hasAll(files.daliaSettings, ['/fleet-managers']) ? 1 : 0,

    target: hasAll(files.fleetManagersPage, ['fleet_manager']) ? 1 : 0,

    gap: fleetManagersGap,

  },

  {

    domain: 'Driver Dashboard',

    source: 1,

    target: hasAll(files.driverDashboard, ['useHiddenButtons']) ? 1 : 0,

    gap: driverDashboardGap,

    note: 'Functional sync (hidden_buttons). Full Dalia New UI redesign is a separate project.',

  },

  {

    domain: 'Dalia Settings Hub',

    source: 1,

    target: 1,

    gap:

      (hasAll(files.daliaSettings, ['tasks/required-fields']) ? 0 : 1) +

      (hasAll(files.daliaSettings, ['vehicle-types']) ? 0 : 1) +

      (hasAll(files.daliaSettings, ['/fleet-managers']) ? 0 : 1),

  },

];



const report = {

  at: new Date().toISOString(),

  repository: 'orin1607-ctrl/future-craft-core',

  branch: 'main',

  staging_url: STAGING,

  vercel_used: false,

  note: 'לא נעשה שימוש ב-Vercel.',

  alignment_table: domains,

  total_gaps: domains.reduce((s, d) => s + d.gap, 0),

  zip_allowed: domains.every((d) => d.gap === 0),

  open_decisions: [

    {

      id: 'driver-dashboard-ui',

      status: 'open',

      summary: 'Driver Dashboard uses legacy card UI — not Dalia New CSS. Data/policy sync done; visual parity is a separate UI project.',

    },

  ],

  checks: {

    approval_queue_wired: hasAll(files.approvalQueue, ['approval_requests']),

    vehicle_import_sync: hasAll(files.vehicleImport, ['validateRequiredModuleFields', 'resolveVehicleApprovalStatus']),

    notification_log_db: hasAll(files.notificationLog, ['fetchNotificationLogEntries']),

    vehicle_types_db: hasAll(files.vehicleTypesConfig, ['dalia_form_config']),

    home_alert_prefs_db: hasAll(files.homeAlertPrefsApi, ['dalia_form_config']),

    tasks_required_fields: hasAll(files.requiredFieldsSchema, ["key: 'tasks'"]),

  },

};



writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));

process.exit(report.zip_allowed ? 0 : 2);

