#!/usr/bin/env node
/**
 * GitHub Pages serves only real files with HTTP 200.
 * Deep SPA routes otherwise hit 404.html (status 404) → Console/Network 404 noise.
 * Copy index.html into each known app route folder so refresh/deep-links return 200.
 */
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = process.argv[2] || 'dist';
const indexPath = join(dist, 'index.html');

if (!existsSync(indexPath)) {
  console.error(`[spa-shells] missing ${indexPath}`);
  process.exit(1);
}

/** Routes that users open via refresh, bookmarks, or shared links */
const ROUTES = [
  'login',
  'about',
  'forgot-password',
  'reset-password',
  'dashboard',
  'admin-home',
  'admin/modules',
  'admin/modules/vehicles',
  'admin/modules/vehicles/required-fields',
  'admin/modules/vehicles/vehicle-types',
  'admin/modules/drivers',
  'admin/modules/drivers/required-fields',
  'admin/modules/customers',
  'admin/modules/customers/required-fields',
  'admin/modules/accidents',
  'admin/modules/accidents/required-fields',
  'admin/modules/documents',
  'admin/modules/documents/required-fields',
  'admin/modules/treatments',
  'admin/modules/treatments/required-fields',
  'admin/modules/insurance',
  'admin/modules/insurance/required-fields',
  'admin/modules/tasks',
  'admin/modules/tasks/required-fields',
  'required-fields',
  'vehicles',
  'drivers',
  'customers',
  'routes',
  'faults',
  'accidents',
  'documents',
  'reports',
  'alerts',
  'expiry-approvals',
  'settings',
  'dalia-settings',
  'fleet-managers',
  'user-management',
  'alert-settings',
  'vehicle-tasks',
  'vehicle-inspections',
  'driver-declarations',
  'sign-declaration',
  'take-exam',
  'upload-request',
  'fleetos-ai',
  'transport',
  'vehicle-tracking',
  'history',
  'service-orders',
  'expenses',
  'work-orders',
  'emergency',
  'companions',
  'towing',
  'permissions',
  'approval-settings',
  'suppliers',
  'supplier-orders',
  'email-templates',
  'promotions',
  'internal-chat',
  'subscriptions',
  'customer-docs',
  'emergency-settings',
  'system-logs',
  'service-order-history',
  'project-summary',
  'completed-tasks',
  'health-declaration',
  'vehicle-import',
  'private-vehicle-inspection',
  'vehicle-lookup',
  'vehicle-exchange',
  'voice',
  'pickup-appointments',
  'attach-car',
  'attach-customer',
  'handover',
  'roadmap',
  'driver-notifications',
  'driver-schedule',
  'dev/vehicle-card',
  'dev/vehicle-new-dalia',
  'dev/vehicle-flows',
  'dev/fleetos-module1',
  'dev/project-001/dashboard',
  'telemarketing',
  'telemarketing/admin',
];

let n = 0;
for (const route of ROUTES) {
  const targetDir = join(dist, route);
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(indexPath, join(targetDir, 'index.html'));
  n++;
}

// Keep classic fallback for unknown routes
copyFileSync(indexPath, join(dist, '404.html'));

const html = readFileSync(indexPath, 'utf8');
if (!html.includes('id="root"')) {
  console.error('[spa-shells] index.html missing #root');
  process.exit(1);
}

console.log(`[spa-shells] wrote ${n} route shells + 404.html under ${dist}`);
