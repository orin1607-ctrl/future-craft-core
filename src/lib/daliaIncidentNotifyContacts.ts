/** Central Dalia ops contacts for incident alerts — single source of truth. Do not scatter. */
export const DALIA_INCIDENT_CONTACTS = {
  companyLabel: 'דליה פתרונות תפעול ותחזוקה לרכב',
  email: 'orin1607@gmail.com',
  whatsappPhone: '0534338601',
  whatsappE164: '972534338601',
} as const;

export type IncidentRecipientMode = 'fleet_managers' | 'dalia' | 'both';

export type IncidentNotifyChannels = {
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
};
