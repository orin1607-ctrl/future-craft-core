import { describe, expect, it } from 'vitest';
import { sharedItemToFile, type SharedDocItem } from './claimShareInbox';

describe('claimShareInbox unit tests', () => {
  it('converts SharedDocItem into a standard File object', () => {
    const dummyBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
    const item: SharedDocItem = {
      id: 'share_12345',
      name: 'CarPart-Tender-8451.pdf',
      type: 'application/pdf',
      size: dummyBlob.size,
      blob: dummyBlob,
      receivedAt: new Date().toISOString(),
      title: 'הצעת מחיר Car-Part',
    };

    const file = sharedItemToFile(item);
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('CarPart-Tender-8451.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(dummyBlob.size);
  });

  it('provides sensible fallback filename and mime type', () => {
    const dummyBlob = new Blob(['bytes'], { type: '' });
    const item: SharedDocItem = {
      id: 'share_999',
      name: '',
      type: '',
      size: dummyBlob.size,
      blob: dummyBlob,
      receivedAt: new Date().toISOString(),
    };

    const file = sharedItemToFile(item);
    expect(file.name).toBe('carpart_tender.pdf');
    expect(file.type).toBe('application/pdf');
  });
});
