import { describe, expect, it } from 'vitest';
import {
  DIGITAL_SIGNATURE_ITEM_NAME,
  checklistItemsWithoutSignature,
  dataUrlToPngBlob,
  findInspectionSignatureUrl,
  isDigitalSignatureItem,
} from './inspectionSignature';

describe('inspection signature helpers', () => {
  it('identifies the reserved signature item without treating checklist rows as signatures', () => {
    expect(isDigitalSignatureItem({ item_name: DIGITAL_SIGNATURE_ITEM_NAME, notes: 'https://x' })).toBe(true);
    expect(isDigitalSignatureItem({ item_name: 'צמיגים', notes: 'https://x' })).toBe(false);
    expect(isDigitalSignatureItem({ item_name: 'חתימה דיגיטלית' })).toBe(false);
    expect(isDigitalSignatureItem(null)).toBe(false);
  });

  it('finds the signature URL for a specific inspection and ignores other notes', () => {
    const items = [
      { item_name: 'צמיגים', notes: 'לחץ נמוך', status: 'defect' },
      { item_name: DIGITAL_SIGNATURE_ITEM_NAME, notes: 'https://cdn.example/sig.png', status: 'ok' },
    ];
    expect(findInspectionSignatureUrl(items)).toBe('https://cdn.example/sig.png');
    expect(findInspectionSignatureUrl(items.filter((i) => i.item_name !== DIGITAL_SIGNATURE_ITEM_NAME))).toBe(null);
  });

  it('keeps historical checklist rows when splitting out the signature item', () => {
    const items = [
      { item_name: 'בלמים', status: 'ok', notes: '' },
      { item_name: DIGITAL_SIGNATURE_ITEM_NAME, status: 'ok', notes: 'https://cdn.example/sig.png' },
    ];
    const visible = checklistItemsWithoutSignature(items);
    expect(visible).toHaveLength(1);
    expect(visible[0].item_name).toBe('בלמים');
  });

  it('converts a png data URL to a blob and rejects empty/invalid payloads', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAhvmqHQAAAABJRU5ErkJggg==';
    const blob = dataUrlToPngBlob(png);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/png');
    expect(dataUrlToPngBlob('')).toBeNull();
    expect(dataUrlToPngBlob('not-a-data-url')).toBeNull();
  });
});
