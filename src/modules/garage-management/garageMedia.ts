/**
 * Isolated garage-case media contract.
 * Photos/documents belong to garage_case_id only — never claim_id.
 * No Claims Storage / claims-docs wiring. Real upload waits for a dedicated
 * Staging garage bucket + garage_media table after SQL is applied.
 */

export const GARAGE_MEDIA_CATEGORIES = [
  { id: 'angles', label: '4 זוויות' },
  { id: 'inspect', label: 'בדיקת רכב' },
  { id: 'damage', label: 'נקודות נזק' },
  { id: 'quote', label: 'הצעת מחיר' },
  { id: 'intake', label: 'קבלת רכב' },
  { id: 'before_work', label: 'לפני עבודה' },
  { id: 'during_work', label: 'במהלך עבודה' },
  { id: 'finish', label: 'סיום' },
  { id: 'before_delivery', label: 'לפני מסירה' },
  { id: 'documents', label: 'מסמכים' },
  { id: 'work_orders', label: 'הזמנות עבודה' },
  { id: 'other', label: 'אחר' },
] as const;

export type GarageMediaCategoryId = (typeof GARAGE_MEDIA_CATEGORIES)[number]['id'];

export type GarageMediaItem = {
  id: string;
  garage_case_id: string;
  category: GarageMediaCategoryId;
  title: string;
};

export function emptyGarageGallery(garageCaseId: string): Record<GarageMediaCategoryId, GarageMediaItem[]> {
  const out = {} as Record<GarageMediaCategoryId, GarageMediaItem[]>;
  for (const cat of GARAGE_MEDIA_CATEGORIES) out[cat.id] = [];
  void garageCaseId;
  return out;
}
