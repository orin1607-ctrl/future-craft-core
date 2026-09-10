/**
 * Digital signature for a specific vehicle inspection form.
 *
 * Stored as an inspection_items row (existing table) plus a PNG in the
 * existing `documents` storage bucket. No schema / bucket / RLS changes.
 */

export const DIGITAL_SIGNATURE_ITEM_NAME = '__digital_signature__';

export type InspectionItemLike = {
  item_name?: string | null;
  notes?: string | null;
  status?: string | null;
};

export function isDigitalSignatureItem(item: InspectionItemLike | null | undefined): boolean {
  return (item?.item_name || '') === DIGITAL_SIGNATURE_ITEM_NAME;
}

export function findInspectionSignatureUrl(
  items: Array<InspectionItemLike | null | undefined> | null | undefined,
): string | null {
  const match = (items || []).find(isDigitalSignatureItem);
  const url = (match?.notes || '').trim();
  return url || null;
}

export function checklistItemsWithoutSignature<T extends InspectionItemLike>(items: T[]): T[] {
  return items.filter((item) => !isDigitalSignatureItem(item));
}

export function dataUrlToPngBlob(dataUrl: string): Blob | null {
  const trimmed = (dataUrl || '').trim();
  if (!trimmed.startsWith('data:image/png;base64,')) return null;
  const base64 = trimmed.slice('data:image/png;base64,'.length);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  } catch {
    return null;
  }
}
