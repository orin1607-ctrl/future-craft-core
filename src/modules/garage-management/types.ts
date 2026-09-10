export type CustomerKind = 'private' | 'business' | 'company';

export type CaseStatus =
  | 'open'
  | 'inspecting'
  | 'quote_draft'
  | 'quote_ready'
  | 'awaiting_approval'
  | 'approved'
  | 'intake'
  | 'in_work'
  | 'done'
  | 'closed';

export type PartState = 'ok' | 'damaged' | 'fix';

export type PhotoTopic =
  | 'four_angles'
  | 'inspection'
  | 'damage'
  | 'quote'
  | 'intake'
  | 'before_work'
  | 'during_work'
  | 'after_work'
  | 'before_delivery'
  | 'quotes'
  | 'orders'
  | 'docs'
  | 'invoices'
  | 'other';

export type PartSupplier = 'us' | 'customer';

export interface GarageCustomer {
  id: string;
  kind: CustomerKind;
  name: string;
  phone: string;
  email?: string;
  companyName?: string;
  notes?: string;
}

export interface GarageVehicle {
  id: string;
  plate: string;
  manufacturer: string;
  model: string;
  year?: string;
  type?: string;
  customerId?: string;
}

export interface DamagePart {
  id: string;
  name: string;
  state: PartState;
  description: string;
  photoIds: string[];
}

export interface QuoteWorkLine {
  id: string;
  part: string;
  workType: string;
  detail: string;
  price: number;
}

export interface QuotePartLine {
  id: string;
  name: string;
  sku: string;
  qty: number;
  price: number;
  supplier: PartSupplier;
  supplierLabel?: string;
}

export interface GaragePhoto {
  id: string;
  topic: PhotoTopic;
  label: string;
  dataUrl: string;
  createdAt: string;
  selected?: boolean;
}

export interface WorkOrderVersion {
  version: number;
  number: string;
  date: string;
  company: string;
  plate: string;
  approvedAmount: number;
  contact: string;
  notes: string;
  imageDataUrl?: string;
  createdAt: string;
}

export interface MailMessage {
  id: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  at: string;
  direction: 'in' | 'out';
}

export interface HistoryEvent {
  id: string;
  at: string;
  text: string;
}

export interface SecureShare {
  id: string;
  token: string;
  recipientName: string;
  recipientCompany?: string;
  email?: string;
  phone?: string;
  ttlLabel: string;
  expiresAt: string;
  items: string[];
  revoked: boolean;
  createdAt: string;
}

export interface VehicleIntake {
  odometer: string;
  fuel: string;
  keys: string;
  warningLights: string;
  itemsInCar: string;
  interior: string;
  notes: string;
  date: string;
  time: string;
  worker: string;
  signatureDataUrl?: string;
  approved: boolean;
}

export interface GarageCase {
  id: string;
  number: string;
  status: CaseStatus;
  customer: GarageCustomer;
  vehicle: GarageVehicle;
  worker: string;
  openedAt: string;
  eventNumber?: string;
  damageArea?: string;
  damageDescription?: string;
  notes?: string;
  angles: Record<string, string | undefined>;
  extraPhotos: Record<string, string | undefined>;
  parts: DamagePart[];
  works: QuoteWorkLine[];
  partsLines: QuotePartLine[];
  quotePhotoIds: string[];
  photos: GaragePhoto[];
  orders: WorkOrderVersion[];
  mails: MailMessage[];
  history: HistoryEvent[];
  shares: SecureShare[];
  intake?: VehicleIntake;
  closeNotes?: string;
}

export interface OpenDraft {
  customerMode: 'existing' | 'new' | 'company';
  customerKind: CustomerKind;
  customer: Partial<GarageCustomer>;
  vehicleMode: 'existing' | 'new';
  vehicle: Partial<GarageVehicle>;
  damageArea?: string;
  damageDescription?: string;
  notes?: string;
}

export interface GarageState {
  customers: GarageCustomer[];
  vehicles: GarageVehicle[];
  cases: GarageCase[];
  draft: OpenDraft;
}

export const ANGLE_KEYS = [
  { id: 'fl', label: 'קדמי שמאל' },
  { id: 'fr', label: 'קדמי ימין' },
  { id: 'rl', label: 'אחורי שמאל' },
  { id: 'rr', label: 'אחורי ימין' },
] as const;

export const EXTRA_ANGLE_KEYS = [
  { id: 'interior', label: 'פנים הרכב' },
  { id: 'dash', label: 'לוח שעונים' },
] as const;

export const CAR_PARTS: { id: string; name: string; x: number; y: number; w: number; h: number }[] = [
  { id: 'front_bumper', name: 'פגוש קדמי', x: 70, y: 8, w: 80, h: 26 },
  { id: 'hood', name: 'מכסה מנוע', x: 55, y: 40, w: 110, h: 46 },
  { id: 'fender_fl', name: 'כנף קדמית שמאל', x: 20, y: 48, w: 32, h: 70 },
  { id: 'fender_fr', name: 'כנף קדמית ימין', x: 168, y: 48, w: 32, h: 70 },
  { id: 'door_fl', name: 'דלת קדמית שמאל', x: 18, y: 122, w: 30, h: 80 },
  { id: 'door_fr', name: 'דלת קדמית ימין', x: 172, y: 122, w: 30, h: 80 },
  { id: 'door_rl', name: 'דלת אחורית שמאל', x: 18, y: 206, w: 30, h: 80 },
  { id: 'door_rr', name: 'דלת אחורית ימין', x: 172, y: 206, w: 30, h: 80 },
  { id: 'fender_rl', name: 'כנף אחורית שמאל', x: 20, y: 290, w: 32, h: 66 },
  { id: 'fender_rr', name: 'כנף אחורית ימין', x: 168, y: 290, w: 32, h: 66 },
  { id: 'trunk', name: 'תא מטען', x: 55, y: 330, w: 110, h: 46 },
  { id: 'rear_bumper', name: 'פגוש אחורי', x: 70, y: 384, w: 80, h: 24 },
];

export const PHOTO_TOPICS: { id: PhotoTopic; label: string }[] = [
  { id: 'four_angles', label: 'ארבע זוויות' },
  { id: 'inspection', label: 'בדיקת רכב' },
  { id: 'damage', label: 'מוקדי נזק' },
  { id: 'quote', label: 'תמונות להצעה' },
  { id: 'intake', label: 'קבלת רכב' },
  { id: 'before_work', label: 'לפני עבודה' },
  { id: 'during_work', label: 'במהלך עבודה' },
  { id: 'after_work', label: 'גמר עבודה' },
  { id: 'before_delivery', label: 'לפני מסירה' },
  { id: 'quotes', label: 'הצעות מחיר' },
  { id: 'orders', label: 'הזמנות' },
  { id: 'docs', label: 'מסמכים' },
  { id: 'invoices', label: 'חשבוניות' },
  { id: 'other', label: 'אחר' },
];

export const VAT_RATE = 0.18;
