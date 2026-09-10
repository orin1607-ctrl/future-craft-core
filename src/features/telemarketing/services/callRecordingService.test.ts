import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: { message: 'upload-failed' } }),
        createSignedUrl: async () => ({ data: null, error: { message: 'denied' } }),
      }),
    },
  },
}));

import {
  createRecordingSignedUrl,
  recordingStoragePath,
  startCallRecording,
  stopCallRecording,
  uploadCallRecording,
} from '@/features/telemarketing/services/callRecordingService';

describe('telemarketing call recording helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a private path scoped to employee and call id', () => {
    const employeeId = '11111111-1111-4111-8111-111111111111';
    const callId = '22222222-2222-4222-8222-222222222222';
    expect(recordingStoragePath(employeeId, callId, 'audio/webm')).toBe(`${employeeId}/${callId}/audio.webm`);
    expect(recordingStoragePath(employeeId, callId, 'audio/mp4')).toBe(`${employeeId}/${callId}/audio.m4a`);
  });

  it('does not use public URLs in the recording service', () => {
    const src = readFileSync(resolve('src/features/telemarketing/services/callRecordingService.ts'), 'utf8');
    expect(src).not.toMatch(/getPublicUrl/);
    expect(src).toMatch(/createSignedUrl/);
    expect(src).toMatch(/telemarketing-recordings/);
  });

  it('returns false when MediaRecorder is unavailable', async () => {
    await expect(startCallRecording()).resolves.toBe(false);
  });

  it('stop without an active recorder returns null and does not throw', async () => {
    await expect(stopCallRecording()).resolves.toBeNull();
  });

  it('upload failure returns failed and does not throw', async () => {
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await expect(
      uploadCallRecording({
        callId: '22222222-2222-4222-8222-222222222222',
        employeeId: '11111111-1111-4111-8111-111111111111',
        blob,
      }),
    ).resolves.toEqual({ status: 'failed', path: null, mime: 'audio/webm' });
  });

  it('signed URL helper never falls back to a public URL', async () => {
    await expect(createRecordingSignedUrl('uid/call/audio.webm')).resolves.toBeNull();
  });

  it('returns false when the user denies the microphone', async () => {
    vi.stubGlobal('MediaRecorder', class {
      static isTypeSupported() {
        return true;
      }
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });
    await expect(startCallRecording()).resolves.toBe(false);
  });
});
